import { v } from "convex/values";
import { query } from "./_generated/server";
import { positionValidator, POSITIONS } from "./positions";
import { scoringValidator, pointsForScoring } from "./scoring";
import { Doc } from "./_generated/dataModel";

type Position = (typeof POSITIONS)[number];

/**
 * Auction/salary-cap $ value per player, computed fresh on every call from
 * current projections + draft settings (not precomputed/stored).
 *
 * Value-Based Drafting: find each position's replacement-level player (the
 * last one who'd realistically be rostered given league settings, including
 * a two-tier flex-value allocation - FLEX then SUPERFLEX - across whichever
 * positions are eligible for each), then split the league's total spendable
 * auction dollars proportionally to how far above that replacement level
 * each player projects.
 */
export const getDraftValues = query({
  args: {
    draftSettingsId: v.id("draftSettings"),
    week: v.string(),
    scoring: scoringValidator,
    // Omit to get every position back in one call (the combined players
    // table) - the cross-position replacement/flex computation below runs
    // identically either way, this only changes which rows are returned.
    position: v.optional(positionValidator),
  },
  handler: async (ctx, args) => {
    const settings = await ctx.db.get(args.draftSettingsId);
    if (!settings) {
      throw new Error("Draft settings not found");
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

    // Load + rank every active position's projections for this week -
    // replacement level depends on the whole league's player pool, not just
    // one position.
    const byPosition = new Map<Position, Doc<"projections">[]>();
    for (const pos of activePositions) {
      const rows = await ctx.db
        .query("projections")
        .withIndex("by_position_week", (q) =>
          q.eq("position", pos).eq("week", args.week),
        )
        .collect();
      rows.sort(
        (a, b) =>
          pointsForScoring(b, args.scoring) - pointsForScoring(a, args.scoring),
      );
      byPosition.set(pos, rows);
    }

    // Non-flex starter demand per position.
    const nonFlexDemand: Record<Position, number> = {
      QB: settings.teamCount * settings.rosterSlots.QB,
      RB: settings.teamCount * settings.rosterSlots.RB,
      WR: settings.teamCount * settings.rosterSlots.WR,
      TE: settings.teamCount * settings.rosterSlots.TE,
      DST: settings.teamCount * settings.rosterSlots.DST,
      K: settings.teamCount * settings.rosterSlots.K,
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
    const superflexCandidates: Array<{ position: Position; points: number }> =
      [];
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
    const totalDraftDollars = settings.teamCount * settings.salaryCap;
    const baselineDollars = settings.teamCount * totalRosterSlots;
    const surplusDollars = totalDraftDollars - baselineDollars;

    // Splitting the surplus purely linearly by VOR over-concentrates dollars
    // on the very top of the pool (elite players blow past realistic auction
    // prices) and starves everyone just below them. Using VOR^0.6 as the
    // allocation weight instead keeps the same rank order but compresses
    // that top-end spike into a believable curve - raw VOR is still returned
    // below as valueOverReplacement, it's only the $ split that changes.
    // (0.6 tuned against real projections: it lands top-tier RB/WR studs in
    // the $50-60 range - 0.5/sqrt over-corrected them down near $50, 1.0/
    // linear blew them past $85.)
    const FALLOFF_EXPONENT = 0.6;
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

    const targetPositions = args.position
      ? activePositions.filter((pos) => pos === args.position)
      : activePositions;
    const output = [];
    for (const pos of targetPositions) {
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
  },
});
