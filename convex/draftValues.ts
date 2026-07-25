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
 * a proper flex-value allocation across flex-eligible positions), then split
 * the league's total spendable auction dollars proportionally to how far
 * above that replacement level each player projects.
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

    // Load + rank every position's projections for this week - replacement
    // level depends on the whole league's player pool, not just one position.
    const byPosition = new Map<Position, Doc<"projections">[]>();
    for (const pos of POSITIONS) {
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

    // Replacement rank + points per position. If the exact rank isn't in our
    // data yet (e.g. we need RB25 but only have 10 RBs due to the FantasyPros
    // pagination gap), fall back to a % of the last available player.
    const replacementPoints = {} as Record<Position, number>;
    const usedFallback = {} as Record<Position, boolean>;
    for (const pos of POSITIONS) {
      const sorted = byPosition.get(pos) ?? [];
      const rank = nonFlexDemand[pos] + (flexWonCount.get(pos) ?? 0) + 1;
      const replacement = sorted[rank - 1];
      const last = sorted[sorted.length - 1];

      if (replacement) {
        replacementPoints[pos] = pointsForScoring(replacement, args.scoring);
        usedFallback[pos] = false;
      } else if (last) {
        replacementPoints[pos] =
          pointsForScoring(last, args.scoring) * settings.replacementFallbackPct;
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
      settings.rosterSlots.FLEX +
      settings.rosterSlots.BENCH;
    const totalDraftDollars = settings.teamCount * settings.salaryCap;
    const baselineDollars = settings.teamCount * totalRosterSlots;
    const surplusDollars = totalDraftDollars - baselineDollars;

    let totalVor = 0;
    const vorByFpid = new Map<number, number>();
    for (const pos of POSITIONS) {
      for (const row of byPosition.get(pos) ?? []) {
        const vor = Math.max(
          pointsForScoring(row, args.scoring) - replacementPoints[pos],
          0,
        );
        vorByFpid.set(row.fpid, vor);
        totalVor += vor;
      }
    }

    const targetPositions = args.position ? [args.position] : POSITIONS;
    const output = [];
    for (const pos of targetPositions) {
      const targetRows = byPosition.get(pos) ?? [];
      output.push(
        ...targetRows.map((row, index) => {
          const points = pointsForScoring(row, args.scoring);
          const vor = vorByFpid.get(row.fpid) ?? 0;
          const dollarValue =
            totalVor > 0 ? 1 + (vor / totalVor) * surplusDollars : 1;

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
