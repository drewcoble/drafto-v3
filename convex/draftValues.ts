import { v } from "convex/values";
import {
  query,
  internalMutation,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import { positionValidator, POSITIONS } from "./positions";
import { scoringValidator, pointsForScoring, Scoring } from "./scoring";
import { Doc, Id } from "./_generated/dataModel";

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

/**
 * Auction/salary-cap $ value per player, computed from current projections +
 * the draft's season settings.
 *
 * Value-Based Drafting: find each position's replacement-level player (the
 * last one who'd realistically be rostered given league settings, including
 * a two-tier flex-value allocation - FLEX then SUPERFLEX - across whichever
 * positions are eligible for each), then split the league's total spendable
 * auction dollars proportionally to how far above that replacement level
 * each player projects.
 *
 * Keepers (pre-draft picks tagged isKeeper on draftPicks) are excluded from
 * the pool entirely, and both the per-position replacement demand and the
 * total spendable dollars are reduced to reflect the slots/$ they've
 * already claimed - see the keeper read below.
 *
 * Always computes every active position at once - the cross-position
 * replacement/flex computation needs the whole pool regardless, so
 * getDraftValues' optional `position` arg only filters this function's
 * output, never its inputs. Factored out (mirrors convex/valueGaps.ts) so
 * both the cache-miss fallback in getDraftValues and refreshDraftValues'
 * daily precompute share one implementation.
 */
async function computeDraftValues(
  ctx: QueryCtx | MutationCtx,
  args: {
    draftId: Id<"drafts">;
    week: string;
    scoring: Scoring;
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

  // A position only matters to this league if it fills a dedicated roster
  // slot or is eligible for FLEX/SUPERFLEX - e.g. a 0-K league shouldn't
  // have kickers costing anything or showing up at all. Everything below
  // is scoped to this list instead of the full POSITIONS union.
  const activePositions = POSITIONS.filter(
    (pos) =>
      settings.rosterSlots[pos] > 0 ||
      settings.flexPositions.includes(pos) ||
      settings.superflexPositions.includes(pos),
  );

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
  const keptCountByPos = {} as Record<Position, number>;
  let keptDollars = 0;
  for (const keeper of keepers) {
    keptCountByPos[keeper.position] =
      (keptCountByPos[keeper.position] ?? 0) + 1;
    keptDollars += keeper.price;
  }

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
        q.eq("position", pos).eq("week", args.week),
      )
      .collect();
    const available = rows.filter((row) => !keptFpids.has(row.fpid));
    available.sort(
      (a, b) =>
        pointsForScoring(b, args.scoring) - pointsForScoring(a, args.scoring),
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
    QB: Math.max(
      settings.teamCount * settings.rosterSlots.QB - (keptCountByPos.QB ?? 0),
      0,
    ),
    RB: Math.max(
      settings.teamCount * settings.rosterSlots.RB - (keptCountByPos.RB ?? 0),
      0,
    ),
    WR: Math.max(
      settings.teamCount * settings.rosterSlots.WR - (keptCountByPos.WR ?? 0),
      0,
    ),
    TE: Math.max(
      settings.teamCount * settings.rosterSlots.TE - (keptCountByPos.TE ?? 0),
      0,
    ),
    DST: Math.max(
      settings.teamCount * settings.rosterSlots.DST - (keptCountByPos.DST ?? 0),
      0,
    ),
    K: Math.max(
      settings.teamCount * settings.rosterSlots.K - (keptCountByPos.K ?? 0),
      0,
    ),
  };

  // Flex candidates: players ranked beyond their own position's non-flex
  // demand, pooled across flex-eligible positions and ranked by raw points.
  // Whoever wins a flex slot pushes their position's true replacement rank
  // down by one.
  const flexCandidates: Array<{ position: Position; points: number }> = [];
  for (const pos of settings.flexPositions) {
    const sorted = byPosition.get(pos) ?? [];
    for (const row of sorted.slice(nonFlexDemand[pos])) {
      flexCandidates.push({
        position: pos,
        points: pointsForScoring(row, args.scoring),
      });
    }
  }
  flexCandidates.sort((a, b) => b.points - a.points);
  const flexDemand = settings.teamCount * settings.rosterSlots.FLEX;
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
  for (const pos of settings.superflexPositions) {
    const sorted = byPosition.get(pos) ?? [];
    const alreadyClaimed = nonFlexDemand[pos] + (flexWonCount.get(pos) ?? 0);
    for (const row of sorted.slice(alreadyClaimed)) {
      superflexCandidates.push({
        position: pos,
        points: pointsForScoring(row, args.scoring),
      });
    }
  }
  superflexCandidates.sort((a, b) => b.points - a.points);
  const superflexDemand = settings.teamCount * settings.rosterSlots.SUPERFLEX;
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
      replacementPoints[pos] = pointsForScoring(replacement, args.scoring);
      usedFallback[pos] = false;
    } else if (last) {
      replacementPoints[pos] = pointsForScoring(last, args.scoring);
      usedFallback[pos] = true;
    } else {
      replacementPoints[pos] = 0;
      usedFallback[pos] = true;
    }
  }

  // $1 reserved per roster slot league-wide; remaining surplus split
  // proportionally to value-over-replacement across every player.
  const totalRosterSlots =
    settings.rosterSlots.QB +
    settings.rosterSlots.RB +
    settings.rosterSlots.WR +
    settings.rosterSlots.TE +
    settings.rosterSlots.DST +
    settings.rosterSlots.K +
    settings.rosterSlots.FLEX +
    settings.rosterSlots.SUPERFLEX +
    settings.rosterSlots.BENCH;
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
  // Dollars already committed to keepers are off the auction table, and
  // each kept player fills a roster slot that no longer needs its $1
  // reservation out of the surplus pool.
  const totalDraftDollars = totalCapDollars - keptDollars;
  const baselineDollars =
    settings.teamCount * totalRosterSlots - keepers.length;
  const surplusDollars = totalDraftDollars - baselineDollars;

  // Splitting the surplus purely linearly by VOR over-concentrates dollars
  // on the very top of the pool (elite players blow past realistic auction
  // prices) and starves everyone just below them. Using VOR^FALLOFF_EXPONENT
  // as the allocation weight instead keeps the same rank order but
  // compresses that top-end spike into a believable curve - raw VOR is
  // still returned below as valueOverReplacement, it's only the $ split
  // that changes.
  const FALLOFF_EXPONENT = 0.85;
  let totalWeight = 0;
  const vorByFpid = new Map<number, number>();
  const weightByFpid = new Map<number, number>();
  for (const pos of activePositions) {
    for (const row of byPosition.get(pos) ?? []) {
      const vor = Math.max(
        pointsForScoring(row, args.scoring) - replacementPoints[pos],
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
        const points = pointsForScoring(row, args.scoring);
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

// Public, frontend-facing entry point - takes a seasonId (what every route/
// component actually has on hand) and resolves it to that season's real
// draft internally, same lookup convex/draft/auth.ts's requireRealDraft
// does. Deliberately not auth-gated (same as before the league/season/draft
// split): draft values are read-only derived data, cheap to expose by id.
export const getDraftValues = query({
  args: {
    seasonId: v.id("seasons"),
    week: v.string(),
    scoring: scoringValidator,
    // Omit to get every position back in one call (the combined players
    // table) - computeDraftValues always computes every active position
    // regardless, this only changes which rows are returned.
    position: v.optional(positionValidator),
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db
      .query("drafts")
      .withIndex("by_season_kind", (q) =>
        q.eq("seasonId", args.seasonId).eq("kind", "real"),
      )
      .first();
    if (!draft) return [];

    const cached = await ctx.db
      .query("draftValues")
      .withIndex("by_draft_week_scoring", (q) =>
        q
          .eq("draftId", draft._id)
          .eq("week", args.week)
          .eq("scoring", args.scoring),
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
            scoring: args.scoring,
          });

    return args.position
      ? rows.filter((row) => row.position === args.position)
      : rows;
  },
});

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
    scoring: Scoring;
  },
) {
  const rows = await computeDraftValues(ctx, args);

  const existing = await ctx.db
    .query("draftValues")
    .withIndex("by_draft_week_scoring", (q) =>
      q
        .eq("draftId", args.draftId)
        .eq("week", args.week)
        .eq("scoring", args.scoring),
    )
    .collect();
  for (const row of existing) await ctx.db.delete(row._id);

  for (const row of rows) {
    await ctx.db.insert("draftValues", { ...row, ...args });
  }
}

export const refreshDraftValues = internalMutation({
  args: {
    draftId: v.id("drafts"),
    week: v.string(),
    scoring: scoringValidator,
  },
  handler: async (ctx, args) => {
    await refreshDraftValuesForLeague(ctx, args);
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
    .withIndex("by_draft_week_scoring", (q) => q.eq("draftId", draftId))
    .collect();
  for (const row of cached) await ctx.db.delete(row._id);
}
