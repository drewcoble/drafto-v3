import { v } from "convex/values";
import { query, mutation, internalQuery, type QueryCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { POSITIONS } from "../positions";
import { scoringValidator, pointsForScoring, type Scoring } from "../scoring";
import type { DraftValueRow } from "../draftValues";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireDraftOwner } from "./auth";
import { optimizeLineup, type LineupResult } from "./lineupOptimizer";
import {
  computeConsistencyThresholds,
  getConsistencyLabel,
  type ConsistencyLabel,
} from "./consistency";
import { hasProAccess } from "../billing/entitlements";

type Position = (typeof POSITIONS)[number];

interface ResolvedPick {
  pickId: Id<"draftPicks">;
  fpid: number;
  name: string;
  team: string | null;
  position: Position;
  teamId: Id<"seasonTeams">;
  price: number;
  sequence: number;
  planSlotKey: string | undefined;
  isKeeper: boolean;
  points: number;
  vor: number;
  // null for keepers - computeDraftValues excludes them from the pool
  // entirely, so there's no market $ estimate for a player never auctioned.
  dollarValue: number | null;
  surplus: number | null;
  // Only populated for keepers (null otherwise) - see estimateMarketValue:
  // an interpolated "what would this production have cost at auction"
  // figure, since keepers have no real dollarValue to compare against.
  // keeperSurplus = keeperEstimatedValue - price (the keeper discount).
  keeperEstimatedValue: number | null;
  keeperSurplus: number | null;
  // Labeled from the *prior* season's actual weekly output
  // (playerSeasonStats), same convention the live draft board already uses
  // (see PlayersLeftTab.tsx) - the current season has no games played yet
  // right after a draft, so there's nothing to label consistency from until
  // several weeks in.
  consistencyLabel: ConsistencyLabel | null;
}

interface RosterAward {
  teamId: Id<"seasonTeams">;
  teamName: string;
  count: number;
}

interface ValueCurvePoint {
  vor: number;
  dollarValue: number;
}

// Per-position VOR -> $ curve built from this draft's actual auctioned
// (non-keeper) players, anchored at (0, $1) since that's exactly the floor
// computeDraftValues' formula converges to as VOR approaches 0 (weight =
// VOR^FALLOFF_EXPONENT -> 0). Used to estimate what a keeper's production
// would have cost at auction, since keepers are excluded from the real
// value engine's pool entirely and have no dollarValue of their own.
function buildValueCurveByPosition(
  values: DraftValueRow[],
): Map<Position, ValueCurvePoint[]> {
  const byPosition = new Map<Position, ValueCurvePoint[]>();
  for (const row of values) {
    if (!byPosition.has(row.position)) {
      byPosition.set(row.position, [{ vor: 0, dollarValue: 1 }]);
    }
    byPosition
      .get(row.position)!
      .push({ vor: row.valueOverReplacement, dollarValue: row.dollarValue });
  }
  for (const curve of byPosition.values()) {
    curve.sort((a, b) => a.vor - b.vor);
  }
  return byPosition;
}

// Linear interpolation (or, past the best auctioned player at a position,
// extrapolation off the last two points' slope - rare, only hit when a
// top-tier player was kept) along one position's value curve. This is
// necessarily an estimate, not a real market price - keepers were never
// actually bid on.
function estimateMarketValue(
  vor: number,
  curve: ValueCurvePoint[] | undefined,
): number | null {
  if (!curve || curve.length === 0) return null;
  if (vor <= curve[0]!.vor) return curve[0]!.dollarValue;

  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i]!;
    const b = curve[i + 1]!;
    if (vor <= b.vor) {
      if (b.vor === a.vor) return b.dollarValue;
      const t = (vor - a.vor) / (b.vor - a.vor);
      return a.dollarValue + t * (b.dollarValue - a.dollarValue);
    }
  }

  const last = curve[curve.length - 1]!;
  const prev = curve[curve.length - 2] ?? { vor: 0, dollarValue: 1 };
  const slope =
    last.vor === prev.vor
      ? 0
      : (last.dollarValue - prev.dollarValue) / (last.vor - prev.vor);
  return last.dollarValue + slope * (vor - last.vor);
}

