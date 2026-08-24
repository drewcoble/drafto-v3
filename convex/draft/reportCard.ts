import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
  type QueryCtx,
  type MutationCtx,
} from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { POSITIONS } from "../positions";
import {
  scoringConfigValidator,
  pointsForScoringConfig,
  type ScoringConfig,
} from "../scoring";
import {
  buildValueCurveByPosition,
  estimateMarketValue,
  getRealDraftValues,
  type DraftValueRow,
} from "../draftValues";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireDraftOwner } from "./auth";
import {
  optimizeLineup,
  type LineupResult,
  type StarterCategory,
} from "./lineupOptimizer";
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

// Value surplus, VOR, and starters strength are on different scales, so each
// is percentile-ranked against the field before blending - see gradeTeams.
// Surplus is the primary driver (bargain-hunting is the most direct
// reading of "beat the market"); VOR rewards raw talent regardless of $;
// starters strength rewards drafting a roster whose best players (by the
// optimizer's own read of the roster) actually make up the starting lineup.
// Tunable, same convention as draftValues.ts's FALLOFF_EXPONENT.
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

// Display order for the Report Card's positional radar chart - QB folds in
// SUPERFLEX (see StarterCategory), FLEX sits with the skill positions it
// pools from rather than at the end.
const CATEGORY_ORDER: StarterCategory[] = [
  "QB",
  "RB",
  "WR",
  "TE",
  "FLEX",
  "DST",
  "K",
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
  // Points from the optimal starting lineup vs. everyone else on the
  // roster - ranked league-wide below into startersRank/benchRank. Framed
  // as a starters-vs-bench comparison rather than "lineup efficiency"
  // because a draft never actually sets a lineup; this is a read on roster
  // construction (top-heavy vs. deep), not in-season lineup decisions.
  startersPoints: number;
  benchPoints: number;
  reliableCount: number;
  boomBustCount: number;
  lowOutputCount: number;
}

