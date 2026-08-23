import { v } from "convex/values";
import { action, ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { DEF_TEAM_FPIDS, currentSeason } from "./client";
import { mapRosterPositions, mapScoringSettings } from "./leagueSettingsMapping";
import type { Scoring } from "../scoring";

// Sleeper's real, documented consumer API - same base fetchCurrentNflWeek
// uses (see ./state.ts), as opposed to the undocumented api.sleeper.com
// projections/stats endpoints in ./client.ts. No auth required.
const LEAGUE_API_BASE_URL = "https://api.sleeper.app/v1";

interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  players: string[] | null;
  // Player ids this roster has designated as keepers for the upcoming
  // draft - set by the commissioner/owner in Sleeper's own UI, independent
  // of whether that draft has actually run yet (unlike draftPicks.is_keeper
  // on the /draft/{id}/picks endpoint, which stays empty until the draft
  // itself executes - confirmed live against a real pre_draft-status
  // league). This is the only place Sleeper exposes pre-draft keeper
  // selections. Absent/null means the league doesn't use Sleeper's keeper
  // feature, or this owner hasn't picked any yet.
  keepers?: string[] | null;
  settings?: {
    waiver_budget_used?: number;
  };
}

async function fetchSleeperJson<T>(path: string): Promise<T> {
  const response = await fetch(`${LEAGUE_API_BASE_URL}${path}`);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Sleeper API request failed: ${response.status} ${response.statusText}` +
        (body ? ` - ${body}` : ""),
    );
  }
  return await response.json();
}

async function fetchSleeperLeagueJson<T>(
  sleeperLeagueId: string,
  path: string,
): Promise<T> {
  return await fetchSleeperJson<T>(`/league/${sleeperLeagueId}${path}`);
}

// A Sleeper roster/draft-pick player id is either a numeric player_id (skill
// positions - same ids used everywhere else in this app as fpid) or a team
// abbreviation string for DST (Sleeper models defenses as players keyed by
// team, e.g. "SF") - translate those through the same synthetic ids
// DEF_TEAM_FPIDS uses for our own DST rows (see ./client.ts). Anything that's
// neither (a bye-week/practice-squad id we don't track) maps to null.
function sleeperPlayerIdToFpid(playerId: string): number | null {
  if (DEF_TEAM_FPIDS[playerId] !== undefined) {
    return DEF_TEAM_FPIDS[playerId];
  }
  const numeric = Number(playerId);
  return Number.isFinite(numeric) ? numeric : null;
}

function toFpids(players: string[] | null): number[] {
  if (!players) return [];
  const fpids: number[] = [];
  for (const player of players) {
    const fpid = sleeperPlayerIdToFpid(player);
    if (fpid !== null) fpids.push(fpid);
  }
  return fpids;
}

// Pulls every mapped team's current roster + FAAB spend from the linked
// Sleeper league (see schema.ts's seasons.sleeperLeagueId and
// seasonTeams.sleeperRosterId) and replaces rosterPlayers/faabSpent for
// each. Manually triggered only (a "Sync Roster & FAAB" button) - unlike the
// daily projections cron, in-season rosters don't need to be fresh on a
// schedule, just fresh whenever the user is about to check bid suggestions.
export const syncLeagueRoster = action({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx: ActionCtx, args): Promise<{ syncedTeams: number }> => {
    const { season } = await ctx.runQuery(
      internal.season.rosterPlayers.requireOwnedSeasonForSync,
      { seasonId: args.seasonId },
    );
    if (!season.sleeperLeagueId) {
      throw new Error("This league isn't linked to a Sleeper league yet.");
    }

    const rosters = await fetchSleeperLeagueJson<SleeperRoster[]>(
      season.sleeperLeagueId,
      "/rosters",
    );
    const rosterById = new Map(
      rosters.map((roster) => [String(roster.roster_id), roster]),
    );

    const teams: Doc<"seasonTeams">[] = await ctx.runQuery(
      internal.draft.teams.listSeasonTeamsInternal,
      { seasonId: args.seasonId },
    );

    let syncedTeams = 0;
    for (const team of teams) {
      if (!team.sleeperRosterId) continue;
      const roster = rosterById.get(team.sleeperRosterId);
      if (!roster) continue;

      await ctx.runMutation(internal.season.rosterPlayers.replaceRosterForTeam, {
        seasonId: args.seasonId,
        teamId: team._id as Id<"seasonTeams">,
        fpids: toFpids(roster.players),
        faabSpent: roster.settings?.waiver_budget_used ?? 0,
      });
      syncedTeams += 1;
    }

    return { syncedTeams };
  },
});

export interface SleeperKeeperSuggestion {
  teamId: Id<"seasonTeams">;
  fpid: number;
}

// Reads which players each linked team has already marked as a keeper in
// Sleeper (roster.keepers - see SleeperRoster's comment above), for the
// "Import Keepers from Sleeper" panel on the Keepers tab. Deliberately
// doesn't write anything itself - Sleeper only tells us WHO was kept, not
// at what price, so this just hands the frontend a list of (team, fpid)
// candidates to confirm a cost for and add via the normal addKeeper
// mutation (convex/draft/picks.ts), same as any other keeper. Re-run on
// demand (not auto-synced) since keeper selections can keep changing right
// up to the commissioner's deadline.
export const listSleeperKeeperSuggestions = action({
  args: { seasonId: v.id("seasons") },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<SleeperKeeperSuggestion[]> => {
    const { season } = await ctx.runQuery(
      internal.season.rosterPlayers.requireOwnedSeasonForSync,
      { seasonId: args.seasonId },
    );
    if (!season.sleeperLeagueId) {
      throw new Error("This league isn't linked to a Sleeper league yet.");
    }

    const rosters = await fetchSleeperLeagueJson<SleeperRoster[]>(
      season.sleeperLeagueId,
      "/rosters",
    );
    const rosterById = new Map(
      rosters.map((roster) => [String(roster.roster_id), roster]),
    );

    const teams: Doc<"seasonTeams">[] = await ctx.runQuery(
      internal.draft.teams.listSeasonTeamsInternal,
      { seasonId: args.seasonId },
    );

    const suggestions: SleeperKeeperSuggestion[] = [];
    for (const team of teams) {
      if (!team.sleeperRosterId) continue;
      const roster = rosterById.get(team.sleeperRosterId);
      if (!roster) continue;
      for (const fpid of toFpids(roster.keepers ?? null)) {
        suggestions.push({ teamId: team._id as Id<"seasonTeams">, fpid });
      }
    }
    return suggestions;
  },
});

interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  metadata?: { team_name?: string };
}

interface LeagueTeamRow {
  rosterId: string;
  ownerId: string;
  teamName: string;
}

// Shared by fetchSleeperLeagueTeams (Part 3's team-mapping step) and
// previewSleeperImport below (creation-time import) - both need "every
// roster in this league, joined to its owner's display name," just at
// different points in the app's lifecycle.
async function fetchLeagueTeamRows(
  sleeperLeagueId: string,
): Promise<{ rows: LeagueTeamRow[]; rosters: SleeperRoster[] }> {
  const [rosters, users] = await Promise.all([
    fetchSleeperLeagueJson<SleeperRoster[]>(sleeperLeagueId, "/rosters"),
    fetchSleeperLeagueJson<SleeperLeagueUser[]>(sleeperLeagueId, "/users"),
  ]);
  const userById = new Map(users.map((user) => [user.user_id, user]));
  const rows = rosters
    .filter((roster) => roster.owner_id)
    .map((roster) => {
      const user = userById.get(roster.owner_id as string);
      return {
        rosterId: String(roster.roster_id),
        ownerId: roster.owner_id as string,
        teamName:
          user?.metadata?.team_name || user?.display_name || "Unknown team",
      };
    });
  return { rows, rosters };
}

// Used by the team-mapping step in Settings (link each app draftTeams row to
// a real Sleeper roster/owner) - separate from syncLeagueRoster's rosters
// call since this needs owner display names, which /rosters doesn't include.
export const fetchSleeperLeagueTeams = action({
  args: { sleeperLeagueId: v.string() },
  handler: async (_ctx, args): Promise<LeagueTeamRow[]> => {
    const { rows } = await fetchLeagueTeamRows(args.sleeperLeagueId);
    return rows;
  },
});

interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
}

async function fetchSleeperUserByUsername(
  username: string,
): Promise<SleeperUser | null> {
  return await fetchSleeperJson<SleeperUser | null>(
    `/user/${encodeURIComponent(username)}`,
  );
}

interface SleeperLeagueSummary {
  league_id: string;
  name: string;
  season: string;
}

// Resolves a Sleeper username to that account's user_id, then lists their
// leagues for the current NFL season - lets the linking/import UI offer a
// league picker (like the Yahoo flow's listMyYahooLeagues) instead of
// requiring the user to dig a numeric league id out of Sleeper's URL. Both
// endpoints are public/unauthenticated, same as everything else in this
// file - Sleeper has no login concept for this app to hook into, a username
// is just a public lookup key.
export const listSleeperLeaguesForUsername = action({
  args: { username: v.string() },
  handler: async (
    _ctx,
    args,
  ): Promise<{
    sleeperUserId: string;
    leagues: Array<{ leagueId: string; name: string; season: string }>;
  }> => {
    const username = args.username.trim();
    if (!username) {
      throw new Error("Enter a Sleeper username.");
    }
    const user = await fetchSleeperUserByUsername(username);
    if (!user) {
      throw new Error(`No Sleeper user found for username "${username}".`);
    }
    const leagues = await fetchSleeperJson<SleeperLeagueSummary[]>(
      `/user/${user.user_id}/leagues/nfl/${currentSeason()}`,
    );
    return {
      sleeperUserId: user.user_id,
      leagues: leagues.map((league) => ({
        leagueId: league.league_id,
        name: league.name,
        season: league.season,
      })),
    };
  },
});

interface SleeperLeagueSettings {
  league_id: string;
  name: string;
  season: string;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings?: { rec?: number };
  previous_league_id?: string | null;
  draft_id?: string | null;
}

async function fetchSleeperLeagueSettings(
  sleeperLeagueId: string,
): Promise<SleeperLeagueSettings> {
  return await fetchSleeperLeagueJson<SleeperLeagueSettings>(
    sleeperLeagueId,
    "",
  );
}

interface SleeperDraft {
  draft_id: string;
  type: "snake" | "auction" | "linear";
}

interface SleeperDraftPick {
  player_id: string;
  metadata?: { amount?: string };
}

export interface PreviousSeasonTeamPreview {
  rosterId: string;
  ownerId: string;
  teamName: string;
  players: Array<{ fpid: number; price: number | undefined }>;
}

export interface PreviousSeasonPreview {
  season: string;
  isAuction: boolean;
  teams: PreviousSeasonTeamPreview[];
}

// Best-effort: a missing/unreachable previous league, a non-auction draft, or
// any other hiccup just means "no price data" rather than failing the whole
// import - see Part 4's plan doc on why keeper-price seeding degrades
// gracefully instead of requiring exact auction history.
async function fetchPreviousSeasonPreview(
  previousLeagueId: string,
): Promise<PreviousSeasonPreview | undefined> {
  try {
    const [prevSettings, { rows, rosters }] = await Promise.all([
      fetchSleeperLeagueSettings(previousLeagueId),
      fetchLeagueTeamRows(previousLeagueId),
    ]);

    let priceByPlayerId = new Map<string, number>();
    let isAuction = false;
    if (prevSettings.draft_id) {
      try {
        const draft = await fetchSleeperJson<SleeperDraft>(
          `/draft/${prevSettings.draft_id}`,
        );
        isAuction = draft.type === "auction";
        if (isAuction) {
          const picks = await fetchSleeperJson<SleeperDraftPick[]>(
            `/draft/${prevSettings.draft_id}/picks`,
          );
          priceByPlayerId = new Map(
            picks
              .map((pick): [string, number] => [
                pick.player_id,
                Number(pick.metadata?.amount),
              ])
              .filter(([, amount]) => Number.isFinite(amount)),
          );
        }
      } catch {
        // No draft history available - proceed with rosters only, no prices.
      }
    }

    const rosterByOwnerId = new Map(rosters.map((r) => [r.owner_id, r]));
    const teams: PreviousSeasonTeamPreview[] = rows.map((row) => {
      const roster = rosterByOwnerId.get(row.ownerId);
      const players = (roster?.players ?? [])
        .map((playerId) => {
          const fpid = sleeperPlayerIdToFpid(playerId);
          if (fpid === null) return null;
          return { fpid, price: priceByPlayerId.get(playerId) };
        })
        .filter((p): p is { fpid: number; price: number | undefined } => p !== null);
      return { ...row, players };
    });

    return { season: prevSettings.season, isAuction, teams };
  } catch {
    return undefined;
  }
}

export interface SleeperImportPreview {
  name: string;
  season: string;
  teamCount: number;
  scoring: Scoring;
  rosterSlots: ReturnType<typeof mapRosterPositions>["rosterSlots"];
  flexPositions: ReturnType<typeof mapRosterPositions>["flexPositions"];
  superflexPositions: ReturnType<typeof mapRosterPositions>["superflexPositions"];
  droppedSlots: string[];
  teams: LeagueTeamRow[];
  previousSeason: PreviousSeasonPreview | undefined;
}

// Powers the "Import from Sleeper" league-creation wizard (see Part 4 of the
// plan doc): one round trip that returns everything needed to pre-fill
// SettingsForm, the team/self-mapping step, and (if a prior season with an
// auction draft is found) enough data to seed keeper price history. No auth
// check, same as fetchSleeperLeagueTeams above - this only ever reads
// Sleeper's own public data, nothing in our DB.
export const previewSleeperImport = action({
  args: { sleeperLeagueId: v.string() },
  handler: async (_ctx, args): Promise<SleeperImportPreview> => {
    const settings = await fetchSleeperLeagueSettings(args.sleeperLeagueId);
    const mapped = mapRosterPositions(settings.roster_positions ?? []);
    const scoring = mapScoringSettings(settings.scoring_settings);
    const { rows: teams } = await fetchLeagueTeamRows(args.sleeperLeagueId);

    const previousSeason = settings.previous_league_id
      ? await fetchPreviousSeasonPreview(settings.previous_league_id)
      : undefined;

    return {
      name: settings.name,
      season: settings.season,
      teamCount: settings.total_rosters,
      scoring,
      rosterSlots: mapped.rosterSlots,
      flexPositions: mapped.flexPositions,
      superflexPositions: mapped.superflexPositions,
      droppedSlots: mapped.droppedSlots,
      teams,
      previousSeason,
    };
  },
});
