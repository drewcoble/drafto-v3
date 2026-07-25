import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { positionValidator } from "./positions";
import { scoringValidator } from "./scoring";

export const getPlayerPoints = query({
  args: { position: positionValidator, week: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("playerPoints")
      .withIndex("by_position_week", (q) =>
        q.eq("position", args.position).eq("week", args.week),
      )
      .collect();
  },
});

export const upsertPlayerPoints = mutation({
  args: {
    season: v.string(),
    scoring: scoringValidator,
    rows: v.array(
      v.object({
        fpid: v.number(),
        position: positionValidator,
        week: v.string(),
        points: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;

    for (const row of args.rows) {
      const existing = await ctx.db
        .query("playerPoints")
        .withIndex("by_season_week_fpid", (q) =>
          q
            .eq("season", args.season)
            .eq("week", row.week)
            .eq("fpid", row.fpid),
        )
        .filter((q) => q.eq(q.field("scoring"), args.scoring))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          points: row.points,
          fetchedAt: now,
        });
        updated += 1;
      } else {
        await ctx.db.insert("playerPoints", {
          fpid: row.fpid,
          season: args.season,
          week: row.week,
          position: row.position,
          scoring: args.scoring,
          points: row.points,
          fetchedAt: now,
        });
        inserted += 1;
      }
    }

    return { inserted, updated };
  },
});