// Shared by getDraftReportCardPublic (a public query, gated on the
// drafting league owner's Pro status) and getReportCardDataForSummary (an
// internalQuery, called from the Gemini report-summary action with no
// signed-in caller) - both need the exact same computation, just reached
// via different paths. Takes draft/season as already-loaded docs rather
// than re-fetching, since each caller resolves them differently.
async function computeReportCardData(
  ctx: QueryCtx,
  draft: Doc<"drafts">,
  season: Doc<"seasons">,
  args: { week: string; scoringConfig: ScoringConfig },
) {
  // getRealDraftValues, NOT the public getDraftValues query - the latter
  // decides real-vs-generic off whoever (if anyone) is making the current
  // request, which is wrong here: this runs from contexts with no signed-
  // in caller at all (the scheduled snapshot job) or where the caller
  // viewing a public report card link isn't who Report Card's own Pro gate
  // is checked against (the drafting league's owner). See
  // getRealDraftValues' comment in draftValues.ts for what that bug looked
  // like in practice.
  const values: DraftValueRow[] = await getRealDraftValues(ctx, {
    draftId: draft._id,
    week: args.week,
    scoringConfig: args.scoringConfig,
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
    scoringConfig: args.scoringConfig,
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
        // Report Card is auction-only (SNAKE_DRAFT.md §3.3/§12) - price is
        // always real for the picks this function actually runs against;
        // ?? 0 is just satisfying the now-optional schema type, not a
        // meaningful fallback for a case this ever hits in practice.
        price: pick.price ?? 0,
        sequence: pick.sequence,
        planSlotKey: pick.planSlotKey,
        isKeeper: pick.isKeeper ?? false,
        points: value.points,
        vor: value.valueOverReplacement,
        dollarValue: value.dollarValue,
        surplus: value.dollarValue - (pick.price ?? 0),
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
    const points = projection
      ? pointsForScoringConfig(projection, args.scoringConfig)
      : 0;
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
      // Same auction-only reasoning as the branch above.
      price: pick.price ?? 0,
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
          ? keeperEstimatedValue - (pick.price ?? 0)
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
      (worst, p) =>
        !worst || (p.surplus ?? 0) < (worst.surplus ?? 0) ? p : worst,
      undefined,
    );

    const keeperPicks = teamPicks.filter(
      (p) => p.isKeeper && p.keeperSurplus !== null,
    );
    const bestKeeper = keeperPicks.reduce<ResolvedPick | undefined>(
      (best, p) =>
        !best || (p.keeperSurplus ?? 0) > (best.keeperSurplus ?? 0) ? p : best,
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
        ...(p.planSlotKey !== undefined ? { planSlotKey: p.planSlotKey } : {}),
      })),
      season.rosterSlots,
      season.flexPositions,
      season.superflexPositions,
    );
    const totalPoints = teamPicks.reduce((sum, p) => sum + p.points, 0);

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
      startersPoints: lineup.optimalPoints,
      benchPoints: totalPoints - lineup.optimalPoints,
      reliableCount,
      boomBustCount,
      lowOutputCount,
    };
  });

  const surplusValues = rawTeams.map((t) => t.surplusTotal);
  const vorValues = rawTeams.map((t) => t.vorTotal);
  const lineupValues = rawTeams.map((t) => t.lineup.efficiencyPct);

  // 1-indexed league rank (1 = best) for starters and bench strength,
  // surfaced in buildTeamSummary/buildSummaryPrompt as "Nth-best
  // starters/bench" instead of the old "points left on the bench" framing.
  const startersRankByTeam = new Map(
    [...rawTeams]
      .sort((a, b) => b.startersPoints - a.startersPoints)
      .map((t, i) => [t.teamId, i + 1]),
  );
  const benchRankByTeam = new Map(
    [...rawTeams]
      .sort((a, b) => b.benchPoints - a.benchPoints)
      .map((t, i) => [t.teamId, i + 1]),
  );

  // Categories the league's roster shape actually uses - a league with no
  // K/DST or no FLEX shouldn't show a flatlined rank-1-for-everyone wedge
  // on the radar chart for a slot nobody starts.
  const activeCategories = CATEGORY_ORDER.filter((category) => {
    if (category === "FLEX") return season.rosterSlots.FLEX > 0;
    if (category === "QB") {
      return season.rosterSlots.QB > 0 || season.rosterSlots.SUPERFLEX > 0;
    }
    return season.rosterSlots[category] > 0;
  });
  const categoryRankByTeam = new Map(
    activeCategories.map((category) => [
      category,
      new Map(
        [...rawTeams]
          .sort(
            (a, b) =>
              b.lineup.optimalPointsByCategory[category] -
              a.lineup.optimalPointsByCategory[category],
          )
          .map((t, i) => [t.teamId, i + 1]),
      ),
    ]),
  );

  const teamReportCards = rawTeams.map((team) => {
    const surplusPct = percentileRank(team.surplusTotal, surplusValues);
    const vorPct = percentileRank(team.vorTotal, vorValues);
    const lineupPct = percentileRank(team.lineup.efficiencyPct, lineupValues);
    const gradeScore = Math.round(
      SURPLUS_WEIGHT * surplusPct +
        VOR_WEIGHT * vorPct +
        LINEUP_WEIGHT * lineupPct,
    );
    return {
      ...team,
      gradeScore,
      letter: letterForScore(gradeScore),
      startersRank: startersRankByTeam.get(team.teamId) ?? 1,
      benchRank: benchRankByTeam.get(team.teamId) ?? 1,
      positionalRanks: activeCategories.map((category) => ({
        category,
        rank: categoryRankByTeam.get(category)?.get(team.teamId) ?? 1,
      })),
    };
  });

  // DST excluded here (but not from team grades/surplus totals elsewhere)
  // - a $1-2 swing on a streamable defense reads as a huge "steal" or
  // "reach" by percentage/surplus, but nobody actually believes a defense
  // is a real draft-day steal the way a $30 RB at $15 is.
  const nonKeeperResolved = resolved.filter(
    (p) => !p.isKeeper && p.surplus !== null && p.position !== "DST",
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
    scoring: args.scoringConfig.scoring,
    teams: teamReportCards,
    leagueSteals,
    leagueReaches,
    leagueBestKeepers,
    leagueWorstKeepers,
    mostReliableRoster,
    mostVolatileRoster,
  };
}

