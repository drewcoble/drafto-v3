import { v } from "convex/values";
import { mutation, query, internalQuery, type MutationCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id, Doc } from "./_generated/dataModel";
import { positionValidator } from "./positions";
import { scoringValidator } from "./scoring";
import { invalidateDraftValues, refreshDraftValuesForLeague } from "./draftValues";
import { ensureValueGapsCached } from "./valueGaps";
import { requireSeasonOwner, requireRealDraft } from "./draft/auth";

// Mirrors src/constants/general.ts's WEEK - the single season-long
// draft-prep dataset every Draft Room query reads (not a real NFL week). See
// convex/draft/tiers.ts for why convex/ duplicates rather than imports
// frontend constants.
const DRAFT_PREP_WEEK = "0";

const rosterSlotsValidator = v.object({
  QB: v.number(),
  RB: v.number(),
  WR: v.number(),
  TE: v.number(),
  DST: v.number(),
  K: v.number(),
  FLEX: v.number(),
  SUPERFLEX: v.number(),
  BENCH: v.number(),
});

export interface SeasonWithLeagueName extends Doc<"seasons"> {
  name: string;
}

// Every season across every league this user owns, each carrying its
// league's display name - what the app calls "a league" in the UI (the
// picker, route params, etc) is really one season at a time, since a
// league's durable identity (leagues) has no format/roster fields of its
// own to display.
export const listSeasons = query({
  args: {},
  handler: async (ctx): Promise<SeasonWithLeagueName[]> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("You must be signed in.");
    }
    const leagues = await ctx.db
      .query("leagues")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();
    const result: SeasonWithLeagueName[] = [];
    for (const league of leagues) {
      const seasons = await ctx.db
        .query("seasons")
        .withIndex("by_league", (q) => q.eq("leagueId", league._id))
        .collect();
      for (const season of seasons) {
        result.push({ ...season, name: league.name });
      }
    }
    return result;
  },
});

// Every season across every owner, no auth scoping - only for
// fetchAllData's daily draftValues cache refresh (convex/fetchAllData.ts),
// which runs as a super-admin action with no signed-in "owner" of its own.
export const listAllSeasons = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("seasons").collect();
  },
});

// Creates a league, its first season, and that season's one real draft, all
// atomically - the UI still presents this as "create a league," but under
// the split model that's three rows now, not one.
export const createLeague = mutation({
  args: {
    name: v.string(),
    teamCount: v.number(),
    salaryCap: v.number(),
    scoring: scoringValidator,
    rosterSlots: rosterSlotsValidator,
    flexPositions: v.array(positionValidator),
    superflexPositions: v.array(positionValidator),
    // Set when this league is created via the "Import from Sleeper" wizard
    // (see convex/sleeper/league.ts's previewSleeperImport) - the league is
    // linked from creation, so it never needs the separate Season Settings
    // linking step Part 3 built for leagues that started out unlinked.
    sleeperLeagueId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("You must be signed in.");
    }
    const now = Date.now();
    const { name, sleeperLeagueId, ...seasonFields } = args;

    const leagueId = await ctx.db.insert("leagues", {
      ownerId: userId,
      name,
      createdAt: now,
    });

    const thisSeason = String(new Date().getFullYear());
    const seasonId = await ctx.db.insert("seasons", {
      leagueId,
      year: thisSeason,
      ...seasonFields,
      ...(sleeperLeagueId ? { sleeperLeagueId } : {}),
      createdAt: now,
    });

    const draftId = await ctx.db.insert("drafts", {
      seasonId,
      kind: "real",
      name,
      status: "setup",
      createdAt: now,
    });

    // Seed this league's draftValues cache (and valueGaps, if this scoring
    // format hasn't been seeded by another league yet) immediately, rather
    // than leaving it empty until the next daily cron run - an empty cache
    // forces every Draft Room subscription onto the expensive live-compute
    // path (see convex/draftValues.ts / convex/valueGaps.ts cache comments).
    await refreshDraftValuesForLeague(ctx, {
      draftId,
      week: DRAFT_PREP_WEEK,
      scoring: args.scoring,
    });
    await ensureValueGapsCached(ctx, {
      week: DRAFT_PREP_WEEK,
      scoring: args.scoring,
      lastSeason: String(Number(thisSeason) - 1),
    });

    return seasonId;
  },
});