// Value surplus, VOR, and lineup-efficiency are on different scales, so each
// is percentile-ranked against the field before blending - see gradeTeams.
// Surplus is the primary driver (bargain-hunting is the most direct
// reading of "beat the market"); VOR rewards raw talent regardless of $;
// lineup efficiency rewards actually starting your best players. Tunable,
// same convention as draftValues.ts's FALLOFF_EXPONENT.
const SURPLUS_WEIGHT = 0.5;
const VOR_WEIGHT = 0.3;
const LINEUP_WEIGHT = 0.2;

// Cutoffs are deliberately centered around a percentile-normalized 50 (an
// exactly-average team across all three inputs) landing on a B, not a
// D/F - absolute-grading cutoffs (90+=A, <60=F) would fail most of a small
// league since the inputs are already mean~50 by construction. Adjustable.
const GRADE_BANDS: Array<{ min: number; letter: string }> = [
  { min: 90, letter: "A+" },
  { min: 80, letter: "A" },
  { min: 70, letter: "A-" },
  { min: 60, letter: "B+" },
  { min: 50, letter: "B" },
  { min: 40, letter: "B-" },
  { min: 30, letter: "C+" },
  { min: 20, letter: "C" },
  { min: 10, letter: "D" },
  { min: -Infinity, letter: "F" },
];

function letterForScore(score: number): string {
  // The last band's min is -Infinity, so find() always matches something -
  // the ?? "F" fallback only exists to satisfy strict-undefined checking.
  return GRADE_BANDS.find((band) => score >= band.min)?.letter ?? "F";
}

// Standard percentile rank: share of the field strictly below `value`, plus
// half credit for ties (including the value's own row) - range (0, 100].
// With a single team, there's no field to curve against, so default to 50
// (dead center) rather than dividing by zero.
function percentileRank(value: number, all: number[]): number {
  if (all.length <= 1) return 50;
  let below = 0;
  let equal = 0;
  for (const v of all) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return ((below + equal / 2) / all.length) * 100;
}

interface TeamRaw {
  teamId: Id<"seasonTeams">;
  teamName: string;
  isSelf: boolean;
  picks: ResolvedPick[];
  spent: number;
  surplusTotal: number;
  surplusByPosition: Record<Position, number>;
  vorTotal: number;
  vorByPosition: Record<Position, number>;
  efficiencyDollarsPerVor: number | null;
  bestPick: ResolvedPick | undefined;
  worstPick: ResolvedPick | undefined;
  bestKeeper: ResolvedPick | undefined;
  worstKeeper: ResolvedPick | undefined;
  lineup: LineupResult;
  reliableCount: number;
  boomBustCount: number;
  lowOutputCount: number;
}

