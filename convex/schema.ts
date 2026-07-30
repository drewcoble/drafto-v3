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
    // Per-category box score for that week (pass_yd, rush_td, rec, etc.) -
    // same shape as projections.stats. Optional because rows written before
    // this field existed predate it and aren't backfilled automatically;
    // every row written going forward always includes it (see
    // convex/sleeper/playerPoints.ts). Reused across STD/PPR/HALF rows for
    // the same fpid/week since the box score itself doesn't vary by scoring
    // format, only the derived `points` total does.
    stats: v.optional(v.record(v.string(), v.number())),
    fetchedAt: v.number(),
  })
    .index("by_position_week", ["position", "week"])
    .index("by_season_week_fpid", ["season", "week", "fpid"])
    // Powers "this player's whole game log for one season" (see
    // getPlayerGameLog in convex/playerPoints.ts) - mirrors
    // playerSeasonStats's by_fpid_season_scoring index.
    .index("by_fpid_season_scoring", ["fpid", "season", "scoring"]),

  // Season-long digest of playerPoints, maintained incrementally by
  // upsertPlayerPoints (see convex/playerPoints.ts) rather than recomputed at
  // read time. Exists solely so convex/valueGaps.ts can read one row per
  // (fpid, season, scoring) instead of scanning all 18 weeks - that
  // week-by-week scan across 4 positions was measured (via `npx convex
  // insights`) exceeding the 32k-documents-per-transaction limit. A 0-point
  // week is treated as "didn't play" here too (mirrors valueGaps.ts's old
  // in-query logic), so totalPoints/gamesPlayed already reflect that filter -
  // readers don't need to re-derive it.
  playerSeasonStats: defineTable({
    fpid: v.number(),
    season: v.string(),
    position: positionValidator,
    scoring: scoringValidator,
    totalPoints: v.number(),
    gamesPlayed: v.number(),
    // Running sum of points^2 across counted games - not itself a consumer
    // field, but the sufficient statistic that lets variance/stdDeviation be
    // updated incrementally (each week's contribution is independently
    // additive) instead of recomputed from every game each write. Not yet
    // read anywhere - stored now so a future "consistency rating" feature
    // doesn't need a playerPoints rescan/backfill to get it.
    sumSquaredPoints: v.number(),
    // Population variance/stdDeviation of per-game points, derived from the
    // running sums above on every write (see applySeasonStatsDelta in
    // convex/playerPoints.ts).
    variance: v.number(),
    stdDeviation: v.number(),
    updatedAt: v.number(),
  })
    // Read path: valueGaps.ts pulls every fpid for one position/season/scoring.
    .index("by_position_season_scoring", ["position", "season", "scoring"])
    // Write path: upsertPlayerPoints looks up (and updates) one player's row
    // at a time as each week's points come in.
    .index("by_fpid_season_scoring", ["fpid", "season", "scoring"]),

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

  // Append-only history of injury-status *changes*, captured going forward
  // from whenever this table was introduced - Sleeper's injury_status field
  // (above) is a "right now" value with no historical archive, so past
  // seasons can never be backfilled here. A new row is only inserted when a
  // player's status actually differs from their most-recently-stored row
  // (see convex/injurySnapshots.ts's recordSnapshots) - deliberately NOT
  // one-row-per-fetch, since the daily fetch cadence spans every team's
  // Thursday/Sunday/Monday games within a single week number, and
  // overwriting by week could silently clobber an earlier-in-the-week
  // designation with unrelated later information.
  injurySnapshots: defineTable({
    fpid: v.number(),
    season: v.string(),
    // The week this change was captured during (Sleeper's state.week, or
    // "0" outside the regular season) - not necessarily the only status
    // change that occurred that week, just when this row was recorded.
    week: v.string(),
    status: v.string(),
    statusShort: v.string(),
    injuryType: v.string(),
    comment: v.string(),
    fetchedAt: v.number(),
  })
    // "This player's most-recently-stored snapshot" - the change-detection
    // check in recordSnapshots (query this, order desc, take first()).
    .index("by_fpid", ["fpid"])
    // "Every change this player had during one season" - the game log's
    // read (src/components/PlayerSeasonGameLog.tsx), grouped by week
    // client-side since a week can have more than one row.
    .index("by_fpid_season", ["fpid", "season"]),

  // League/format settings for the $ value calculation (convex/draftValues.ts).
  // One row per draft config; only one is seeded for now, but this is
  // designed to be user-configurable per-draft later.
  draftSettings: defineTable({
    ownerId: v.id("users"),
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
      K: v.number(),
      FLEX: v.number(),
      SUPERFLEX: v.number(),
      BENCH: v.number(),
    }),
    // Which positions are eligible for the FLEX slot(s), e.g. ["RB","WR","TE"]
    flexPositions: v.array(positionValidator),
    // Which positions are eligible for the SUPERFLEX slot(s), e.g.
    // ["QB","RB","WR","TE"]
    superflexPositions: v.array(positionValidator),
    createdAt: v.number(),
    // Free-text season label (e.g. "2026"), set when this row is created via
    // cloneDraftSettings - absent on rows never advanced into a season chain.
    season: v.optional(v.string()),
    // Points at the immediately-prior season's draftSettings row, forming an
    // implicit linked list of seasons for one league rather than a separate
    // leagues table. Written ONCE, at insert time, by
    // convex/draft/history.ts's cloneDraftSettings - no mutation ever patches
    // this on an existing row, so the backward lineage walk in
    // listSeasonLineage/getPlayerPriceHistory is structurally cycle-free, not
    // just defensively bounded. Keep it that way: do not add a way to
    // repoint this field after creation.
    clonedFromId: v.optional(v.id("draftSettings")),
    // Optional custom nomination order, independent of draftTeams.order
    // (which is just team creation/display order) - absent means nomination
    // order is fully manual (the original behavior: any team can be picked
    // from the nominate dropdown every time, no suggested turn). Both are
    // always set/cleared together by convex/draft/nominationOrder.ts.
    nominationOrder: v.optional(v.array(v.id("draftTeams"))),
    nominationOrderMode: v.optional(
      v.union(v.literal("linear"), v.literal("snake")),
    ),
  })
    .index("by_owner", ["ownerId"])
    // Finds the season (if any) already cloned FROM a given row - used both
    // to walk the lineage forward and to enforce "at most one forward clone
    // per source row" in cloneDraftSettings.
    .index("by_cloned_from", ["clonedFromId"]),

  // One team per participant in a live draft, including the owner's own team
  // (isSelf: true) - keeping "me" as a real row makes budget math and the
  // League tab symmetric across every team instead of special-casing one.
  draftTeams: defineTable({
    draftSettingsId: v.id("draftSettings"),
    name: v.string(),
    isSelf: v.boolean(),
    order: v.number(),
    createdAt: v.number(),
  }).index("by_draft", ["draftSettingsId"]),

  // A completed auction result - one row per player won. `sequence` is
  // monotonic per draft and is the sole source of truth for "last pick"
  // (undo) and "pick N of M"; nothing stores a running budget balance
  // anywhere, so REMAINING is always salaryCap - sum(picks.price) and undo
  // is a plain delete.
  draftPicks: defineTable({
    draftSettingsId: v.id("draftSettings"),
    sequence: v.number(),
    fpid: v.number(),
    position: positionValidator,
    teamId: v.id("draftTeams"),
    price: v.number(),
    // Which roster slot this fills, e.g. "RB2" - only set for the self
    // team's picks, since only self has a budget plan to reconcile against.
    planSlotKey: v.optional(v.string()),
    // True for a pre-draft keeper assignment (see convex/draft/picks.ts's
    // addKeeper), absent/false for a normal auction result. Optional rather
    // than required so existing rows need no backfill - `eq("isKeeper",
    // true)` never matches a row where the field is absent either way.
    isKeeper: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_draft", ["draftSettingsId"])
    .index("by_draft_sequence", ["draftSettingsId", "sequence"])
    .index("by_draft_fpid", ["draftSettingsId", "fpid"])
    // Scoped to isKeeper===true so draftValues.ts can read "just the
    // keepers" without its query being invalidated by every live auction
    // pick - see the comment on that read in convex/draftValues.ts.
    .index("by_draft_keeper", ["draftSettingsId", "isKeeper"]),

  // The single live "on the block" nomination for a draft, if any. Kept as
  // its own table rather than a field on draftSettings so that fast-changing
  // bid-stepper clicks don't re-render every subscriber of the draftSettings
  // row (e.g. App.tsx's league selector). At most one row per
  // draftSettingsId.
  draftNominations: defineTable({
    draftSettingsId: v.id("draftSettings"),
    fpid: v.number(),
    position: positionValidator,
    nominatingTeamId: v.id("draftTeams"),
    currentBid: v.number(),
    createdAt: v.number(),
  }).index("by_draft", ["draftSettingsId"]),

  // The self team's PRE-DRAFT planned $ allocation per roster slot (keys
  // from expandRosterSlots, e.g. "RB1"/"FLEX"/"BN3") - one row per draft,
  // edited from the Setup app's Budget tab, before entering the Draft Room.
  // This is the baseline cloneDraftSettings carries forward to next season -
  // draftLiveBudgetOverrides (below) deliberately isn't, since it's specific
  // to how one draft actually played out.
  draftBudgetPlans: defineTable({
    draftSettingsId: v.id("draftSettings"),
    amounts: v.record(v.string(), v.number()),
    overspendBehavior: v.union(
      v.literal("bench"),
      v.literal("spread"),
      v.literal("ask"),
    ),
    updatedAt: v.number(),
  }).index("by_draft", ["draftSettingsId"]),

  // Live, in-draft overrides to the pre-draft plan above - only the slots
  // the user has explicitly reallocated during THIS draft are stored here;
  // every other slot keeps mirroring draftBudgetPlans.amounts live, so an
  // edit to the pre-draft plan after the draft has started still flows
  // through for any slot nobody has touched yet. The effective live amount
  // for a slot is `overrides[key] ?? draftBudgetPlans.amounts[key] ?? 0` -
  // see convex/draft/plan.ts's getLiveBudgetPlan, which computes that merge
  // server-side so every consumer (matchPlanSlot, useTeamBudget, MyTeamTab)
  // reads one already-merged shape instead of re-deriving it. One row per
  // draft, absence means "fully mirroring the pre-draft plan, nothing
  // overridden yet".
  draftLiveBudgetOverrides: defineTable({
    draftSettingsId: v.id("draftSettings"),
    overrides: v.record(v.string(), v.number()),
    // Falls back to draftBudgetPlans.overspendBehavior when unset, same
    // mirror-until-touched relationship as `overrides` has with `amounts`.
    overspendBehavior: v.optional(
      v.union(v.literal("bench"), v.literal("spread"), v.literal("ask")),
    ),
    updatedAt: v.number(),
  }).index("by_draft", ["draftSettingsId"]),

  // A manual "target"/"avoid" annotation on a player, scoped to one draft -
  // pure user preference, not derived from anything, so (unlike tiers) this
  // genuinely needs to be stored rather than computed. One row per
  // (draftSettingsId, fpid); absence of a row means "no opinion".
  draftPlayerTags: defineTable({
    draftSettingsId: v.id("draftSettings"),
    fpid: v.number(),
    tag: v.union(v.literal("target"), v.literal("avoid")),
    updatedAt: v.number(),
  })
    .index("by_draft", ["draftSettingsId"])
    .index("by_draft_fpid", ["draftSettingsId", "fpid"]),

  // Live "whose turn is it to nominate" pointer - only meaningful when the
  // league's draftSettings.nominationOrder is configured. At most one row
  // per draft. currentTeamId is null when the host has explicitly cleared
  // "whose turn" (e.g. running a pre-cycle top-X auction with no fixed
  // nominator before the regular rotation begins) - distinct from no row
  // existing yet, which just means the order was configured but the cycle
  // hasn't been started. direction only matters in "snake" mode (see
  // convex/draft/nominationOrder.ts's nextNominator) - it's what lets the
  // team at each end of the order take two consecutive turns before
  // reversing, matching a standard snake draft's round-boundary behavior.
  // Always overridable by the host (see setCurrentNominator) - this is a
  // suggestion the nominate UI defaults to, never an enforced restriction.
  draftNominationTurns: defineTable({
    draftSettingsId: v.id("draftSettings"),
    currentTeamId: v.union(v.id("draftTeams"), v.null()),
    direction: v.union(v.literal(1), v.literal(-1)),
    updatedAt: v.number(),
  }).index("by_draft", ["draftSettingsId"]),

  // Precomputed cache of convex/valueGaps.ts's getAllValueGaps result, keyed
  // by the same (week, scoring, lastSeason) triple the query is called with.
  // That computation reads full projections/rankings/playerSeasonStats docs
  // (the `stats` blob included) across 4 positions on every call - cheap
  // once, but every open PlayersTable/PlayersLeftTab/PlayerDetailModal
  // subscription recomputing it from scratch was the single largest
  // contributor to this project's Convex database-bandwidth usage. Refreshed
  // once daily by refreshValueGaps, scheduled from fetchAllData right after
  // the underlying data changes - getAllValueGaps reads this table first and
  // only falls back to a live recompute on a cache miss (e.g. a
  // week/scoring/lastSeason combo the daily refresh hasn't covered yet).
  valueGaps: defineTable({
    week: v.string(),
    scoring: scoringValidator,
    lastSeason: v.string(),
    fpid: v.number(),
    position: positionValidator,
    direction: v.union(
      v.literal("undervalued"),
      v.literal("overvalued"),
      v.literal("breakout"),
      v.literal("falloff"),
    ),
    gap: v.number(),
    lastYearPpg: v.number(),
    lastYearGames: v.number(),
    lastYearRank: v.number(),
    projRank: v.number(),
    adpRank: v.number(),
    poolSize: v.number(),
  }).index("by_week_scoring_lastSeason", ["week", "scoring", "lastSeason"]),

  // Precomputed cache of convex/draftValues.ts's getDraftValues result, keyed
  // by (draftSettingsId, week, scoring) - same reasoning as valueGaps above:
  // that computation reads every active position's full projections docs
  // (the unused `stats` blob included) plus keepers, and was recomputed from
  // scratch on every one of its 5+ call sites' subscriptions. Refreshed once
  // daily by refreshDraftValues (one call per league, at that league's own
  // scoring format - see fetchAllData.ts), and eagerly invalidated whenever
  // something that actually changes the computation happens off the daily
  // cycle (a keeper added/removed, or draftSettings edited - see
  // invalidateDraftValues, called from convex/draft/picks.ts and
  // convex/draftSettings.ts). getDraftValues reads this table first and only
  // falls back to a live recompute on a cache miss (a combo the daily
  // refresh hasn't covered yet, or one just invalidated).
  draftValues: defineTable({
    draftSettingsId: v.id("draftSettings"),
    week: v.string(),
    scoring: scoringValidator,
    fpid: v.number(),
    name: v.string(),
    team: v.union(v.string(), v.null()),
    position: positionValidator,
    points: v.number(),
    positionRank: v.number(),
    replacementPoints: v.number(),
    usedFallback: v.boolean(),
    valueOverReplacement: v.number(),
    dollarValue: v.number(),
    // Read/write path (getDraftValues/refreshDraftValues) queries the full
    // key; the invalidation path (a keeper change or settings edit doesn't
    // know which week/scoring combos are cached) queries just the
    // draftSettingsId prefix to clear all of them at once.
  }).index("by_draft_week_scoring", ["draftSettingsId", "week", "scoring"]),
});