export const updateSeason = mutation({
  args: {
    id: v.id("seasons"),
    name: v.string(),
    teamCount: v.number(),
    salaryCap: v.number(),
    scoring: scoringValidator,
    rosterSlots: rosterSlotsValidator,
    flexPositions: v.array(positionValidator),
    superflexPositions: v.array(positionValidator),
  },
  handler: async (ctx, args) => {
    const { id, name, ...fields } = args;
    const { league } = await requireSeasonOwner(ctx, id);
    await ctx.db.patch(id, fields);
    if (league.name !== name) {
      await ctx.db.patch(league._id, { name });
    }
    // Every field here (teamCount, salaryCap, scoring, rosterSlots,
    // flex/superflexPositions) feeds getDraftValues' $ engine - see
    // convex/draftValues.ts.
    const draft = await requireRealDraft(ctx, id);
    await invalidateDraftValues(ctx, draft._id);
    return await ctx.db.get(id);
  },
});

// Builds a synthetic prior-season entry for a just-created league from an
// imported Sleeper league's previous-season roster/auction results (see
// convex/sleeper/league.ts's previewSleeperImport), inserted as an earlier
// season of the SAME league - seasons.by_league_year naturally orders it
// before the new season, no separate lineage-chain field needed the way
// draftSettings.clonedFromId used to require. The tradeoff (same as before):
// a fabricated season shows up in that league's history/delete-cascade like
// a real one.
export const importPreviousSeasonHistory = mutation({
  args: {
    newSeasonId: v.id("seasons"),
    season: v.string(),
    sleeperLeagueId: v.string(),
    // Sleeper user id of "me" in the imported league, used only to flag
    // which synthetic team is isSelf (cosmetic - getPlayerPriceHistory
    // returns prices for every fpid league-wide regardless of which team
    // held them, so this doesn't affect keeper suggestions themselves).
    selfOwnerId: v.optional(v.string()),
    teams: v.array(
      v.object({
        ownerId: v.string(),
        teamName: v.string(),
        players: v.array(
          v.object({
            fpid: v.number(),
            price: v.optional(v.number()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { season: newSeason, league } = await requireSeasonOwner(
      ctx,
      args.newSeasonId,
    );

    const existing = await ctx.db
      .query("seasons")
      .withIndex("by_league_year", (q) =>
        q.eq("leagueId", league._id).eq("year", args.season),
      )
      .first();
    if (existing) {
      throw new Error("This league already has a linked prior season.");
    }

    const now = Date.now();
    const historySeasonId = await ctx.db.insert("seasons", {
      leagueId: league._id,
      year: args.season,
      teamCount: args.teams.length,
      salaryCap: newSeason.salaryCap,
      scoring: newSeason.scoring,
      rosterSlots: newSeason.rosterSlots,
      flexPositions: newSeason.flexPositions,
      superflexPositions: newSeason.superflexPositions,
      sleeperLeagueId: args.sleeperLeagueId,
      createdAt: now,
    });
    const historyDraftId = await ctx.db.insert("drafts", {
      seasonId: historySeasonId,
      kind: "real",
      name: `${league.name} (Imported ${args.season})`,
      status: "complete",
      createdAt: now,
    });

    let sequence = 0;
    for (const [index, team] of args.teams.entries()) {
      const teamId = await ctx.db.insert("seasonTeams", {
        seasonId: historySeasonId,
        name: team.teamName,
        isSelf: args.selfOwnerId !== undefined && team.ownerId === args.selfOwnerId,
        order: index,
        createdAt: now,
      });
      for (const player of team.players) {
        // Skip players this app has no identity/position record for (e.g.
        // retired since that season) - draftPicks.position is required and
        // there's nowhere else to source it from.
        const playerDoc = await ctx.db
          .query("players")
          .withIndex("by_fpid", (q) => q.eq("fpid", player.fpid))
          .first();
        if (!playerDoc) continue;
        sequence += 1;
        await ctx.db.insert("draftPicks", {
          draftId: historyDraftId,
          sequence,
          fpid: player.fpid,
          position: playerDoc.position,
          teamId,
          price: player.price ?? 1,
          createdAt: now,
        });
      }
    }

    return historySeasonId;
  },
});

// Toggles the Keepers tab on/off for this season - independent of
// updateSeason's batched Save so flipping it doesn't require re-submitting
// the whole league settings form. Doesn't touch keeperRules itself: turning
// keepers back on later restores whatever formula/tier config was already
// there.
export const setUseKeepers = mutation({
  args: {
    id: v.id("seasons"),
    useKeepers: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireSeasonOwner(ctx, args.id);
    await ctx.db.patch(args.id, { useKeepers: args.useKeepers });
    return await ctx.db.get(args.id);
  },
});

// Links (or unlinks, passing null) this season to a real Sleeper league for
// in-season roster/FAAB syncing - see convex/sleeper/league.ts. Separate from
// updateSeason so linking doesn't require resubmitting the whole league
// form, same reasoning as setUseKeepers above.
export const setSleeperLeagueId = mutation({
  args: {
    id: v.id("seasons"),
    sleeperLeagueId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await requireSeasonOwner(ctx, args.id);
    await ctx.db.patch(args.id, {
      sleeperLeagueId: args.sleeperLeagueId ?? undefined,
    });
    return await ctx.db.get(args.id);
  },
});

// Yahoo equivalent of setSleeperLeagueId above.
export const setYahooLeagueKey = mutation({
  args: {
    id: v.id("seasons"),
    yahooLeagueKey: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await requireSeasonOwner(ctx, args.id);
    await ctx.db.patch(args.id, {
      yahooLeagueKey: args.yahooLeagueKey ?? undefined,
    });
    return await ctx.db.get(args.id);
  },
});

// League-wide default in-season FAAB pool per team (null clears it back to
// unset - see seasonTeams.faabBudgetOverride for the per-team override).
export const setFaabBudget = mutation({
  args: {
    id: v.id("seasons"),
    faabBudget: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    await requireSeasonOwner(ctx, args.id);
    if (args.faabBudget !== null && args.faabBudget < 0) {
      throw new Error("FAAB budget can't be negative.");
    }
    await ctx.db.patch(args.id, { faabBudget: args.faabBudget ?? undefined });
    return await ctx.db.get(args.id);
  },
});

// Cascade-deletes everything scoped to one season - teams, rosters, every
// draft (mock or real) and its picks/nominations/live-plan/tag state, then
// the season row itself. Factored out of deleteLeague below so it can run
// once per season in a league.
async function deleteOneSeason(ctx: MutationCtx, seasonId: Id<"seasons">) {
  const teams = await ctx.db
    .query("seasonTeams")
    .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
    .collect();
  for (const team of teams) {
    for (const row of await ctx.db
      .query("rosterPlayers")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.delete(team._id);
  }

  const drafts = await ctx.db
    .query("drafts")
    .withIndex("by_season", (q) => q.eq("seasonId", seasonId))
    .collect();
  for (const draft of drafts) {
    for (const row of await ctx.db
      .query("draftPicks")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query("draftNominations")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query("draftBudgetPlans")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query("draftLiveBudgetOverrides")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query("draftPlayerTags")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query("draftNominationTurns")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query("draftValues")
      .withIndex("by_draft_week_scoring", (q) => q.eq("draftId", draft._id))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.delete(draft._id);
  }

  await ctx.db.delete(seasonId);
}

// Permanently deletes a league AND every season in its history - a league
// here means the whole multi-season history, not just the one season the
// user happened to have selected, so there's no "prior season became
// disconnected" leftover to worry about. Called from the League Details
// page's Delete League button, whose confirmation modal lists every season
// this will take with it (fetched via listSeasonLineage) since this can't be
// undone.
export const deleteLeague = mutation({
  args: { id: v.id("seasons") },
  handler: async (ctx, args) => {
    const { league } = await requireSeasonOwner(ctx, args.id);
    const seasons = await ctx.db
      .query("seasons")
      .withIndex("by_league", (q) => q.eq("leagueId", league._id))
      .collect();
    for (const season of seasons) {
      await deleteOneSeason(ctx, season._id);
    }
    await ctx.db.delete(league._id);
    return null;
  },
});
