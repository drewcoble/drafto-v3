import { v } from "convex/values";
import {
  query,
  internalMutation,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { positionValidator, POSITIONS } from "./positions";
import {
  scoringConfigValidator,
  pointsForScoringConfig,
  ScoringConfig,
} from "./scoring";
import { Doc, Id } from "./_generated/dataModel";
import type { RosterSlotCounts } from "./draft/slots";
import { hasProAccess } from "./billing/entitlements";

type Position = (typeof POSITIONS)[number];

export interface DraftValueRow {
  fpid: number;
  name: string;
  team: string | null;
  position: Position;
  points: number;
  positionRank: number;
  replacementPoints: number;
  usedFallback: boolean;
  valueOverReplacement: number;
  dollarValue: number;
}

// Canonical "generic" league shape served to free-plan users instead of
// their real league's settings - mirrors src/constants/leagueSettings.ts's
// DEFAULT_FORM (12 teams, $200 cap, standard roster). Duplicated here rather
// than imported since Convex functions can't import from src/ - same
// reasoning as DRAFT_PREP_WEEK in convex/leagues.ts duplicating a frontend
// constant.
const DEFAULT_GENERIC_LEAGUE_SETTINGS: {
  teamCount: number;
  salaryCap: number;
  rosterSlots: RosterSlotCounts;
  flexPositions: Position[];
  superflexPositions: Position[];
} = {
  teamCount: 12,
  salaryCap: 200,
  rosterSlots: {
    QB: 1,
    RB: 2,
    WR: 2,
    TE: 1,
    DST: 1,
    K: 0,
    FLEX: 1,
    SUPERFLEX: 0,
    BENCH: 8,
  },
  flexPositions: ["RB", "WR", "TE"],
  superflexPositions: ["QB", "RB", "WR", "TE"],
};

/**
 * Auction/salary-cap $ value per player, computed from current projections +
 * an explicit league shape (roster slots, team count, total cap dollars,
 * keepers already off the board). Pure with respect to any one draft/season
 * - the only ctx.db read left in here is `projections`, which is
 * league-independent - so the exact same VBD engine can be pointed at a
 * real league's settings (computeDraftValues below) or the shared generic
 * default settings (computeGenericDraftValues below) without duplicating
 * the math.
 *
 * Value-Based Drafting: find each position's replacement-level player (the
 * last one who'd realistically be rostered given league settings, including
 * a two-tier flex-value allocation - FLEX then SUPERFLEX - across whichever
 * positions are eligible for each), then split the league's total spendable
 * auction dollars proportionally to how far above that replacement level
 * each player projects.
 */
async function computeDraftValuesForSettings(
  ctx: QueryCtx | MutationCtx,
  args: {
    week: string;
    scoringConfig: ScoringConfig;
    rosterSlots: RosterSlotCounts;
    flexPositions: Position[];
    superflexPositions: Position[];
    teamCount: number;
    totalCapDollars: number;
    keptFpids: Set<number>;
    keptCountByPos: Partial<Record<Position, number>>;
    keptDollars: number;
    keeperCount: number;
  },
): Promise<DraftValueRow[]> {
  const {
    week,
    scoringConfig,
    rosterSlots,
    flexPositions,
    superflexPositions,
    teamCount,
    totalCapDollars,
    keptFpids,
    keptCountByPos,
    keptDollars,
    keeperCount,
  } = args;

  // A position only matters to this league if it fills a dedicated roster
  // slot or is eligible for FLEX/SUPERFLEX - e.g. a 0-K league shouldn't
  // have kickers costing anything or showing up at all. Everything below
  // is scoped to this list instead of the full POSITIONS union.
  const activePositions = POSITIONS.filter(
    (pos) =>
      rosterSlots[pos] > 0 ||
      flexPositions.includes(pos) ||
      superflexPositions.includes(pos),
  );

  // Load + rank every active position's projections for this week -
  // replacement level depends on the whole league's player pool, not just
  // one position. Kept players are excluded up front: they're off the
  // board, so they neither need a $ value nor should occupy a
  // replacement-rank slot in the remaining pool.
  const byPosition = new Map<Position, Doc<"projections">[]>();
  for (const pos of activePositions) {
    const rows = await ctx.db
      .query("projections")
      .withIndex("by_position_week", (q) =>
        q.eq("position", pos).eq("week", week),
      )
      .collect();
    const available = rows.filter((row) => !keptFpids.has(row.fpid));
    available.sort(
      (a, b) =>
        pointsForScoringConfig(b, scoringConfig) -
        pointsForScoringConfig(a, scoringConfig),
    );
    byPosition.set(pos, available);
  }

  // Non-flex starter demand per position, reduced by however many of that
  // position's starter slots a keeper already fills league-wide. This
  // treats every keeper as claiming a starter slot at their own position
  // rather than reconstructing which exact slot an opponent's keeper
  // fills (only the self team tracks planSlotKey) - a reasonable
  // approximation in the same spirit as this file's other tuned
  // heuristics (FALLOFF_EXPONENT, etc).
  const nonFlexDemand: Record<Position, number> = {
    QB: Math.max(teamCount * rosterSlots.QB - (keptCountByPos.QB ?? 0), 0),
    RB: Math.max(teamCount * rosterSlots.RB - (keptCountByPos.RB ?? 0), 0),
    WR: Math.max(teamCount * rosterSlots.WR - (keptCountByPos.WR ?? 0), 0),
    TE: Math.max(teamCount * rosterSlots.TE - (keptCountByPos.TE ?? 0), 0),
    DST: Math.max(teamCount * rosterSlots.DST - (keptCountByPos.DST ?? 0), 0),
    K: Math.max(teamCount * rosterSlots.K - (keptCountByPos.K ?? 0), 0),
  };

  // Flex candidates: players ranked beyond their own position's non-flex
  // demand, pooled across flex-eligible positions and ranked by raw points.
  // Whoever wins a flex slot pushes their position's true replacement rank
  // down by one.
  const flexCandidates: Array<{ position: Position; points: number }> = [];
  for (const pos of flexPositions) {
    const sorted = byPosition.get(pos) ?? [];
    for (const row of sorted.slice(nonFlexDemand[pos])) {
      flexCandidates.push({
        position: pos,
        points: pointsForScoringConfig(row, scoringConfig),
      });
    }
  }
  flexCandidates.sort((a, b) => b.points - a.points);
  const flexDemand = teamCount * rosterSlots.FLEX;
  const wonFlex = flexCandidates.slice(0, flexDemand);

  const flexWonCount = new Map<Position, number>();
  for (const candidate of wonFlex) {
    flexWonCount.set(
      candidate.position,
      (flexWonCount.get(candidate.position) ?? 0) + 1,
    );
  }

  // SUPERFLEX candidates: same idea as FLEX, one tier up - pooled from
  // superflexPositions (typically QB + the FLEX-eligible positions), but
  // beyond whatever each position already gave up to non-flex demand *and*
  // FLEX. Because both pools are built from each position's own
  // descending-sorted list and then prefix-cut after a further sort, a
  // position's winners at every tier are always a contiguous prefix of its
  // own list - so this composes with plain arithmetic, no fpid-set
  // bookkeeping needed. QB is never in flexPositions, so
  // flexWonCount.get("QB") is always 0/undefined, which is exactly why this
  // still works correctly for a QB-only-superflex-eligible position.
  const superflexCandidates: Array<{ position: Position; points: number }> = [];
  for (const pos of superflexPositions) {
    const sorted = byPosition.get(pos) ?? [];
    const alreadyClaimed = nonFlexDemand[pos] + (flexWonCount.get(pos) ?? 0);
    for (const row of sorted.slice(alreadyClaimed)) {
      superflexCandidates.push({
        position: pos,
        points: pointsForScoringConfig(row, scoringConfig),
      });
    }
  }
  superflexCandidates.sort((a, b) => b.points - a.points);
  const superflexDemand = teamCount * rosterSlots.SUPERFLEX;
  const wonSuperflex = superflexCandidates.slice(0, superflexDemand);

  const superflexWonCount = new Map<Position, number>();
  for (const candidate of wonSuperflex) {
    superflexWonCount.set(
      candidate.position,
      (superflexWonCount.get(candidate.position) ?? 0) + 1,
    );
  }

  // Replacement rank + points per position. Sleeper's pools are large
  // enough (hundreds per position, no pagination cap) that the exact rank
  // is virtually always present; if a league's settings ever demand more
  // players than exist, fall back to the last available player's points
  // rather than crashing or zeroing out the position.
  const replacementPoints = {} as Record<Position, number>;
  const usedFallback = {} as Record<Position, boolean>;
  for (const pos of activePositions) {
    const sorted = byPosition.get(pos) ?? [];
    const rank =
      nonFlexDemand[pos] +
      (flexWonCount.get(pos) ?? 0) +
      (superflexWonCount.get(pos) ?? 0) +
      1;
    const replacement = sorted[rank - 1];
    const last = sorted[sorted.length - 1];

    if (replacement) {
      replacementPoints[pos] = pointsForScoringConfig(
        replacement,
        scoringConfig,
      );
      usedFallback[pos] = false;
    } else if (last) {
      replacementPoints[pos] = pointsForScoringConfig(last, scoringConfig);
      usedFallback[pos] = true;
    } else {
      replacementPoints[pos] = 0;
      usedFallback[pos] = true;
    }
  }

  // $1 reserved per roster slot league-wide; remaining surplus split
  // proportionally to value-over-replacement across every player.
  const totalRosterSlots =
    rosterSlots.QB +
    rosterSlots.RB +
    rosterSlots.WR +
    rosterSlots.TE +
    rosterSlots.DST +
    rosterSlots.K +
    rosterSlots.FLEX +
    rosterSlots.SUPERFLEX +
    rosterSlots.BENCH;
  // Dollars already committed to keepers are off the auction table, and
  // each kept player fills a roster slot that no longer needs its $1
  // reservation out of the surplus pool.
  const totalDraftDollars = totalCapDollars - keptDollars;
  const baselineDollars = teamCount * totalRosterSlots - keeperCount;
  const surplusDollars = totalDraftDollars - baselineDollars;

  // Splitting the surplus purely linearly by VOR over-concentrates dollars
  // on the very top of the pool (elite players blow past realistic auction
  // prices) and starves everyone just below them. Using VOR^FALLOFF_EXPONENT
  // as the allocation weight instead keeps the same rank order but
  // compresses that top-end spike into a believable curve - raw VOR is
  // still returned below as valueOverReplacement, it's only the $ split
  // that changes. 0.70 (not 0.85) was chosen by comparing generic-settings
  // output against ESPN's 2026 PPR auction cheat sheet: 0.85 put the top RB/WR
  // ~35% above ESPN's real-auction-calibrated prices (elite players rarely
  // clear $65-70 of a $200 budget in practice) while leaving picks ranked
  // ~4+ already accurate, so only the top-end taper needed adjusting.
  const FALLOFF_EXPONENT = 0.7;
  let totalWeight = 0;
  const vorByFpid = new Map<number, number>();
  const weightByFpid = new Map<number, number>();
  for (const pos of activePositions) {
    for (const row of byPosition.get(pos) ?? []) {
      const vor = Math.max(
        pointsForScoringConfig(row, scoringConfig) - replacementPoints[pos],
        0,
      );
      const weight = Math.pow(vor, FALLOFF_EXPONENT);
      vorByFpid.set(row.fpid, vor);
      weightByFpid.set(row.fpid, weight);
      totalWeight += weight;
    }
  }

  const output: DraftValueRow[] = [];
  for (const pos of activePositions) {
    const targetRows = byPosition.get(pos) ?? [];
    output.push(
      ...targetRows.map((row, index) => {
        const points = pointsForScoringConfig(row, scoringConfig);
        const vor = vorByFpid.get(row.fpid) ?? 0;
        const weight = weightByFpid.get(row.fpid) ?? 0;
        const dollarValue =
          totalWeight > 0 ? 1 + (weight / totalWeight) * surplusDollars : 1;

        return {
          fpid: row.fpid,
          name: row.name,
          team: row.team,
          position: pos,
          points,
          positionRank: index + 1,
          replacementPoints: replacementPoints[pos],
          usedFallback: usedFallback[pos],
          valueOverReplacement: vor,
          dollarValue,
        };
      }),
    );
  }
  return output;
}

interface ValueCurvePoint {
  vor: number;
  dollarValue: number;
}

// Per-position VOR -> $ curve built from a set of already-auctioned
// (non-keeper) DraftValueRows, anchored at (0, $1) since that's exactly the
// floor computeDraftValuesForSettings' formula converges to as VOR
// approaches 0 (weight = VOR^FALLOFF_EXPONENT -> 0). Used to estimate what a
// keeper's production would have cost at auction, since keepers are
// excluded from the real value engine's pool entirely and have no
// dollarValue of their own - see estimateMarketValue below and its callers
// (reportCard.ts's best/worst keeper grading, getDraftValues' keeperValues
// field for the Keepers tab).
export function buildValueCurveByPosition(
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
export function estimateMarketValue(
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

// Real per-league values - loads this draft's actual season settings,
// keepers, and teams (for any per-team salary cap overrides), then defers to
// computeDraftValuesForSettings for the shared VBD math. Only Pro users see
// this (see getDraftValues below) - free users get computeGenericDraftValues
// instead.
async function computeDraftValues(
  ctx: QueryCtx | MutationCtx,
  args: {
    draftId: Id<"drafts">;
    week: string;
    scoringConfig: ScoringConfig;
  },
): Promise<DraftValueRow[]> {
  const draft = await ctx.db.get(args.draftId);
  if (!draft) {
    throw new Error("Draft not found");
  }
  const settings = await ctx.db.get(draft.seasonId);
  if (!settings) {
    throw new Error("Season not found");
  }

  // Keepers are pre-draft picks (convex/draft/picks.ts's addKeeper) that
  // take a player off the board before the auction even starts. Read via
  // the isKeeper-scoped index rather than the general by_draft index so
  // this query's read range only covers keeper rows - regular auction
  // picks (isKeeper absent) fall outside that range and don't invalidate
  // this computation. That distinction is deliberate: convex/draft/
  // board.ts documents why re-running this whole VBD engine on every
  // single live pick would be too expensive, but keepers are set once
  // during setup and don't change during the live draft, so reacting to
  // them here is cheap and safe.
  const keepers = await ctx.db
    .query("draftPicks")
    .withIndex("by_draft_keeper", (q) =>
      q.eq("draftId", args.draftId).eq("isKeeper", true),
    )
    .collect();
  const keptFpids = new Set(keepers.map((keeper) => keeper.fpid));
  const keptCountByPos: Partial<Record<Position, number>> = {};
  let keptDollars = 0;
  for (const keeper of keepers) {
    keptCountByPos[keeper.position] =
      (keptCountByPos[keeper.position] ?? 0) + 1;
    keptDollars += keeper.price;
  }

  // Sum each team's actual cap (its override, or the league default) rather
  // than assuming every team uses the league default - a team with a custom
  // salaryCapOverride (convex/draft/teams.ts) changes the total money in the
  // room. Teams may not exist yet the first time this runs (createLeague
  // seeds the cache before initializeSeasonTeams has ever run), so fall back
  // to the settings-only formula in that case.
  const teams = await ctx.db
    .query("seasonTeams")
    .withIndex("by_season", (q) => q.eq("seasonId", draft.seasonId))
    .collect();
  const totalCapDollars =
    teams.length > 0
      ? teams.reduce(
          (sum, team) => sum + (team.salaryCapOverride ?? settings.salaryCap),
          0,
        )
      : settings.teamCount * settings.salaryCap;

  return await computeDraftValuesForSettings(ctx, {
    week: args.week,
    scoringConfig: args.scoringConfig,
    rosterSlots: settings.rosterSlots,
    flexPositions: settings.flexPositions,
    superflexPositions: settings.superflexPositions,
    teamCount: settings.teamCount,
    totalCapDollars,
    keptFpids,
    keptCountByPos,
    keptDollars,
    keeperCount: keepers.length,
  });
}

// Free-plan equivalent - same VBD engine, but pointed at a fixed shared
// default league shape instead of any real league's settings, and with no
// keepers (a generic estimate has no notion of any one league's keeper
// picks). See getGenericDraftValues below for the (week, scoring)-keyed
// cache this feeds.
async function computeGenericDraftValues(
  ctx: QueryCtx | MutationCtx,
  args: { week: string; scoringConfig: ScoringConfig },
): Promise<DraftValueRow[]> {
  const defaults = DEFAULT_GENERIC_LEAGUE_SETTINGS;
  return await computeDraftValuesForSettings(ctx, {
    week: args.week,
    scoringConfig: args.scoringConfig,
    rosterSlots: defaults.rosterSlots,
    flexPositions: defaults.flexPositions,
    superflexPositions: defaults.superflexPositions,
    teamCount: defaults.teamCount,
    totalCapDollars: defaults.teamCount * defaults.salaryCap,
    keptFpids: new Set(),
    keptCountByPos: {},
    keptDollars: 0,
    keeperCount: 0,
  });
}

async function getGenericDraftValues(
  ctx: QueryCtx,
  args: { week: string; scoringConfig: ScoringConfig },
): Promise<DraftValueRow[]> {
  const cached = await ctx.db
    .query("genericDraftValues")
    .withIndex("by_week_scoring_teScoring_sixPointPassTds", (q) =>
      q
        .eq("week", args.week)
        .eq("scoring", args.scoringConfig.scoring)
        .eq("teScoring", args.scoringConfig.teScoring)
        .eq("sixPointPassTds", args.scoringConfig.sixPointPassTds),
    )
    .collect();
  if (cached.length > 0) {
    return cached.map((row): DraftValueRow => ({
      fpid: row.fpid,
      name: row.name,
      team: row.team,
      position: row.position,
      points: row.points,
      positionRank: row.positionRank,
      replacementPoints: row.replacementPoints,
      usedFallback: row.usedFallback,
      valueOverReplacement: row.valueOverReplacement,
      dollarValue: row.dollarValue,
    }));
  }
  return await computeGenericDraftValues(ctx, args);
}

// Public, frontend-facing entry point - takes a seasonId (what every route/
// component actually has on hand) and resolves it to that season's real
// draft internally, same lookup convex/draft/auth.ts's requireRealDraft
// does.
//
// Gated on the caller's Pro plan: a free-plan (or signed-out) caller gets
// generic default-league-settings values (isGeneric: true) instead of this
// season's real ones, so free users still see directionally-useful numbers
// without leaking a specific league's exact auction math. This is a
// deliberate, narrow change to this query's contract - previously it had no
// auth check at all (read-only derived data, cheap to expose by id) - see
// the monetization plan for why. Report Card (convex/draft/reportCard.ts) is
// entirely Pro-gated before it ever calls this, so it always gets real
// values.
export const getDraftValues = query({
  args: {
    seasonId: v.id("seasons"),
    week: v.string(),
    scoringConfig: scoringConfigValidator,
    // Omit to get every position back in one call (the combined players
    // table) - computeDraftValues always computes every active position
    // regardless, this only changes which rows are returned.
    position: v.optional(positionValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const proAccess = userId ? await hasProAccess(ctx, userId) : false;

    if (!proAccess) {
      const rows = await getGenericDraftValues(ctx, {
        week: args.week,
        scoringConfig: args.scoringConfig,
      });
      // No keeperValues here: generic values never exclude any specific
      // league's keepers in the first place (computeGenericDraftValues
      // always runs with an empty keptFpids set), so a kept player already
      // has a normal dollarValue entry in `values` above.
      return {
        isGeneric: true,
        values: args.position
          ? rows.filter((row) => row.position === args.position)
          : rows,
        keeperValues: [] as { fpid: number; dollarValue: number }[],
      };
    }

    const draft = await ctx.db
      .query("drafts")
      .withIndex("by_season_kind", (q) =>
        q.eq("seasonId", args.seasonId).eq("kind", "real"),
      )
      .first();
    if (!draft) return { isGeneric: false, values: [] };

    const cached = await ctx.db
      .query("draftValues")
      .withIndex("by_draft_week_scoring_teScoring_sixPointPassTds", (q) =>
        q
          .eq("draftId", draft._id)
          .eq("week", args.week)
          .eq("scoring", args.scoringConfig.scoring)
          .eq("teScoring", args.scoringConfig.teScoring)
          .eq("sixPointPassTds", args.scoringConfig.sixPointPassTds),
      )
      .collect();

    const rows: DraftValueRow[] =
      cached.length > 0
        ? cached.map((row): DraftValueRow => ({
            fpid: row.fpid,
            name: row.name,
            team: row.team,
            position: row.position,
            points: row.points,
            positionRank: row.positionRank,
            replacementPoints: row.replacementPoints,
            usedFallback: row.usedFallback,
            valueOverReplacement: row.valueOverReplacement,
            dollarValue: row.dollarValue,
          }))
        : await computeDraftValues(ctx, {
            draftId: draft._id,
            week: args.week,
            scoringConfig: args.scoringConfig,
          });

    const keeperValues = await estimateKeeperValues(ctx, {
      draftId: draft._id,
      week: args.week,
      scoringConfig: args.scoringConfig,
      values: rows,
    });

    return {
      isGeneric: false,
      values: args.position
        ? rows.filter((row) => row.position === args.position)
        : rows,
      keeperValues,
    };
  },
});

// Kept players have no dollarValue in `values` above - computeDraftValues
// excludes them from the auction pool entirely (see its comment). This
// estimates what each currently-kept player's projected production would
// have cost at this draft's auction, by interpolating along the real
// (non-keeper) pool's own VOR -> $ curve. Used by the Keepers tab to show a
// keeper's surplus value (estimate minus what they actually cost) - not
// needed by anything that only cares about the live "available to draft"
// board, so it's returned as its own field rather than folded into `values`
// (which several other callers - board.ts, reportCard.ts - key off the
// assumption that it's exactly the auctionable pool).
async function estimateKeeperValues(
  ctx: QueryCtx,
  args: {
    draftId: Id<"drafts">;
    week: string;
    scoringConfig: ScoringConfig;
    values: DraftValueRow[];
  },
): Promise<{ fpid: number; dollarValue: number }[]> {
  const keepers = await ctx.db
    .query("draftPicks")
    .withIndex("by_draft_keeper", (q) =>
      q.eq("draftId", args.draftId).eq("isKeeper", true),
    )
    .collect();
  if (keepers.length === 0) return [];

  const curveByPosition = buildValueCurveByPosition(args.values);
  const replacementByPosition = new Map<Position, number>();
  for (const row of args.values) {
    if (!replacementByPosition.has(row.position)) {
      replacementByPosition.set(row.position, row.replacementPoints);
    }
  }

  const results: { fpid: number; dollarValue: number }[] = [];
  for (const keeper of keepers) {
    const projection = await ctx.db
      .query("projections")
      .withIndex("by_position_week_fpid", (q) =>
        q
          .eq("position", keeper.position)
          .eq("week", args.week)
          .eq("fpid", keeper.fpid),
      )
      .unique();
    if (!projection) continue;

    const points = pointsForScoringConfig(projection, args.scoringConfig);
    const replacementPoints = replacementByPosition.get(keeper.position) ?? 0;
    const vor = Math.max(points - replacementPoints, 0);
    const dollarValue = estimateMarketValue(
      vor,
      curveByPosition.get(keeper.position),
    );
    if (dollarValue !== null) {
      results.push({ fpid: keeper.fpid, dollarValue });
    }
  }
  return results;
}

// Recomputes getDraftValues for one (draftId, week, scoring) combo and
// replaces its cached rows - called once daily per draft from fetchAllData
// (after the projections/rankings it reads have refreshed), and on-demand by
// invalidateDraftValues below (a keeper change or settings edit) so the
// cache doesn't have to wait for the next day to catch up. Also called
// directly (not via the mutation wrapper below) at league-creation/
// next-season time - see convex/leagues.ts/convex/draft/history.ts - so a
// new draft's cache is never in the "empty because the daily cron hasn't run
// yet" state that forces every getDraftValues subscription onto the
// expensive live-compute path.
export async function refreshDraftValuesForLeague(
  ctx: MutationCtx,
  args: {
    draftId: Id<"drafts">;
    week: string;
    scoringConfig: ScoringConfig;
  },
) {
  const rows = await computeDraftValues(ctx, args);

  const existing = await ctx.db
    .query("draftValues")
    .withIndex("by_draft_week_scoring_teScoring_sixPointPassTds", (q) =>
      q
        .eq("draftId", args.draftId)
        .eq("week", args.week)
        .eq("scoring", args.scoringConfig.scoring)
        .eq("teScoring", args.scoringConfig.teScoring)
        .eq("sixPointPassTds", args.scoringConfig.sixPointPassTds),
    )
    .collect();
  for (const row of existing) await ctx.db.delete(row._id);

  for (const row of rows) {
    await ctx.db.insert("draftValues", {
      ...row,
      draftId: args.draftId,
      week: args.week,
      ...args.scoringConfig,
    });
  }
}

export const refreshDraftValues = internalMutation({
  args: {
    draftId: v.id("drafts"),
    week: v.string(),
    scoringConfig: scoringConfigValidator,
  },
  handler: async (ctx, args) => {
    await refreshDraftValuesForLeague(ctx, args);
  },
});

// Generic-values equivalent of refreshDraftValuesForLeague above - called
// once daily (for every scoring format) from fetchAllData, so free users
// aren't hitting the expensive live-compute fallback on every cold cache.
export async function refreshGenericDraftValuesForWeek(
  ctx: MutationCtx,
  args: { week: string; scoringConfig: ScoringConfig },
) {
  const rows = await computeGenericDraftValues(ctx, args);

  const existing = await ctx.db
    .query("genericDraftValues")
    .withIndex("by_week_scoring_teScoring_sixPointPassTds", (q) =>
      q
        .eq("week", args.week)
        .eq("scoring", args.scoringConfig.scoring)
        .eq("teScoring", args.scoringConfig.teScoring)
        .eq("sixPointPassTds", args.scoringConfig.sixPointPassTds),
    )
    .collect();
  for (const row of existing) await ctx.db.delete(row._id);

  for (const row of rows) {
    await ctx.db.insert("genericDraftValues", {
      ...row,
      week: args.week,
      ...args.scoringConfig,
    });
  }
}

export const refreshGenericDraftValues = internalMutation({
  args: { week: v.string(), scoringConfig: scoringConfigValidator },
  handler: async (ctx, args) => {
    await refreshGenericDraftValuesForWeek(ctx, args);
  },
});

// Clears every cached combo (any week/scoring) for one draft - called
// inline (same transaction, plain ctx.db, not a separate mutation call) by
// whatever actually changes getDraftValues' inputs off the daily cycle: a
// keeper added/removed (convex/draft/picks.ts) or season settings edited
// (convex/leagues.ts's updateSeason). Deliberately just deletes rather than
// recomputing inline - getDraftValues' cache-miss fallback already makes a
// stale/missing cache correct, and recomputing here would duplicate that
// same read cost inside every keeper edit instead of once on the next
// actual read.
export async function invalidateDraftValues(
  ctx: MutationCtx,
  draftId: Id<"drafts">,
) {
  const cached = await ctx.db
    .query("draftValues")
    .withIndex("by_draft_week_scoring_teScoring_sixPointPassTds", (q) =>
      q.eq("draftId", draftId),
    )
    .collect();
  for (const row of cached) await ctx.db.delete(row._id);
}

// One-off migration helpers: wipe draftValues/genericDraftValues so they can
// be reseeded with the new required teScoring/sixPointPassTds fields (added
// when TE Premium/6pt passing TDs shipped) - existing rows predate those
// fields and would fail schema validation otherwise. Same wipe-and-rebuild
// precedent as convex/playerPoints.ts's clearSeasonStats / convex/
// valueGaps.ts's clearValueGaps. Safe to run any time after that:
// getDraftValues' cache-miss fallback keeps every read correct while the
// cache is empty, and refreshCaches (or the next daily cron) reseeds it.
export const clearDraftValues = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("draftValues")
      .paginate({ cursor: args.cursor ?? null, numItems: 500 });

    for (const row of result.page) {
      await ctx.db.delete(row._id);
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.draftValues.clearDraftValues, {
        cursor: result.continueCursor,
      });
    }
  },
});

export const clearGenericDraftValues = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("genericDraftValues")
      .paginate({ cursor: args.cursor ?? null, numItems: 500 });

    for (const row of result.page) {
      await ctx.db.delete(row._id);
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.draftValues.clearGenericDraftValues,
        { cursor: result.continueCursor },
      );
    }
  },
});
