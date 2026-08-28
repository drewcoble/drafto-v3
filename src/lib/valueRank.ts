import type { Position, ScoringFormat } from "../types";
import { adpForScoring, RELEVANT_ADP_CEILING } from "./relevantPlayers";
import type { StandardValueRow } from "./standardValues";

// Shared "pool everyone by dollarValue descending" primitive - originally
// lived in keeperCost.ts (still its main consumer, via
// valueImpliedRound/expectedValueAtRound), but PlayersTable.tsx's
// snake/linear "vs ADP" column needs the exact same pooled dollarValue rank
// as its own "our rank" side of that diff, so this was pulled out to a
// neutral home rather than duplicated. See keeperCost.ts's
// valueImpliedRound/expectedValueAtRound for why this ranks by dollarValue
// (not real ADP) - a player's own projected value against a pooled,
// position-agnostic curve, immune to ADP's real-world position-run
// distortion. Callers should pass only the currently available/undrafted
// pool - a kept/drafted player isn't actually available at any rank this
// year and would skew the bands (see each call site's own comment on how
// its pool is scoped).
export interface ValueRankEntry {
  fpid: number;
  dollarValue: number;
}

export function sortValuesDescending(
  values: readonly ValueRankEntry[],
): ValueRankEntry[] {
  return [...values].sort((a, b) => b.dollarValue - a.dollarValue);
}

// fpid -> 1-indexed rank within the pool sortValuesDescending returns -
// PlayersTable.tsx's "our rank" needs O(1) lookup per row, unlike
// keeperCost.ts's valueImpliedRound/expectedValueAtRound, which operate on
// the raw sorted array directly (findIndex/slice against a specific target
// value or round band).
export function rankByDollarValue(
  sortedDescending: readonly ValueRankEntry[],
): Map<number, number> {
  const map = new Map<number, number>();
  sortedDescending.forEach((entry, index) => map.set(entry.fpid, index + 1));
  return map;
}

// Positions "our rank"/"vs ADP" are scoped to - same PREMIER_POSITIONS list
// convex/valueGaps.ts's VALUE_GAP_POSITIONS and
// convex/gemini/preDraftInsights.ts's PREMIER_POSITIONS already establish.
// K/DST vs-ADP is never a useful takeaway, so both builders below exclude
// them from the ranking pool.
const PREMIER_POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

interface AdpRow {
  adpStd: number;
  adpHalf: number;
  adpPpr: number;
}

// Snake/linear's "ADP" column: Sleeper ADP (scoring-matched) averaged with
// ESPN's own overall draft-kit rank - two independently-sourced market
// consensus numbers agreeing is a stronger signal than either alone, same
// reasoning convex/valueGaps.ts's buildEspnRankByFpid already uses. Falls
// back to whichever one exists if only one does. Superflex leagues use
// ESPN's superflex rank alone - Sleeper has no superflex-aware ADP field at
// all (see schema.ts's rankings table), so blending it in would water
// down/mislead the superflex signal, same "superflex overrides scoring-
// format nuance" precedent buildStandardValueByFpid already sets for the
// auction $-vs-market column. Shared by PlayersTable.tsx (pre-draft) and
// PlayersLeftTab.tsx (in-draft) so the two never compute a different ADP
// number for the same player.
export function buildBlendedAdpByFpid(
  adpByFpid: ReadonlyMap<number, AdpRow>,
  standardValueByFpid: ReadonlyMap<number, StandardValueRow>,
  isSuperflex: boolean,
  scoring: ScoringFormat,
): Map<number, number> {
  const map = new Map<number, number>();
  const fpids = new Set<number>([
    ...adpByFpid.keys(),
    ...standardValueByFpid.keys(),
  ]);
  for (const fpid of fpids) {
    const espnRank = standardValueByFpid.get(fpid)?.rank;
    if (isSuperflex) {
      if (espnRank !== undefined) map.set(fpid, espnRank);
      continue;
    }
    const sleeperRow = adpByFpid.get(fpid);
    const rawSleeperAdp = sleeperRow
      ? adpForScoring(sleeperRow, scoring)
      : undefined;
    // A player with no real ADP (Sleeper's own sentinel, or a long tail of
    // technically-non-sentinel-but-still-noise values) can't be trusted as
    // a genuine market opinion - dropped rather than blended in.
    const sleeperAdp =
      rawSleeperAdp !== undefined && rawSleeperAdp < RELEVANT_ADP_CEILING
        ? rawSleeperAdp
        : undefined;
    if (sleeperAdp !== undefined && espnRank !== undefined) {
      map.set(fpid, (sleeperAdp + espnRank) / 2);
    } else if (sleeperAdp !== undefined) {
      map.set(fpid, sleeperAdp);
    } else if (espnRank !== undefined) {
      map.set(fpid, espnRank);
    }
  }
  return map;
}

// Snake/linear's "our rank" for the vs-ADP diff: every relevant active-
// position player pooled by dollarValue descending (sortValuesDescending/
// rankByDollarValue above) - dollarValue is already normalized VOR to be
// comparable across positions, used purely as an internal cross-position
// ranking key ($ itself is never displayed for a snake/linear league).
// Restricted to PREMIER_POSITIONS with a real, non-sentinel ADP - without
// this, "our rank" would be computed over a much deeper pool than blended
// ADP realistically covers, which can make a legitimately late-round
// player's vs-ADP diff read as a wild multi-hundred-spot number that isn't
// a real signal. Shared by PlayersTable.tsx and PlayersLeftTab.tsx, same
// reasoning as buildBlendedAdpByFpid above. Callers should pass the full
// board (not just currently-visible/undrafted rows) so this rank stays a
// fixed, value-based ordering independent of live draft progress.
export function buildOurRankByFpid(
  draftValues: readonly (ValueRankEntry & { position: Position })[] | undefined,
  adpByFpid: ReadonlyMap<number, AdpRow>,
  scoring: ScoringFormat,
): Map<number, number> {
  if (!draftValues) return new Map<number, number>();
  const relevantValues = draftValues.filter((row) => {
    if (!PREMIER_POSITIONS.includes(row.position)) return false;
    const adpRow = adpByFpid.get(row.fpid);
    const sleeperAdp = adpRow ? adpForScoring(adpRow, scoring) : undefined;
    return sleeperAdp !== undefined && sleeperAdp < RELEVANT_ADP_CEILING;
  });
  return rankByDollarValue(sortValuesDescending(relevantValues));
}
