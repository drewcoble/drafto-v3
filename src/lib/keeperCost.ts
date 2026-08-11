import type { Doc } from "../../convex/_generated/dataModel";
import type { Position } from "../types";

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
  // Only set when the source pick was teamAssignmentConfirmed (see
  // schema.ts) - a manually-entered end-of-season roster, not just wherever
  // a provider import/draft-day snapshot happened to place the player.
  teamName: string | undefined;
}

// The formula that applies to a given player: the first tier whose fpids
// contains them, or (failing that) whose positions includes theirs, else the
// league's default formula. Tiers are checked in array order - the panel
// that edits keeperRules is responsible for keeping a player's fpid out of
// more than one tier (see setKeeperTierPlayers), but a player can still fall
// under more than one tier's position list, so order matters as a tiebreak
// there too.
export function formulaForFpid(
  keeperRules: KeeperRules,
  fpid: number,
  position: Position,
): KeeperFormula {
  const tier = keeperRules.tiers.find(
    (t) => t.fpids.includes(fpid) || t.positions?.includes(position),
  );
  return tier ? tier.formula : keeperRules.defaultFormula;
}

// The suggested keeper cost for a player given their resolved formula and
// their most recent prior-season price (undefined for a player who wasn't
// drafted/kept last season, e.g. a rookie; 0 for a player manually entered
// as an undrafted/waiver pickup - see ManualPreviousSeasonModal.tsx, which
// allows a $0 price for exactly this case). Both route through
// undraftedCost rather than the multiplier/flatAdd formula below - a $0
// prior price isn't a real auction result to scale from, and letting it
// fall through would let minimumCost inflate a free pickup into a paid
// suggestion. Returns null when there's nothing to suggest - no prior price
// and no undraftedCost rule configured - so callers fall back to manual
// entry instead of showing a made-up $0.
export function computeKeeperCost(
  formula: KeeperFormula,
  priorPrice: number | undefined,
): number | null {
  if (priorPrice === undefined || priorPrice === 0) {
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
