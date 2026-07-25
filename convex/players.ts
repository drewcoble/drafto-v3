import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { positionValidator } from "./positions";

export const getPlayer = query({
  args: { fpid: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("players")
      .withIndex("by_fpid", (q) => q.eq("fpid", args.fpid))
      .first();
  },
});

export const upsertPlayers = mutation({
  args: {
    rows: v.array(
      v.object({
        fpid: v.number(),
        name: v.string(),
        position: positionValidator,
        team: v.union(v.string(), v.null()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;

    for (const row of args.rows) {
      const existing = await ctx.db
        .query("players")
        .withIndex("by_fpid", (q) => q.eq("fpid", row.fpid))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          name: row.name,
          position: row.position,
          team: row.team,
          updatedAt: now,
        });
        updated += 1;
      } else {
        await ctx.db.insert("players", {
          fpid: row.fpid,
          name: row.name,
          position: row.position,
          team: row.team,
          updatedAt: now,
        });
        inserted += 1;
      }
    }

    return { inserted, updated };
  },
});
