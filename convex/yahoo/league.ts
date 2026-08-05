import { v } from "convex/values";
import { action, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { fetchYahooApi } from "./client";
import { withYahooToken } from "./oauth";

/**
 * Yahoo's `?format=json` output is a direct translation of its XML schema -
 * NOT verified against a live response (see YAHOO.md at the project root).
 * From general knowledge, a resource's fields typically arrive as an array
 * of small single-key objects to be merged
 * (`[{"league_key": "..."}, {"name": "..."}, ...]`), and collections arrive
 * as an object keyed by stringified index plus a "count" field
 * (`{"0": {...}, "1": {...}, "count": 2}`) instead of a plain JSON array.
 * The two helpers below are written to be resilient to that shape rather
 * than assuming one exact path, since a wrong guess at an exact path would
 * silently return nothing instead of a clear error - but they still need a
 * real authenticated response to confirm against.
 */

// Merges an array of small field objects (Yahoo's field-list pattern) into
// one - no-op passthrough for anything not shaped that way.
function mergeYahooFields(node: unknown): Record<string, unknown> {
  if (Array.isArray(node)) {
    const merged: Record<string, unknown> = {};
    for (const entry of node) {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        Object.assign(merged, entry);
      }
    }
    return merged;
  }
  if (node && typeof node === "object") {
    return node as Record<string, unknown>;
  }
  return {};
}

// Recursively finds every node that appears as the value of `key` at any
// depth in a Yahoo JSON tree - e.g. findNodesByKey(json, "league") finds
// every league resource regardless of how deeply the surrounding
// users/games/leagues wrapper nests it.
function findNodesByKey(node: unknown, key: string): unknown[] {
  const found: unknown[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v2] of Object.entries(value as Record<string, unknown>)) {
        if (k === key) found.push(v2);
        else visit(v2);
      }
    }
  };
  visit(node);
  return found;
}

export const listMyYahooLeagues = action({
  args: {},
  handler: async (ctx): Promise<Array<{ leagueKey: string; name: string }>> => {
    const userId: Id<"users"> = await ctx.runQuery(
      internal.yahoo.oauth.requireSignedInUserId,
      {},
    );
    return await withYahooToken(ctx, userId, async (accessToken) => {
      const json = await fetchYahooApi<unknown>(
        accessToken,
        "/users;use_login=1/games;game_keys=nfl/leagues",
      );
      const seen = new Map<string, { leagueKey: string; name: string }>();
      for (const node of findNodesByKey(json, "league")) {
        const fields = mergeYahooFields(node);
        if (typeof fields.league_key !== "string") continue;
        seen.set(fields.league_key, {
          leagueKey: fields.league_key,
          name: typeof fields.name === "string" ? fields.name : "Unknown league",
        });
      }
      return [...seen.values()];
    });
  },
});

export const fetchYahooLeagueTeams = action({
  args: { leagueKey: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ teamKey: string; teamName: string; managerName: string }>> => {
    const userId: Id<"users"> = await ctx.runQuery(
      internal.yahoo.oauth.requireSignedInUserId,
      {},
    );
    return await withYahooToken(ctx, userId, async (accessToken) => {
      const json = await fetchYahooApi<unknown>(
        accessToken,
        `/league/${args.leagueKey}/teams`,
      );
      return findNodesByKey(json, "team")
        .map((node) => {
          const fields = mergeYahooFields(node);
          const managerFields = findNodesByKey(node, "manager").map((m) =>
            mergeYahooFields(m),
          );
          const managerName = managerFields[0]?.nickname;
          return {
            teamKey: typeof fields.team_key === "string" ? fields.team_key : "",
            teamName: typeof fields.name === "string" ? fields.name : "Unknown team",
            managerName:
              typeof managerName === "string" ? managerName : "Unknown manager",
          };
        })
        .filter((team) => team.teamKey !== "");
    });
  },
});

