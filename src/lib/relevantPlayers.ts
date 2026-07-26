import type { Position, ScoringFormat } from "../types";

export function pointsForScoring(
  row: { pointsStd: number; pointsHalf: number; pointsPpr: number },
  scoring: ScoringFormat,
): number {
  if (scoring === "STD") return row.pointsStd;
  if (scoring === "HALF") return row.pointsHalf;
  return row.pointsPpr;
}

export function adpForScoring(
  row: { adpStd: number; adpHalf: number; adpPpr: number },
  scoring: ScoringFormat,
): number {
  if (scoring === "STD") return row.adpStd;
  if (scoring === "HALF") return row.adpHalf;
  return row.adpPpr;
}

// Sleeper's player pool includes thousands of practice-squad/deep-bench
// players with no real draft relevance. Sleeper flags this itself: ADP is
// 999 ("effectively never drafted") for the vast majority of QB/RB/WR/TE -
// only ~245 skill-position players have a real ADP as of this writing. DST
// never gets a real ADP from Sleeper at all, but it's already naturally
// capped at exactly 32 (one per team), so it needs no filtering.
const NO_REAL_ADP = 999;

export interface PositionedRow {
  fpid: number;
  position: Position;
}

// Trim the thousands of practice-squad/deep-bench players Sleeper returns
// down to actually draft-relevant ones: real ADP for skill positions, any
// DST (already naturally capped at 32 - one per team), or K filtered by
// projected points instead of ADP (Sleeper never gives K a real ADP either,
// but unlike DST there are far more than 32). `getPoints` is a callback
// rather than requiring the full pointsStd/Half/Ppr triple on T, since some
// callers (e.g. draft.board.getDraftBoard rows) only carry one
// already-scoring-resolved `points` field.
export function filterRelevantPlayers<T extends PositionedRow>(
  rows: T[],
  activePositions: Position[],
  scoring: ScoringFormat,
  adpByFpid: Map<number, { adpStd: number; adpHalf: number; adpPpr: number }>,
  getPoints: (row: T) => number,
): T[] {
  return rows.filter((row) => {
    if (!activePositions.includes(row.position)) return false;
    if (row.position === "DST") return true;
    if (row.position === "K") return getPoints(row) > 0;
    const adp = adpByFpid.get(row.fpid);
    return adp !== undefined && adpForScoring(adp, scoring) < NO_REAL_ADP;
  });
}
