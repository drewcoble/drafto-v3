import { v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireSuperAdmin, currentSeason } from "./fantasyPros/client";
import { fetchCurrentNflWeek } from "./sleeper/state";
import { Scoring } from "./scoring";

// valueGaps.getAllValueGaps is only ever called with the current draft week
// (see src/constants/general.ts's WEEK), so these are the only combos worth
// precomputing daily - see convex/valueGaps.ts's cache comment.
const VALUE_GAP_SCORINGS: Scoring[] = ["STD", "HALF", "PPR"];

// Runs every working data-fetch across both providers. players/projections/
// rankings/injuries/player-points all come from Sleeper (see convex/sleeper/);
// news still comes from FantasyPros, the only remaining reason
// FANTASYPROS_API_KEY is needed.
export const fetchAll = action({
  args: {
    // Omit to auto-detect via Sleeper's state endpoint - this is what the
    // daily cron does (convex/crons.ts), since cron arguments are static at
    // deploy time and can't be recomputed each run. Pass explicitly only
    // for a deliberate manual/backfill fetch.
    week: v.optional(v.string()),
    season: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    await requireSuperAdmin(ctx);

    const week = args.week ?? (await fetchCurrentNflWeek());
    const season = args.season ?? currentSeason();

    await ctx.runAction(api.sleeper.projections.fetchProjections, {
      week,
      ...(args.season ? { season: args.season } : {}),
    });
    await ctx.runAction(api.fantasyPros.news.fetchNews, {});
    await ctx.runAction(api.sleeper.playerPoints.fetchAllPlayerPoints, {
      ...(args.season ? { year: args.season } : {}),
    });

    // Refresh the valueGaps cache now that the projections/rankings/
    // playerSeasonStats data it's derived from has changed - see
    // convex/valueGaps.ts's cache comment. Only 3 combos (one per scoring
    // format) since week/lastSeason are effectively fixed for the current
    // draft cycle.
    const lastSeason = String(Number(season) - 1);
    for (const scoring of VALUE_GAP_SCORINGS) {
      await ctx.runMutation(internal.valueGaps.refreshValueGaps, {
        week,
        scoring,
        lastSeason,
      });
    }

    // Same caching story for draftValues.getDraftValues - see
    // convex/draftValues.ts's cache comment. Unlike valueGaps (global,
    // capped at 3 scoring-format combos), this is one combo per league at
    // that league's own scoring format (leagues don't let callers pick an
    // independent scoring view - see PlayersTable.tsx), so refresh every
    // league that exists.
    const leagues = await ctx.runQuery(
      internal.draftSettings.listAllDraftSettings,
      {},
    );
    for (const league of leagues) {
      await ctx.runMutation(internal.draftValues.refreshDraftValues, {
        draftSettingsId: league._id,
        week,
        scoring: league.scoring,
      });
    }
  },
});