type ReportCardData = Awaited<ReturnType<typeof computeReportCardData>>;

// Read-only counterpart of ensureReportCardSnapshot below, for the two
// query contexts (getDraftReportCardPublic, getReportCardDataForSummary)
// that can't write a snapshot themselves. Prefers an already-frozen snapshot;
// falls back to a fresh live computation only when one doesn't exist yet
// (e.g. a draft completed before snapshotting existed, or the scheduled/
// frontend-triggered snapshot call below hasn't landed yet) so the page
// still renders something in the meantime.
async function readReportCardData(
  ctx: QueryCtx,
  draft: Doc<"drafts">,
  season: Doc<"seasons">,
  args: { week: string; scoringConfig: ScoringConfig },
): Promise<ReportCardData> {
  const snapshot = await ctx.db
    .query("draftReportCardSnapshots")
    .withIndex("by_draft_week_scoring", (q) =>
      q
        .eq("draftId", draft._id)
        .eq("week", args.week)
        .eq("scoring", args.scoringConfig.scoring),
    )
    .unique();
  if (snapshot) return snapshot.data as ReportCardData;
  return await computeReportCardData(ctx, draft, season, args);
}

// Freezes computeReportCardData's output the first time it's called for a
// given (draftId, week, scoring), so the Report Card - and any AI recap
// generated from it - reads the same numbers forever after, rather than
// drifting as convex/crons.ts's daily projection refetch updates the
// dollarValue/points everything else here is derived from. Idempotent: a
// second call just returns the already-stored snapshot untouched.
//
// Doesn't check Pro access - freezing is a data-correctness concern, not a
// monetization one, so a free-tier league still gets a snapshot ready to
// show the moment its owner upgrades. (Doesn't check draft.kind === "real"
// either for the same reason a mock draft's owner could still want to look
// at one, though in practice only syncDraftStatus's real-draft-only
// scheduling and the Pro-gated UI ever trigger this.)
//
// Not auto-invalidated by a post-completion pick correction - a
// commissioner fixing a pick after the draft is already "complete" leaves
// any existing snapshot (and AI text built from it) stale until the
// Report Card's "Regenerate" button (regenerateReportSummary) is clicked,
// which clears this row too and lets it recompute.
async function ensureReportCardSnapshot(
  ctx: MutationCtx,
  args: { draftId: Id<"drafts">; week: string; scoringConfig: ScoringConfig },
): Promise<ReportCardData | null> {
  const draft = await ctx.db.get(args.draftId);
  if (!draft || draft.status !== "complete") return null;
  const season = await ctx.db.get(draft.seasonId);
  if (!season) return null;

  const existing = await ctx.db
    .query("draftReportCardSnapshots")
    .withIndex("by_draft_week_scoring", (q) =>
      q
        .eq("draftId", args.draftId)
        .eq("week", args.week)
        .eq("scoring", args.scoringConfig.scoring),
    )
    .unique();
  if (existing) return existing.data as ReportCardData;

  const data = await computeReportCardData(ctx, draft, season, args);
  await ctx.db.insert("draftReportCardSnapshots", {
    draftId: args.draftId,
    week: args.week,
    scoring: args.scoringConfig.scoring,
    data,
    generatedAt: Date.now(),
  });
  return data;
}

// Scheduled once by convex/draft/status.ts's syncDraftStatus, right when a
// real draft first transitions into status "complete" - primes the
// snapshot immediately so it's ready before anyone even opens the Report
// Card page.
export const snapshotReportCard = internalMutation({
  args: {
    draftId: v.id("drafts"),
    week: v.string(),
    scoringConfig: scoringConfigValidator,
  },
  handler: ensureReportCardSnapshot,
});

