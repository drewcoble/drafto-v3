import { expandRosterSlots, type RosterSlotCounts } from "./rosterSlots";

export interface TeamBudgetStats {
  remaining: number;
  spent: number;
  openSlots: number;
  totalSlots: number;
  // $1/slot is reserved for every other still-open slot, so this is the most
  // this team could bid on one player without going unable to fill the rest
  // of its roster.
  maxBid: number;
  perOpenSlot: number;
  // The most this team could bid on the current player and still afford the
  // rest of its budget plan for every other unfilled slot - null when there's
  // no plan to reconcile against (always true for opponents, since we never
  // see their plan).
  planSafe: number | null;
}

export function computeTeamBudgetStats(
  salaryCap: number,
  rosterSlots: RosterSlotCounts,
  picksCount: number,
  spent: number,
  unfilledPlanTotal?: number,
): TeamBudgetStats {
  const totalSlots = expandRosterSlots(rosterSlots).length;
  const openSlots = Math.max(totalSlots - picksCount, 0);
  const remaining = salaryCap - spent;
  const maxBid = openSlots > 0 ? remaining - (openSlots - 1) : remaining;
  const perOpenSlot = openSlots > 0 ? remaining / openSlots : 0;
  const planSafe =
    unfilledPlanTotal !== undefined ? remaining - unfilledPlanTotal : null;
  return {
    remaining,
    spent,
    openSlots,
    totalSlots,
    maxBid,
    perOpenSlot,
    planSafe,
  };
}
