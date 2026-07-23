import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  userProfiles: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.union(v.string(), v.null()),
    fantasyProsSessionCookie: v.union(v.string(), v.null()),
    fantasyProsUsername: v.union(v.string(), v.null()),
    fantasyProsConnectedAt: v.union(v.number(), v.null()),
    fantasyProsEnabled: v.boolean(),
    role: v.union(v.literal("super-admin"), v.literal("user")),
    createdAt: v.number(),
  }).index("by_token_identifier", ["tokenIdentifier"]),

  projections: defineTable({
    position: v.union(
      v.literal("QB"),
      v.literal("RB"),
      v.literal("WR"),
      v.literal("TE"),
      v.literal("DST"),
    ),
    // "draft" for pre-season draft projections, or a week number as a string ("1", "2", ...)
    week: v.string(),
    playerName: v.string(),
    team: v.union(v.string(), v.null()),
    // Flexible stat map since QB/RB/WR/TE/DST each expose different columns
    // (e.g. "PASSING_YDS", "RUSHING_TDS", "MISC_FL"). See convex/scrape.ts.
    stats: v.record(v.string(), v.number()),
    fpts: v.number(),
    scrapedAt: v.number(),
  })
    .index("by_position_week", ["position", "week"])
    .index("by_position_week_player", ["position", "week", "playerName"]),
});
