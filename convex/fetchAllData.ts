import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { requireSuperAdmin } from "./fantasyPros/client";

// Runs every working data-fetch across both providers. players/projections/
// rankings come from Sleeper (see convex/sleeper/); news/injuries/player
// points still come from FantasyPros, which works fine for those.
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
    await ctx.runAction(api.fantasyPros.injuries.fetchInjuries, {});
    await ctx.runAction(api.fantasyPros.playerPoints.fetchAllPlayerPoints, {
      scoring: "PPR",
      ...(args.season ? { year: args.season } : {}),
    });
  },
});