// Shared by getDraftReportCard (a public query, gated on a signed-in Pro
// owner) and getReportCardDataForSummary (an internalQuery, called from the
// Gemini report-summary action with no signed-in caller) - both need the
// exact same computation, just reached via different auth paths. Takes
// draft/season as already-loaded docs rather than re-fetching, since each
// caller resolves them differently (requireDraftOwner vs. plain ctx.db.get).
async function computeReportCardData(
  ctx: QueryCtx,
  draft: Doc<"drafts">,
  season: Doc<"seasons">,
  args: { week: string; scoring: Scoring },
) {
  const { values }: { isGeneric: boolean; values: DraftValueRow[] } =
    await ctx.runQuery(api.draftValues.getDraftValues, {
      seasonId: draft.seasonId,
      week: args.week,
      scoring: args.scoring,
    });
  const valueByFpid = new Map(values.map((row) => [row.fpid, row]));

  const replacementByPosition = new Map<Position, number>();
  for (const row of values) {
    if (!replacementByPosition.has(row.position)) {
      replacementByPosition.set(row.position, row.replacementPoints);
    }
  }
  const valueCurveByPosition = buildValueCurveByPosition(values);

  // Consistency labels come from the *prior* completed season's actual
  // weekly results - the season this draft just started has no games
  // played yet, so labeling off it would be empty for everyone.
  const priorSeason = String(Number(season.year) - 1);
  const seasonStats = await ctx.runQuery(api.playerPoints.getAllSeasonStats, {
    season: priorSeason,
    scoring: args.scoring,
  });
  const statsByPosition = new Map<Position, typeof seasonStats>();
  for (const row of seasonStats) {
    const list = statsByPosition.get(row.position) ?? [];
    list.push(row);
    statsByPosition.set(row.position, list);
  }
  const consistencyByFpid = new Map<number, ConsistencyLabel>();
  for (const [position, rows] of statsByPosition) {
    const thresholds = computeConsistencyThresholds(position, rows);
    for (const row of rows) {
      const label = getConsistencyLabel(position, row, thresholds);
      if (label) consistencyByFpid.set(row.fpid, label);
    }
  }

  const teams = await ctx.db
    .query("seasonTeams")
    .withIndex("by_season", (q) => q.eq("seasonId", draft.seasonId))
    .collect();
  const picks = await ctx.db
    .query("draftPicks")
    .withIndex("by_draft_sequence", (q) => q.eq("draftId", draft._id))
    .collect();

  const resolved: ResolvedPick[] = [];
  for (const pick of picks) {
    const value = valueByFpid.get(pick.fpid);
    if (value) {
      resolved.push({
        pickId: pick._id,
        fpid: pick.fpid,
        name: value.name,
        team: value.team,
        position: pick.position,
        teamId: pick.teamId,
        price: pick.price,
        sequence: pick.sequence,
        planSlotKey: pick.planSlotKey,
        isKeeper: pick.isKeeper ?? false,
        points: value.points,
        vor: value.valueOverReplacement,
        dollarValue: value.dollarValue,
        surplus: value.dollarValue - pick.price,
        keeperEstimatedValue: null,
        keeperSurplus: null,
        consistencyLabel: consistencyByFpid.get(pick.fpid) ?? null,
      });
      continue;
    }

    // Keeper (or, defensively, any pick missing from the value engine's
    // output) - fall back to a direct projections lookup for points/VOR;
    // no market $ estimate exists for a player never auctioned.
    const projection = await ctx.db
      .query("projections")
      .withIndex("by_position_week_fpid", (q) =>
        q
          .eq("position", pick.position)
          .eq("week", args.week)
          .eq("fpid", pick.fpid),
      )
      .unique();
    const points = projection ? pointsForScoring(projection, args.scoring) : 0;
    const replacementPoints = replacementByPosition.get(pick.position) ?? 0;
    const vor = Math.max(points - replacementPoints, 0);
    const isKeeper = pick.isKeeper ?? false;
    const keeperEstimatedValue = isKeeper
      ? estimateMarketValue(vor, valueCurveByPosition.get(pick.position))
      : null;
    resolved.push({
      pickId: pick._id,
      fpid: pick.fpid,
      name: projection?.name ?? `Player ${pick.fpid}`,
      team: projection?.team ?? null,
      position: pick.position,
      teamId: pick.teamId,
      price: pick.price,
      sequence: pick.sequence,
      planSlotKey: pick.planSlotKey,
      isKeeper,
      points,
      vor,
      dollarValue: null,
      surplus: null,
      keeperEstimatedValue,
      keeperSurplus:
        keeperEstimatedValue !== null
          ? keeperEstimatedValue - pick.price
          : null,
      consistencyLabel: consistencyByFpid.get(pick.fpid) ?? null,
    });
  }

  const rawTeams: TeamRaw[] = teams.map((team) => {
    const teamPicks = resolved.filter((p) => p.teamId === team._id);
    const nonKeeperPicks = teamPicks.filter((p) => !p.isKeeper);

    const spent = teamPicks.reduce((sum, p) => sum + p.price, 0);

    const surplusByPosition = Object.fromEntries(
      POSITIONS.map((pos) => [pos, 0]),
    ) as Record<Position, number>;
    let surplusTotal = 0;
    for (const p of nonKeeperPicks) {
      surplusTotal += p.surplus ?? 0;
      surplusByPosition[p.position] += p.surplus ?? 0;
    }

    const vorByPosition = Object.fromEntries(
      POSITIONS.map((pos) => [pos, 0]),
    ) as Record<Position, number>;
    let vorTotal = 0;
    for (const p of teamPicks) {
      vorTotal += p.vor;
      vorByPosition[p.position] += p.vor;
    }

    const bestPick = nonKeeperPicks.reduce<ResolvedPick | undefined>(
      (best, p) => (!best || (p.surplus ?? 0) > (best.surplus ?? 0) ? p : best),
      undefined,
    );
    const worstPick = nonKeeperPicks.reduce<ResolvedPick | undefined>(
      (worst, p) => (!worst || (p.surplus ?? 0) < (worst.surplus ?? 0) ? p : worst),
      undefined,
    );

    const keeperPicks = teamPicks.filter(
      (p) => p.isKeeper && p.keeperSurplus !== null,
    );
    const bestKeeper = keeperPicks.reduce<ResolvedPick | undefined>(
      (best, p) =>
        !best || (p.keeperSurplus ?? 0) > (best.keeperSurplus ?? 0)
          ? p
          : best,
      undefined,
    );
    const worstKeeper = keeperPicks.reduce<ResolvedPick | undefined>(
      (worst, p) =>
        !worst || (p.keeperSurplus ?? 0) < (worst.keeperSurplus ?? 0)
          ? p
          : worst,
      undefined,
    );

    let reliableCount = 0;
    let boomBustCount = 0;
    let lowOutputCount = 0;
    for (const p of teamPicks) {
      if (p.consistencyLabel === "Reliable") reliableCount++;
      else if (p.consistencyLabel === "Boom/Bust") boomBustCount++;
      else if (p.consistencyLabel === "Low Output") lowOutputCount++;
    }

    const lineup = optimizeLineup(
      teamPicks.map((p) => ({
        fpid: p.fpid,
        position: p.position,
        points: p.points,
        sequence: p.sequence,
        ...(p.planSlotKey !== undefined
          ? { planSlotKey: p.planSlotKey }
          : {}),
      })),
      season.rosterSlots,
      season.flexPositions,
      season.superflexPositions,
    );

    return {
      teamId: team._id,
      teamName: team.name,
      isSelf: team.isSelf,
      picks: teamPicks,
      spent,
      surplusTotal,
      surplusByPosition,
      vorTotal,
      vorByPosition,
      efficiencyDollarsPerVor: vorTotal > 0 ? spent / vorTotal : null,
      bestPick,
      worstPick,
      bestKeeper,
      worstKeeper,
      lineup,
      reliableCount,
      boomBustCount,
      lowOutputCount,
    };
  });

  const surplusValues = rawTeams.map((t) => t.surplusTotal);
  const vorValues = rawTeams.map((t) => t.vorTotal);
  const lineupValues = rawTeams.map((t) => t.lineup.efficiencyPct);

  const teamReportCards = rawTeams.map((team) => {
    const surplusPct = percentileRank(team.surplusTotal, surplusValues);
    const vorPct = percentileRank(team.vorTotal, vorValues);
    const lineupPct = percentileRank(team.lineup.efficiencyPct, lineupValues);
    const gradeScore = Math.round(
      SURPLUS_WEIGHT * surplusPct +
        VOR_WEIGHT * vorPct +
        LINEUP_WEIGHT * lineupPct,
    );
    return { ...team, gradeScore, letter: letterForScore(gradeScore) };
  });

  const nonKeeperResolved = resolved.filter(
    (p) => !p.isKeeper && p.surplus !== null,
  );
  const bySurplusDesc = [...nonKeeperResolved].sort(
    (a, b) => (b.surplus ?? 0) - (a.surplus ?? 0),
  );
  const leagueSteals = bySurplusDesc.slice(0, 5);
  const leagueReaches = bySurplusDesc.slice(-5).reverse();

  const keeperResolved = resolved.filter(
    (p) => p.isKeeper && p.keeperSurplus !== null,
  );
  const byKeeperSurplusDesc = [...keeperResolved].sort(
    (a, b) => (b.keeperSurplus ?? 0) - (a.keeperSurplus ?? 0),
  );
  const leagueBestKeepers = byKeeperSurplusDesc.slice(0, 5);
  const leagueWorstKeepers = byKeeperSurplusDesc.slice(-5).reverse();

  // Only awarded when at least one team actually has a labeled player -
  // an all-zero league (e.g. every roster is rookies/first-year players
  // with no prior-season games) shouldn't crown a "Most Reliable Roster"
  // with a count of 0.
  let mostReliableRoster: RosterAward | null = null;
  let mostVolatileRoster: RosterAward | null = null;
  for (const team of teamReportCards) {
    if (
      team.reliableCount > 0 &&
      (!mostReliableRoster || team.reliableCount > mostReliableRoster.count)
    ) {
      mostReliableRoster = {
        teamId: team.teamId,
        teamName: team.teamName,
        count: team.reliableCount,
      };
    }
    if (
      team.boomBustCount > 0 &&
      (!mostVolatileRoster || team.boomBustCount > mostVolatileRoster.count)
    ) {
      mostVolatileRoster = {
        teamId: team.teamId,
        teamName: team.teamName,
        count: team.boomBustCount,
      };
    }
  }

  return {
    draftId: draft._id,
    week: args.week,
    scoring: args.scoring,
    teams: teamReportCards,
    leagueSteals,
    leagueReaches,
    leagueBestKeepers,
    leagueWorstKeepers,
    mostReliableRoster,
    mostVolatileRoster,
  };
}