// Frontend-triggered backfill (see DraftReportCard.tsx), same convention as
// ensureReportSummaryGenerated below - covers a draft that completed before
// this snapshotting existed, or the rare case where the scheduled
// snapshotReportCard above hasn't run yet by the time the owner opens the
// page.
export const ensureReportCardSnapshotted = mutation({
  args: {
    seasonId: v.id("seasons"),
    week: v.string(),
    scoringConfig: scoringConfigValidator,
  },
  handler: async (ctx, args) => {
    const { draft } = await requireDraftOwner(ctx, args.seasonId);
    if (draft.status !== "complete") return;
    await ensureReportCardSnapshot(ctx, {
      draftId: draft._id,
      week: args.week,
      scoringConfig: args.scoringConfig,
    });
  },
});

// Public, no-signed-in-required counterpart of the old owner-only
// getDraftReportCard - the Report Card is now a shareable link
// (src/routes/reportCard/$leagueId.tsx), same convention as the TV board's
// *Public queries (see convex/leagues.ts's getSeasonPublic, convex/draft/
// teams.ts's listSeasonTeamsPublic): no ownership check, the unguessable
// seasonId in the URL is what limits who can find it.
//
// Still gated on Pro access, but on the drafting league's OWNER's status
// (league.ownerId), not the viewer's - there may be no signed-in viewer at
// all, and Report Card generation is something the league owner pays for,
// not something every individual visitor would separately subscribe to.
// This mirrors how the AI recap (convex/gemini/reportSummary.ts) already
// gates off league.ownerId rather than the caller.
export const getDraftReportCardPublic = query({
  args: {
    seasonId: v.id("seasons"),
    week: v.string(),
    scoringConfig: scoringConfigValidator,
  },
  handler: async (ctx, args) => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) return { status: "not_ready" as const };
    const draft = await ctx.db
      .query("drafts")
      .withIndex("by_season_kind", (q) =>
        q.eq("seasonId", args.seasonId).eq("kind", "real"),
      )
      .first();
    if (!draft || draft.status !== "complete") {
      return { status: "not_ready" as const };
    }

    const league = await ctx.db.get(season.leagueId);
    if (!league || !(await hasProAccess(ctx, league.ownerId))) {
      return { status: "requires_upgrade" as const };
    }

    const data = await readReportCardData(ctx, draft, season, args);

    // AI-written recap (+ per-team blurbs), generated once by convex/gemini/
    // reportSummary.ts's generateReportSummary action when the draft first
    // completes - see convex/draft/status.ts. Only the generated text is
    // cached (not this query's inputs), so null here just means "not
    // generated yet" (or the action failed/skipped, e.g. GEMINI_API_KEY
    // unset) - the frontend falls back to the free templated recap
    // (src/lib/reportCardSummary.ts) whenever a summary is null, per team
    // as well as league-wide (teamSummaries is also absent entirely on rows
    // cached before per-team summaries existed).
    const cachedSummary = await ctx.db
      .query("draftReportSummaries")
      .withIndex("by_draft_week_scoring", (q) =>
        q
          .eq("draftId", draft._id)
          .eq("week", args.week)
          .eq("scoring", args.scoringConfig.scoring),
      )
      .unique();
    const aiTeamSummaryByTeamId = new Map(
      (cachedSummary?.teamSummaries ?? []).map((t) => [t.teamId, t.summary]),
    );

    // Purely a UI hint for the frontend (show the Regenerate button? fire
    // the auto-backfill mutations?) - NOT a security boundary. Even if a
    // client spoofed this to true, ensureReportCardSnapshotted/
    // ensureReportSummaryGenerated/regenerateReportSummary each still run
    // their own requireDraftOwner check server-side, so a non-owner's
    // mutation call would just fail regardless of what this said.
    const userId = await getAuthUserId(ctx);
    const isOwner = userId !== null && userId === league.ownerId;

    return {
      status: "ok" as const,
      isOwner,
      data: {
        ...data,
        aiSummary: cachedSummary?.summary ?? null,
        teams: data.teams.map((team) => ({
          ...team,
          aiSummary: aiTeamSummaryByTeamId.get(team.teamId) ?? null,
        })),
      },
    };
  },
});

