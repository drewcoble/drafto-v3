import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { requireSuperAdmin } from "./fantasyPros/client";

// Runs every working data-fetch across both providers. players/projections/
// rankings/injuries/player-points all come from Sleeper (see convex/sleeper/);
// news still comes from FantasyPros, the only remaining reason
// FANTASYPROS_API_KEY is needed.
export const fetchAll = action({
  args: {
    week: v.string(),
    season: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    await requireSuperAdmin(ctx);

    await ctx.runAction(api.sleeper.projections.fetchProjections, {
      week: args.week,
      ...(args.season ? { season: args.season } : {}),
    });
    await ctx.runAction(api.fantasyPros.news.fetchNews, {});
    await ctx.runAction(api.sleeper.playerPoints.fetchAllPlayerPoints, {
      ...(args.season ? { year: args.season } : {}),
    });
  },
});