export const getDraftReportCard = query({
  args: {
    seasonId: v.id("seasons"),
    week: v.string(),
    scoring: scoringValidator,
  },
  handler: async (ctx, args) => {
    const { season, draft } = await requireDraftOwner(ctx, args.seasonId);
    if (draft.status !== "complete") {
      return { status: "not_ready" as const };
    }

    // requireDraftOwner already confirmed a signed-in league owner - Report
    // Card is a Pro-only feature (see plan's monetization doc), so a free
    // user gets a typed "requires_upgrade" result instead of the computed
    // data, letting the frontend render an upgrade prompt rather than an
    // error boundary.
    const userId = await getAuthUserId(ctx);
    if (!userId || !(await hasProAccess(ctx, userId))) {
      return { status: "requires_upgrade" as const };
    }

    const data = await computeReportCardData(ctx, draft, season, args);

    // AI-written recap, generated once by convex/gemini/reportSummary.ts's
    // generateReportSummary action when the draft first completes - see
    // convex/draft/status.ts. Only the generated text is cached (not this
    // query's inputs), so null here just means "not generated yet" (or the
    // action failed/skipped, e.g. GEMINI_API_KEY unset) - the frontend falls
    // back to the free templated recap (src/lib/reportCardSummary.ts)
    // whenever this is null.
    const cachedSummary = await ctx.db
      .query("draftReportSummaries")
      .withIndex("by_draft_week_scoring", (q) =>
        q
          .eq("draftId", draft._id)
          .eq("week", args.week)
          .eq("scoring", args.scoring),
      )
      .unique();

    return {
      status: "ok" as const,
      data: { ...data, aiSummary: cachedSummary?.summary ?? null },
    };
  },
});