// Internal counterpart of getDraftReportCardPublic, for convex/gemini/
// reportSummary.ts's generateReportSummary action - a scheduled background
// job with no signed-in caller. Re-derives the same status/kind/Pro-access
// checks directly off draftId instead, returning null (rather than
// throwing) whenever any of them fail - the action just skips generating a
// summary in that case, since there's no user waiting on a response to
// show an error to.
export const getReportCardDataForSummary = internalQuery({
  args: {
    draftId: v.id("drafts"),
    week: v.string(),
    scoringConfig: scoringConfigValidator,
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

    return await readReportCardData(ctx, draft, season, args);
  },
});

// Backfill trigger for the AI recap - convex/draft/status.ts only ever
// schedules generateReportSummary once, at the moment a draft first
// completes, checking Pro access at that exact instant. A free-tier owner
// who upgrades later would otherwise never get an AI recap for a draft
// that already finished while they were free (the numeric report card
// itself doesn't have this problem, since getDraftReportCardPublic
// re-checks Pro access live on every read). The Report Card page calls this once on
// load whenever it sees status "ok" with a null aiSummary - idempotent
// (checks for an existing cached row, and generateReportSummary itself
// re-checks Pro access + a cache row before spending a Gemini call), so
// it's safe to call on every such page view, not just the first.
export const ensureReportSummaryGenerated = mutation({
  args: {
    seasonId: v.id("seasons"),
    week: v.string(),
    scoringConfig: scoringConfigValidator,
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
          .eq("scoring", args.scoringConfig.scoring),
      )
      .unique();
    if (existing) return;

    await ctx.scheduler.runAfter(
      0,
      internal.gemini.reportSummary.generateReportSummary,
      {
        draftId: draft._id,
        week: args.week,
        scoringConfig: args.scoringConfig,
      },
    );
  },
});

// Manual "Regenerate" action on the Report Card page - unlike
// ensureReportSummaryGenerated (which only fills in a *missing* recap),
// this clears whatever's cached first, so it also covers a bad recap (e.g.
// one that came back truncated - see convex/gemini/client.ts's
// finishReason check, added after exactly that happened live) or one gone
// stale after a commissioner corrected a pick post-completion.
//
// Also clears the frozen draftReportCardSnapshots row (not just the AI
// text) and lets generateReportSummary recompute it fresh - otherwise this
// button would refresh the prose but leave every number on the page locked
// to whatever was true the first time the draft completed, which defeats
// the point of a "regenerate everything" action. This is the only way an
// existing snapshot ever gets recomputed post-completion (see that table's
// schema comment on the commissioner-correction gap).
export const regenerateReportSummary = mutation({
  args: {
    seasonId: v.id("seasons"),
    week: v.string(),
    scoringConfig: scoringConfigValidator,
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

    const existingSummaries = await ctx.db
      .query("draftReportSummaries")
      .withIndex("by_draft_week_scoring", (q) =>
        q
          .eq("draftId", draft._id)
          .eq("week", args.week)
          .eq("scoring", args.scoringConfig.scoring),
      )
      .collect();
    for (const row of existingSummaries) await ctx.db.delete(row._id);

    const existingSnapshot = await ctx.db
      .query("draftReportCardSnapshots")
      .withIndex("by_draft_week_scoring", (q) =>
        q
          .eq("draftId", draft._id)
          .eq("week", args.week)
          .eq("scoring", args.scoringConfig.scoring),
      )
      .unique();
    if (existingSnapshot) await ctx.db.delete(existingSnapshot._id);

    await ctx.scheduler.runAfter(
      0,
      internal.gemini.reportSummary.generateReportSummary,
      {
        draftId: draft._id,
        week: args.week,
        scoringConfig: args.scoringConfig,
      },
    );
  },
});
