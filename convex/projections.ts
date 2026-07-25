import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { positionValidator, POSITIONS } from "./positions";

export const getProjections = query({
  args: { position: positionValidator, week: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("projections")
      .withIndex("by_position_week", (q) =>
        q.eq("position", args.position).eq("week", args.week),
      )
      .collect();

    return rows.sort((a, b) => b.pointsPpr - a.pointsPpr);
  },
});

// All 5 positions' projections in one call, for the combined players table -
// avoids 5 separate subscriptions client-side. Unsorted; callers rank as needed.
export const getAllProjections = query({
  args: { week: v.string() },
  handler: async (ctx, args) => {
    const results = [];
    for (const position of POSITIONS) {
      const rows = await ctx.db
        .query("projections")
        .withIndex("by_position_week", (q) =>
          q.eq("position", position).eq("week", args.week),
        )
        .collect();
      results.push(...rows);
    }
    return results;
  },
});

export const upsertProjections = mutation({
  args: {
    position: positionValidator,
    season: v.string(),
    week: v.string(),
    rows: v.array(
      v.object({
        fpid: v.number(),
        name: v.string(),
        team: v.union(v.string(), v.null()),
        pointsStd: v.number(),
        pointsPpr: v.number(),
        pointsHalf: v.number(),
        stats: v.record(v.string(), v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("projections")
      .withIndex("by_position_week", (q) =>
        q.eq("position", args.position).eq("week", args.week),
      )
      .collect();

    const existingByFpid = new Map(existing.map((row) => [row.fpid, row]));
    const now = Date.now();
    const seen = new Set<number>();

    for (const row of args.rows) {
      seen.add(row.fpid);
      const match = existingByFpid.get(row.fpid);

      if (match) {
        await ctx.db.patch(match._id, {
          name: row.name,
          team: row.team,
          pointsStd: row.pointsStd,
          pointsPpr: row.pointsPpr,
          pointsHalf: row.pointsHalf,
          stats: row.stats,
          fetchedAt: now,
        });
      } else {
        await ctx.db.insert("projections", {
          fpid: row.fpid,
          season: args.season,
          week: args.week,
          position: args.position,
          name: row.name,
          team: row.team,
          pointsStd: row.pointsStd,
          pointsPpr: row.pointsPpr,
          pointsHalf: row.pointsHalf,
          stats: row.stats,
          fetchedAt: now,
        });
      }
    }

    // Drop players that disappeared from this position+week (e.g. off the board)
    let removed = 0;
    for (const row of existing) {
      if (!seen.has(row.fpid)) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }

    return { upserted: args.rows.length, removed };
  },
});
