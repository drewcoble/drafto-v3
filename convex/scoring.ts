import { v } from "convex/values";
import { POSITIONS } from "./positions";

type Position = (typeof POSITIONS)[number];

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

export const teScoringValidator = v.union(
  v.literal("NONE"),
  v.literal("HALF"),
  v.literal("FULL"),
);

export type TeScoring = "NONE" | "HALF" | "FULL";

export const scoringConfigValidator = v.object({
  scoring: scoringValidator,
  teScoring: teScoringValidator,
  sixPointPassTds: v.boolean(),
});

export interface ScoringConfig {
  scoring: Scoring;
  teScoring: TeScoring;
  sixPointPassTds: boolean;
}

const TE_BONUS_PER_REC: Record<TeScoring, number> = {
  NONE: 0,
  HALF: 0.5,
  FULL: 1,
};

// Extra points beyond Sleeper's own pts_std/pts_half_ppr/pts_ppr columns -
// TE-only reception bonus and/or the +2/passing-TD bump that turns the
// already-baked-in 4pt TD into 6. Sleeper has no precomputed column for
// either, so this is computed here from each row's raw per-category stats
// blob (see sleeper/projections.ts's numericStats, which keeps "rec" and
// "pass_td" alongside every other raw Sleeper stat key). Always additive on
// top of pointsForScoring, never a replacement for it.
export function bonusPoints(
  row: { position: Position; stats: Record<string, number> },
  config: ScoringConfig,
): number {
  let bonus = 0;
  if (row.position === "TE") {
    bonus += (row.stats.rec ?? 0) * TE_BONUS_PER_REC[config.teScoring];
  }
  if (config.sixPointPassTds) {
    bonus += (row.stats.pass_td ?? 0) * 2;
  }
  return bonus;
}

// pointsForScoring (Sleeper's baseline) plus this app's TE premium / 6pt
// passing TD bonus on top - the function every points-producing call site
// should use instead of calling pointsForScoring directly, now that scoring
// has dimensions Sleeper doesn't supply a precomputed column for.
export function pointsForScoringConfig(
  row: {
    position: Position;
    pointsStd: number;
    pointsHalf: number;
    pointsPpr: number;
    stats: Record<string, number>;
  },
  config: ScoringConfig,
): number {
  return pointsForScoring(row, config.scoring) + bonusPoints(row, config);
}

// Derives a ScoringConfig from a seasons doc. teScoring/sixPointPassTds are
// v.optional (existing seasons rows predate this feature) - absent means
// NONE/off (the pre-feature behavior), NOT "absent means enabled" the way
// seasons.useKeepers works, since every league that existed before this
// shipped was implicitly playing with no bonus.
export function scoringConfigFromSeason(season: {
  scoring: Scoring;
  teScoring?: TeScoring;
  sixPointPassTds?: boolean;
}): ScoringConfig {
  return {
    scoring: season.scoring,
    teScoring: season.teScoring ?? "NONE",
    sixPointPassTds: season.sixPointPassTds ?? false,
  };
}