// Yahoo's own player ids share nothing with Sleeper's (the numbering
// convex/sleeper/client.ts's DEF_TEAM_FPIDS/player_id ids come from, which
// is what this app's fpid actually is) - there's no official crosswalk, so
// this resolves a Yahoo roster to fpids by matching full name + position
// against convex/schema.ts's players table. Inherently imperfect (name
// punctuation/suffix mismatches, genuine name collisions) - see YAHOO.md.
// Team defenses are skipped entirely rather than guessed at, since Yahoo
// names them by team ("49ers") while our DST rows are keyed by Sleeper's own
// synthetic ids - matching those reliably would need a second, separate
// team-name crosswalk this doesn't attempt.
function normalizeYahooPlayerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'-]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv)\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const resolveFpidsByName = internalQuery({
  args: {
    players: v.array(v.object({ name: v.string(), position: v.string() })),
  },
  handler: async (ctx, args): Promise<number[]> => {
    const allPlayers: Doc<"players">[] = await ctx.db.query("players").collect();
    const byKey = new Map<string, number>();
    for (const player of allPlayers) {
      byKey.set(
        `${normalizeYahooPlayerName(player.name)}|${player.position}`,
        player.fpid,
      );
    }
    const fpids: number[] = [];
    for (const player of args.players) {
      if (player.position === "DEF" || player.position === "DST") continue;
      const fpid = byKey.get(
        `${normalizeYahooPlayerName(player.name)}|${player.position}`,
      );
      if (fpid !== undefined) fpids.push(fpid);
    }
    return fpids;
  },
});

function extractRosterPlayers(
  playerNodes: unknown[],
): Array<{ name: string; position: string }> {
  return playerNodes
    .map((node) => {
      const fields = mergeYahooFields(node);
      const nameField = fields.name as { full?: string } | undefined;
      const fullName = nameField?.full;
      const position = fields.display_position;
      if (typeof fullName !== "string" || typeof position !== "string") {
        return null;
      }
      return { name: fullName, position };
    })
    .filter((p): p is { name: string; position: string } => p !== null);
}

// Pulls every mapped team's current roster + FAAB spend from the linked
// Yahoo league (see schema.ts's seasons.yahooLeagueKey and
// seasonTeams.yahooTeamKey) and replaces rosterPlayers/faabSpent for each -
// same shape/purpose as convex/sleeper/league.ts's syncLeagueRoster, sharing
// its replaceRosterForTeam write path (convex/season/rosterPlayers.ts).
export const syncYahooLeagueRoster = action({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args): Promise<{ syncedTeams: number }> => {
    const { season, league } = await ctx.runQuery(
      internal.season.rosterPlayers.requireOwnedSeasonForSync,
      { seasonId: args.seasonId },
    );
    if (!season.yahooLeagueKey) {
      throw new Error("This league isn't linked to a Yahoo league yet.");
    }

    const teams: Doc<"seasonTeams">[] = await ctx.runQuery(
      internal.draft.teams.listSeasonTeamsInternal,
      { seasonId: args.seasonId },
    );

    let syncedTeams = 0;
    await withYahooToken(ctx, league.ownerId, async (accessToken) => {
      for (const team of teams) {
        if (!team.yahooTeamKey) continue;

        const rosterJson = await fetchYahooApi<unknown>(
          accessToken,
          `/team/${team.yahooTeamKey}/roster`,
        );
        const rosterPlayers = extractRosterPlayers(
          findNodesByKey(rosterJson, "player"),
        );
        const fpids: number[] = await ctx.runQuery(
          internal.yahoo.league.resolveFpidsByName,
          { players: rosterPlayers },
        );

        // FAAB field name not confirmed live - see YAHOO.md. Best-effort:
        // a missing/unreachable field just leaves faabSpent at 0 rather
        // than failing the whole sync.
        let faabSpent = 0;
        try {
          const teamJson = await fetchYahooApi<unknown>(
            accessToken,
            `/team/${team.yahooTeamKey}`,
          );
          const teamNode = findNodesByKey(teamJson, "team")[0] ?? teamJson;
          const fields = mergeYahooFields(teamNode);
          const budgetUsed = fields.faab_balance ?? fields.waiver_budget_used;
          if (typeof budgetUsed === "string" || typeof budgetUsed === "number") {
            faabSpent = Number(budgetUsed) || 0;
          }
        } catch {
          // Leave faabSpent at 0.
        }

        await ctx.runMutation(internal.season.rosterPlayers.replaceRosterForTeam, {
          seasonId: args.seasonId,
          teamId: team._id as Id<"seasonTeams">,
          fpids,
          faabSpent,
        });
        syncedTeams += 1;
      }
    });

    return { syncedTeams };
  },
});
