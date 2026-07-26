import { v } from "convex/values";
import { query } from "../_generated/server";
import { api } from "../_generated/api";
import { positionValidator, POSITIONS } from "../positions";
import { scoringValidator } from "../scoring";
import { requireDraftOwner } from "./auth";

type Position = (typeof POSITIONS)[number];

// Matches draftValues.getDraftValues' return shape - annotated explicitly
// (rather than inferred through ctx.runQuery) to avoid a TS7022 circular-type
// error: this file's own export feeds back into the `api` object that
// draftValues.getDraftValues's reference is read from.
interface DraftValueRow {
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

// Hardcoded rank cutoffs per position, in the same spirit as
// FALLOFF_EXPONENT in convex/draftValues.ts - a tunable constant rather than
// per-league schema, since tiers are a rough drafting heuristic, not
// something that needs re-editing every season.
const TIER_BREAKPOINTS: Record<Position, number[]> = {
  QB: [3, 8, 14, 20, 32],
  RB: [3, 8, 16, 24, 36, 50],
  WR: [3, 8, 16, 24, 36, 50],
  TE: [3, 8, 14, 20],
  DST: [6, 12, 20],
  K: [6, 12, 20],
};

function tierForRank(position: Position, positionRank: number) {
  const breakpoints = TIER_BREAKPOINTS[position];
  const tier = breakpoints.findIndex((cutoff) => positionRank <= cutoff);
  const tierNumber = tier === -1 ? breakpoints.length + 1 : tier + 1;
  return { tier: tierNumber, tierLabel: `Tier ${tierNumber}` };
}

// Wraps draftValues.getDraftValues (the existing VBD $ engine) with tiers -
// deliberately NOT joined with draftPicks here. This query's only read
// dependencies are draftSettings + projections, both stable for the
// duration of a draft, so it doesn't get invalidated/recomputed on every
// single pick the way a picks-joined version would. Live "is this player
// drafted" status is joined client-side instead (see PlayersLeftTab, which
// already has a listDraftPicks subscription for other reasons) - that join
// is cheap and re-running it on every pick is fine; re-running this VBD
// computation on every pick was the expensive part.
export const getDraftBoard = query({
  args: {
    draftSettingsId: v.id("draftSettings"),
    week: v.string(),
    scoring: scoringValidator,
    position: v.optional(positionValidator),
  },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);

    const values: DraftValueRow[] = await ctx.runQuery(
      api.draftValues.getDraftValues,
      {
        draftSettingsId: args.draftSettingsId,
        week: args.week,
        scoring: args.scoring,
        ...(args.position ? { position: args.position } : {}),
      },
    );

    return values.map((row) => {
      const { tier, tierLabel } = tierForRank(row.position, row.positionRank);
      return { ...row, tier, tierLabel };
    });
  },
});