// Internal counterpart of getDraftReportCard, for convex/gemini/
// reportSummary.ts's generateReportSummary action - a scheduled background
// job with no signed-in caller, so it can't go through requireDraftOwner
// (needs ctx.auth). Re-derives the same status/kind/Pro-access checks
// directly off draftId instead, returning null (rather than throwing)
// whenever any of them fail - the action just skips generating a summary
// in that case, since there's no user waiting on a response to show an
// error to.
export const getReportCardDataForSummary = internalQuery({
  args: {
    draftId: v.id("drafts"),
    week: v.string(),
    scoring: scoringValidator,
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get(args.draftId);
    if (!draft || draft.status !== "complete" || draft.kind !== "real") {
      return null;
    }
    const season = await ctx.db.get(draft.seasonId);
    if (!season) return null;
    const league = await ctx.db.get(season.leagueId);
    if (!league || !(await hasProAccess(ctx, league.ownerId))) return null;

    return await computeReportCardData(ctx, draft, season, args);
  },
});

// Backfill trigger for the AI recap - convex/draft/status.ts only ever
// schedules generateReportSummary once, at the moment a draft first
// completes, checking Pro access at that exact instant. A free-tier owner
// who upgrades later would otherwise never get an AI recap for a draft
// that already finished while they were free (the numeric report card
// itself doesn't have this problem, since getDraftReportCard re-checks
// Pro access live on every read). The Report Card page calls this once on
// load whenever it sees status "ok" with a null aiSummary - idempotent
// (checks for an existing cached row, and generateReportSummary itself
// re-checks Pro access + a cache row before spending a Gemini call), so
// it's safe to call on every such page view, not just the first.
export const ensureReportSummaryGenerated = mutation({
  args: {
    seasonId: v.id("seasons"),
    week: v.string(),
    scoring: scoringValidator,
  },
  handler: async (ctx, args) => {
    const { draft } = await requireDraftOwner(ctx, args.seasonId);
    if (draft.status !== "complete" || draft.kind !== "real") return;

    const userId = await getAuthUserId(ctx);
    if (!userId || !(await hasProAccess(ctx, userId))) return;

    const existing = await ctx.db
      .query("draftReportSummaries")
      .withIndex("by_draft_week_scoring", (q) =>
        q
          .eq("draftId", draft._id)
          .eq("week", args.week)
          .eq("scoring", args.scoring),
      )
      .unique();
    if (existing) return;

    await ctx.scheduler.runAfter(
      0,
      internal.gemini.reportSummary.generateReportSummary,
      { draftId: draft._id, week: args.week, scoring: args.scoring },
    );
  },
});

