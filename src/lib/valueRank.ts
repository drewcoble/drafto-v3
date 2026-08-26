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
