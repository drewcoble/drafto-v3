import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const espnFormatValidator = v.union(
  v.literal("standard"),
  v.literal("ppr"),
  v.literal("superflex"),
);

// Upserts ESPN's draft-kit ranks for one format (see convex/espn/
// rankings.ts, which calls this once per format), which has already
// resolved each ESPN player down to an fpid (via players.espnId directly,
// or its name+position fallback match) before calling this - this mutation
// trusts that resolution rather than re-deriving it, so it costs one read
// (the existing-row lookup) plus a write per row instead of re-joining
// against players itself.
export const upsertEspnValues = internalMutation({
  args: {
    format: espnFormatValidator,
    season: v.string(),
    rows: v.array(
      v.object({
        fpid: v.number(),
        rank: v.number(),
        auctionValue: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const row of args.rows) {
      const existing = await ctx.db
        .query("standardValues")
        .withIndex("by_platform_format_season_fpid", (q) =>
          q
            .eq("platform", "espn")
            .eq("format", args.format)
            .eq("season", args.season)
            .eq("fpid", row.fpid),
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          rank: row.rank,
          auctionValue: row.auctionValue,
          fetchedAt: now,
        });
      } else {
        await ctx.db.insert("standardValues", {
          platform: "espn",
          format: args.format,
          season: args.season,
          fpid: row.fpid,
          rank: row.rank,
          auctionValue: row.auctionValue,
          fetchedAt: now,
        });
      }
    }

    return { upserted: args.rows.length };
  },
});
