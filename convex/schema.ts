import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { positionValidator } from "./positions";
import { scoringValidator } from "./scoring";

export default defineSchema({
  ...authTables,

  userProfiles: defineTable({
    // Optional + still indexed during migration away from tokenIdentifier;
    // see convex/users.ts for the legacy-lookup/self-heal path.
    userId: v.optional(v.id("users")),
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.union(v.string(), v.null()),
    role: v.union(v.literal("super-admin"), v.literal("user")),
    createdAt: v.number(),
  })
    .index("by_user_id", ["userId"])
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  // Player identity, derived as a side effect of the Sleeper projections
  // fetch (see convex/sleeper/projections.ts) - Sleeper's player_id is the
  // fpid used everywhere except DST, which has no numeric id upstream (see
  // DEF_TEAM_FPIDS in convex/sleeper/client.ts). The single source of truth
  // for name/team/position - projections/rankings/news/injuries all
  // reference players by fpid rather than duplicating identity.
  players: defineTable({
    fpid: v.number(),
    name: v.string(),
    position: positionValidator,
    team: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  }).index("by_fpid", ["fpid"]),

  // From Sleeper's projections endpoint (see convex/sleeper/projections.ts).
  // One row per (position, week, fpid); a single fetch returns all three
  // scoring variants at once.
  projections: defineTable({
    fpid: v.number(),
    season: v.string(),
    week: v.string(),
    position: positionValidator,
    // Snapshotted from players at fetch time so the projections table page
    // can render without an extra lookup per row; players stays authoritative.
    name: v.string(),
    team: v.union(v.string(), v.null()),
    pointsStd: v.number(),
    pointsPpr: v.number(),
    pointsHalf: v.number(),
    // Flexible stat map since QB/RB/WR/TE/DST each expose different columns
    // (e.g. "rec_yd", "rush_td", "pass_att"). See convex/sleeper/projections.ts.
    stats: v.record(v.string(), v.number()),
    fetchedAt: v.number(),
  })
    .index("by_position_week", ["position", "week"])
    .index("by_position_week_fpid", ["position", "week", "fpid"]),

  // From Sleeper's projections endpoint's adp_* fields - a season/week
  // snapshot like projections, so ADP movement over time is preserved rather
  // than only ever holding the latest value. Sleeper has no "expert
  // consensus rank" concept (that was FantasyPros-specific) - only ADP.
  rankings: defineTable({
    fpid: v.number(),
    season: v.string(),
    week: v.string(),
    position: positionValidator,
    adpStd: v.number(),
    adpPpr: v.number(),
    adpHalf: v.number(),
    fetchedAt: v.number(),
  })
    .index("by_position_week", ["position", "week"])
    .index("by_position_week_fpid", ["position", "week", "fpid"]),

  // From /nfl/news. Append-only feed keyed by the API's own article id.
  news: defineTable({
    newsId: v.number(),
    fpid: v.number(),
    team: v.string(), // "FA" appears literally for free agents, not null
    title: v.string(),
    description: v.string(),
    impact: v.string(),
    categories: v.array(v.string()),
    link: v.string(),
    author: v.string(),
    publishedAt: v.number(),
    fetchedAt: v.number(),
  })
    .index("by_news_id", ["newsId"])
    .index("by_fpid", ["fpid"])
    .index("by_published_at", ["publishedAt"]),

  // From /nfl/{year}/player-points. Actual (not projected) fantasy points,
  // exploded from the API's nested `weeks` map into one row per week so this
  // table is index-compatible with projections/rankings for comparison views.
  playerPoints: defineTable({
    fpid: v.number(),
    season: v.string(),
    week: v.string(),
    position: positionValidator,
    scoring: scoringValidator,
    points: v.number(),
    fetchedAt: v.number(),
  })
    .index("by_position_week", ["position", "week"])
    .index("by_season_week_fpid", ["season", "week", "fpid"]),

  // From /nfl/injuries. Current-status only (the endpoint has no season/week)
  // - one row per currently-injured player, deleted when they drop off the
  // API's list (recovered), mirroring how upsertProjections handles removals.
  injuries: defineTable({
    fpid: v.number(),
    status: v.string(),
    statusShort: v.string(),
    injuryType: v.string(),
    comment: v.string(),
    irWeeks: v.array(v.number()),
    probabilityOfPlaying: v.union(v.number(), v.null()),
    practice1: v.union(v.string(), v.null()),
    practice2: v.union(v.string(), v.null()),
    practice3: v.union(v.string(), v.null()),
    practiceReportInjuryType: v.union(v.string(), v.null()),
    updatedAt: v.number(),
    fetchedAt: v.number(),
  }).index("by_fpid", ["fpid"]),

  // League/format settings for the $ value calculation (convex/draftValues.ts).
  // One row per draft config; only one is seeded for now, but this is
  // designed to be user-configurable per-draft later.
  draftSettings: defineTable({
    name: v.string(),
    teamCount: v.number(),
    salaryCap: v.number(),
    // Default scoring format for this league - drives both the $ value
    // calculation and the Players table's point/sort display.
    scoring: scoringValidator,
    rosterSlots: v.object({
      QB: v.number(),
      RB: v.number(),
      WR: v.number(),
      TE: v.number(),
      DST: v.number(),
      FLEX: v.number(),
      BENCH: v.number(),
    }),
    // Which positions are eligible for the FLEX slot(s), e.g. ["RB","WR","TE"]
    flexPositions: v.array(positionValidator),
    // When the actual replacement-rank player isn't in our data yet (e.g. we
    // need RB25 but only have 10 RBs), use this % of the last available
    // player's points instead.
    replacementFallbackPct: v.number(),
    createdAt: v.number(),
  }),
});
