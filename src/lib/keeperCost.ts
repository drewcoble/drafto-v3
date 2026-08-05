import type { Doc } from "../../convex/_generated/dataModel";

export type KeeperRules = NonNullable<Doc<"seasons">["keeperRules"]>;
export type KeeperFormula = KeeperRules["defaultFormula"];
export type KeeperTier = KeeperRules["tiers"][number];

// Mirrors the shape returned by convex/draft/history.ts's
// getPlayerPriceHistory - kept as its own type here (rather than derived
// from the query's return type) since it's a plain Record, same as
// KeeperSearchForm.tsx already declared inline before this file existed.
export interface KeeperPriceHistoryEntry {
  price: number;
  season: string | undefined;
  isKeeper: boolean;
  keeperStreak: number | undefined;
  fromImmediateParent: boolean;
}

// The formula that applies to a given player: the first tier whose fpids
// contains them, else the league's default formula. Tiers are checked in
// array order - the panel that edits keeperRules is responsible for keeping
// a player out of more than one tier (see setKeeperTierPlayers), so order
// only matters as a tiebreak if that invariant is ever violated.
export function formulaForFpid(
  keeperRules: KeeperRules,
  fpid: number,
): KeeperFormula {
  const tier = keeperRules.tiers.find((t) => t.fpids.includes(fpid));
  return tier ? tier.formula : keeperRules.defaultFormula;
}

// The suggested keeper cost for a player given their resolved formula and
// their most recent prior-season price (undefined for a player who wasn't
// drafted/kept last season, e.g. a rookie). Returns null when there's
// nothing to suggest - no prior price and no undraftedCost rule configured
// - so callers fall back to manual entry instead of showing a made-up $0.
export function computeKeeperCost(
  formula: KeeperFormula,
  priorPrice: number | undefined,
): number | null {
  if (priorPrice === undefined) {
    return formula.undraftedCost ?? null;
  }
  const raw = formula.multiplier * priorPrice + formula.flatAdd;
  const floored =
    formula.minimumCost !== undefined
      ? Math.max(raw, formula.minimumCost)
      : raw;
  return Math.round(floored);
}

// Mirrors convex/draft/picks.ts's computeKeeperStreak exactly: only the
// immediately-prior season counts (a gap resets to 1), regardless of how far
// back getPlayerPriceHistory's entry for this fpid actually came from. Keep
// this in sync with that function - it exists so the client can preview the
// same number addKeeper will compute server-side without a round trip.
export function prospectiveKeeperStreak(
  entry: KeeperPriceHistoryEntry | undefined,
): number {
  if (entry?.fromImmediateParent && entry.isKeeper) {
    return (entry.keeperStreak ?? 1) + 1;
  }
  return 1;
}