// Manual "Regenerate" action on the Report Card page - unlike
// ensureReportSummaryGenerated (which only fills in a *missing* recap),
// this clears whatever's cached first, so it also covers a bad recap (e.g.
// one that came back truncated - see convex/gemini/client.ts's
// finishReason check, added after exactly that happened live) or one gone
// stale after a commissioner corrected a pick post-completion (see
// GEMINI.md's "known limitations").
export const regenerateReportSummary = mutation({
  args: {
    seasonId: v.id("seasons"),
    week: v.string(),
    scoring: scoringValidator,
  },
  handler: async (ctx, args) => {
    const { draft } = await requireDraftOwner(ctx, args.seasonId);
    if (draft.status !== "complete" || draft.kind !== "real") {
      throw new Error("Draft isn't complete yet.");
    }

    const userId = await getAuthUserId(ctx);
    if (!userId || !(await hasProAccess(ctx, userId))) {
      throw new Error("Report Card is a Pro feature.");
    }

    const existing = await ctx.db
      .query("draftReportSummaries")
      .withIndex("by_draft_week_scoring", (q) =>
        q
          .eq("draftId", draft._id)
          .eq("week", args.week)
          .eq("scoring", args.scoring),
      )
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    await ctx.scheduler.runAfter(
      0,
      internal.gemini.reportSummary.generateReportSummary,
      { draftId: draft._id, week: args.week, scoring: args.scoring },
    );
  },
});
