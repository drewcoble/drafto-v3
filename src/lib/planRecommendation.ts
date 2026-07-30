import type { Position } from "../types";
import type { SlotDescriptor } from "./rosterSlots";

export interface PlanSlotMatch {
  slotKey: string;
  slotLabel: string;
  amount: number;
  isExactPosition: boolean;
}

// Finds which of a team's still-open roster slots a player's market $ value
// should be measured against, using strict tier precedence - an open
// exact-position slot (e.g. QB1/QB2) always wins over SUPERFLEX, which
// always wins over FLEX, no matter which is numerically closer in $. Paying
// "SUPERFLEX money" for a QB when a real QB slot is sitting open is never
// the right read, even when the SUPERFLEX budget happens to be closer to
// this player's value. Bench is deliberately excluded entirely - it has no
// bearing on whether a player "fits the budget" for a real roster spot, and
// matching against a token $1-3 bench amount produced false negatives (e.g.
// a $10 QB reading as over-budget because it was measured against a $3
// bench slot instead of the $19 SUPERFLEX slot that was actually still
// open).
//
// Only *within* the winning tier - when it has more than one open slot,
// e.g. QB1 vs QB2, or FLEX1 vs FLEX2 - does closeness in $ decide which one:
// a $23 WR nominated while both WR2 ($23 budgeted) and WR1 ($40 budgeted)
// are open should read against WR2's price, not whichever is open first.
//
// This is deliberately separate from slotAssignment.ts's assignSlotForPick,
// which assigns slots to *already-drafted* picks by roster order, not
// value - that's a record of what happened, this is a hypothetical for a
// player still on the board.
export function matchPlanSlot(
  position: Position,
  dollarValue: number,
  openSlots: readonly SlotDescriptor[],
  amounts: Record<string, number>,
  flexPositions: readonly Position[],
  superflexPositions: readonly Position[],
): PlanSlotMatch | undefined {
  const exactSlots = openSlots.filter((slot) => slot.position === position);
  const superflexSlots = superflexPositions.includes(position)
    ? openSlots.filter((slot) => slot.label.startsWith("SFLEX"))
    : [];
  const flexSlots = flexPositions.includes(position)
    ? openSlots.filter((slot) => slot.label.startsWith("FLEX"))
    : [];

  const tier = [exactSlots, superflexSlots, flexSlots].find(
    (slots) => slots.length > 0,
  );
  if (!tier) return undefined;

  let best: SlotDescriptor | undefined;
  let bestAmount = 0;
  let bestDist = Infinity;
  for (const slot of tier) {
    const amount = amounts[slot.key] ?? 0;
    const dist = Math.abs(amount - dollarValue);
    if (!best || dist < bestDist) {
      best = slot;
      bestAmount = amount;
      bestDist = dist;
    }
  }
  if (!best) return undefined;

  return {
    slotKey: best.key,
    slotLabel: best.label,
    amount: bestAmount,
    isExactPosition: best.position === position,
  };
}
