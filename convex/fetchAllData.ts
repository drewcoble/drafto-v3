import { v } from "convex/values";
import { action, internalAction, ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireSuperAdmin, currentSeason } from "./fantasyPros/client";
import { fetchCurrentNflWeek, fetchNflSeasonState } from "./sleeper/state";
import { Scoring } from "./scoring";

// valueGaps.getAllValueGaps is only ever called with the current draft week
// (see src/constants/general.ts's WEEK), so these are the only combos worth
// precomputing daily - see convex/valueGaps.ts's cache comment.
const VALUE_GAP_SCORINGS: Scoring[] = ["STD", "HALF", "PPR"];

// Shared by fetchAll (after a fresh external fetch) and refreshCaches (an
// on-demand repair with no external calls) - recomputes the valueGaps and
// draftValues caches from whatever projections/rankings/playerSeasonStats
// data already exists in the database.
async function refreshCachedComputations(
  ctx: ActionCtx,
  args: { week: string; season: string },
): Promise<void> {
  const lastSeason = String(Number(args.season) - 1);
  for (const scoring of VALUE_GAP_SCORINGS) {
    await ctx.runMutation(internal.valueGaps.refreshValueGaps, {
      week: args.week,
      scoring,
      lastSeason,
    });
  }

  const seasons = await ctx.runQuery(internal.leagues.listAllSeasons, {});
  for (const season of seasons) {
    const draft = await ctx.runQuery(internal.draft.fetchHelpers.getRealDraftInternal, {
      seasonId: season._id,
    });
    if (!draft) continue;
    await ctx.runMutation(internal.draftValues.refreshDraftValues, {
      draftId: draft._id,
      week: args.week,
      scoring: season.scoring,
    });
  }

  // Free-plan users get a shared, league-independent value set (see
  // convex/draftValues.ts's computeGenericDraftValues) instead of any real
  // league's numbers - refreshed for every scoring format so its cache is
  // never cold for whichever format a free user's league happens to use.
  for (const scoring of VALUE_GAP_SCORINGS) {
    await ctx.runMutation(internal.draftValues.refreshGenericDraftValues, {
      week: args.week,
      scoring,
    });
  }
}

// Runs every working data-fetch across both providers. players/projections/
// rankings/injuries/player-points all come from Sleeper (see convex/sleeper/);
// news still comes from FantasyPros, the only remaining reason
// FANTASYPROS_API_KEY is needed. Delegates to each source's *Internal action
// variant (not the public, requireSuperAdmin-gated one) - this function's own
// callers (fetchAll below, or fetchAllInternal from the cron) already decide
// once whether a human-auth check applies, so re-checking per sub-fetch would
// be redundant and (for the cron path) would break it - see fetchAllInternal.
async function fetchAllHandler(
  ctx: ActionCtx,
  args: { week?: string; season?: string },
): Promise<void> {
  const week = args.week ?? (await fetchCurrentNflWeek());
  const season = args.season ?? currentSeason();

  // Persist Sleeper's live week/season state (see convex/nflState.ts) -
  // independent of the week/season resolved above (which may be a manual
  // backfill override), so in-season tooling always sees the real current
  // week regardless of what this particular fetch was scoped to.
  const nflState = await fetchNflSeasonState();
  await ctx.runMutation(internal.nflState.upsertNflState, {
    season: nflState.season,
    week: String(nflState.week),
    seasonType: nflState.seasonType,
  });

  await ctx.runAction(internal.sleeper.projections.fetchProjectionsInternal, {
    week,
    ...(args.season ? { season: args.season } : {}),
  });
  await ctx.runAction(internal.fantasyPros.news.fetchNewsInternal, {});
  await ctx.runAction(
    internal.sleeper.playerPoints.fetchAllPlayerPointsInternal,
    { ...(args.season ? { year: args.season } : {}) },
  );

  // Refresh the valueGaps/draftValues caches now that the projections/
  // rankings/playerSeasonStats data they're derived from has changed - see
  // convex/valueGaps.ts and convex/draftValues.ts's cache comments.
  await refreshCachedComputations(ctx, { week, season });
}

export const fetchAll = action({
  args: {
    // Omit to auto-detect via Sleeper's state endpoint - this is what the
    // daily cron does (convex/crons.ts), since cron arguments are static at
    // deploy time and can't be recomputed each run. Pass explicitly only
    // for a deliberate manual/backfill fetch.
    week: v.optional(v.string()),
    season: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    await fetchAllHandler(ctx, args);
  },
});

// Cron-safe counterpart with no human-auth check - a cron-triggered function
// call runs with no signed-in user (ctx.auth.getUserIdentity() is always null
// there), so the requireSuperAdmin-gated fetchAll above can never succeed
// from convex/crons.ts. This is what the daily cron actually calls; the
// public fetchAll stays available for a manual/backfill run from the CLI or
// dashboard.
export const fetchAllInternal = internalAction({
  args: {
    week: v.optional(v.string()),
    season: v.optional(v.string()),
  },
  handler: fetchAllHandler,
});

// Cache-only counterpart to fetchAll - recomputes the valueGaps/draftValues
// caches from whatever projections/rankings/playerSeasonStats data already
// exists, without calling Sleeper/FantasyPros. For manually repairing the
// cache (e.g. it was never seeded because the daily cron hasn't run yet)
// without waiting for or forcing a full external refetch.
export const refreshCaches = action({
  args: {
    week: v.optional(v.string()),
    season: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    await requireSuperAdmin(ctx);

    const week = args.week ?? (await fetchCurrentNflWeek());
    const season = args.season ?? currentSeason();

    await refreshCachedComputations(ctx, { week, season });
  },
});
