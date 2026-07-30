import { v } from "convex/values";

export const scoringValidator = v.union(
  v.literal("STD"),
  v.literal("HALF"),
  v.literal("PPR"),
);

export type Scoring = "STD" | "HALF" | "PPR";

export function pointsForScoring(
  row: { pointsStd: number; pointsHalf: number; pointsPpr: number },
  scoring: Scoring,
): number {
  if (scoring === "STD") return row.pointsStd;
  if (scoring === "HALF") return row.pointsHalf;
  return row.pointsPpr;
}

export function adpForScoring(
  row: { adpStd: number; adpHalf: number; adpPpr: number },
  scoring: Scoring,
): number {
  if (scoring === "STD") return row.adpStd;
  if (scoring === "HALF") return row.adpHalf;
  return row.adpPpr;
}
