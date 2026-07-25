import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getLatestNews = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("news")
      .withIndex("by_published_at")
      .order("desc")
      .take(args.limit ?? 20);
  },
});

// `news` grows without bound (upsertNews never prunes old items, unlike
// injuries/projections), so a global "latest N" query would eventually miss
// older items for players who just aren't in the most recent batch. Instead,
// look up per fpid via the index - bounded to whatever roster is being
// displayed, not the whole table.
export const getNewsForFpids = query({
  args: { fpids: v.array(v.number()) },
  handler: async (ctx, args) => {
    const results = await Promise.all(
      args.fpids.map((fpid) =>
        ctx.db
          .query("news")
          .withIndex("by_fpid", (q) => q.eq("fpid", fpid))
          .collect(),
      ),
    );
    return results.flat();
  },
});

export const upsertNews = mutation({
  args: {
    rows: v.array(
      v.object({
        newsId: v.number(),
        fpid: v.number(),
        team: v.string(),
        title: v.string(),
        description: v.string(),
        impact: v.string(),
        categories: v.array(v.string()),
        link: v.string(),
        author: v.string(),
        publishedAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;

    for (const row of args.rows) {
      const existing = await ctx.db
        .query("news")
        .withIndex("by_news_id", (q) => q.eq("newsId", row.newsId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { ...row, fetchedAt: now });
        updated += 1;
      } else {
        await ctx.db.insert("news", { ...row, fetchedAt: now });
        inserted += 1;
      }
    }

    return { inserted, updated };
  },
});
