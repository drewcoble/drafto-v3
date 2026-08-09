import type { OverspendBehavior } from "../types";
import {
  expandRosterSlots,
  type RosterSlotCounts,
  type SlotDescriptor,
} from "./rosterSlots";

export type BudgetPreset =
  | "starsAndScrubs"
  | "balanced"
  | "zeroRb"
  | "heroRb"
  | "superflexHeavy";

// Consumers that show these as buttons (BudgetSidePanel.tsx) drop
// "superflexHeavy" entirely for leagues with no SUPERFLEX slot - it's the
// one preset that's meaningless without one, unlike the others which
// apply to every league shape.
export const BUDGET_PRESETS: Array<{ value: BudgetPreset; label: string }> = [
  { value: "starsAndScrubs", label: "Stars & scrubs" },
  { value: "balanced", label: "Balanced" },
  { value: "zeroRb", label: "Zero RB" },
  { value: "heroRb", label: "Hero RB" },
  { value: "superflexHeavy", label: "Superflex heavy" },
];

export const DEFAULT_OVERSPEND_BEHAVIOR: OverspendBehavior = "bench";

const BASE_WEIGHT: Record<string, number> = {
  QB: 3,
  RB: 2.6,
  WR: 2.3,
  TE: 1.6,
  FLEX: 1.3,
  SFLEX: 1.9,
  DST: 0.3,
  K: 0.3,
  BN: 0.2,
};

function labelPrefix(label: string): string {
  return label.replace(/\d+$/, "");
}

function baseWeightForSlot(slot: SlotDescriptor, indexWithinGroup: number) {
  const base = BASE_WEIGHT[labelPrefix(slot.label)] ?? 1;
  // Earlier slots within the same group (RB1 before RB2, etc.) are worth
  // more - a starter's dollars matter more than a second/third of the same
  // position.
  return base * Math.pow(0.85, indexWithinGroup);
}

function presetMultiplier(
  preset: BudgetPreset,
  slot: SlotDescriptor,
  indexWithinGroup: number,
) {
  const prefix = labelPrefix(slot.label);
  switch (preset) {
    case "starsAndScrubs":
      if (prefix === "QB" || prefix === "RB" || prefix === "WR") return 1.5;
      if (prefix === "BN") return 0.4;
      return 0.8;
    case "zeroRb":
      if (prefix === "RB") return 0.45;
      if (prefix === "WR" || prefix === "TE" || prefix === "FLEX") return 1.3;
      return 1;
    case "heroRb":
      // One big-ticket "hero" RB (the earliest RB slot) soaks up what
      // Zero RB would've spread across WR/FLEX/TE - every RB slot after
      // it gets Zero RB's own suppressed rate instead, since the whole
      // point is exactly one workhorse and nothing else at the position.
      if (prefix === "RB") return indexWithinGroup === 0 ? 2.2 : 0.45;
      if (prefix === "WR" || prefix === "TE" || prefix === "FLEX") return 1.3;
      return 1;
    case "superflexHeavy":
      if (prefix === "QB" || prefix === "SFLEX") return 2;
      if (prefix === "BN") return 0.7;
      return 0.9;
    case "balanced":
    default:
      return 1;
  }
}

// Generates a starting point for the Budget tab's per-slot $ form - not
// meant to be exact, just a reasonable shape the user tunes from there.
// Reserves $1/slot as a floor, then splits the remaining surplus
// proportional to each slot's weight (earlier/starter-ier slots weigh
// more), rounding to whole dollars and reconciling any rounding remainder
// onto the single highest-weighted slot so the total always matches
// salaryCap exactly.
export function generatePresetAmounts(
  preset: BudgetPreset,
  rosterSlots: RosterSlotCounts,
  salaryCap: number,
): Record<string, number> {
  const groupIndex = new Map<string, number>();
  const weighted = expandRosterSlots(rosterSlots).map((slot) => {
    const prefix = labelPrefix(slot.label);
    const index = groupIndex.get(prefix) ?? 0;
    groupIndex.set(prefix, index + 1);
    const weight =
      baseWeightForSlot(slot, index) * presetMultiplier(preset, slot, index);
    return { slot, weight };
  });

  const surplus = Math.max(salaryCap - weighted.length, 0);
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);

  const amounts: Record<string, number> = {};
  let allocated = 0;
  let maxWeightEntry = weighted[0];
  for (const entry of weighted) {
    const share =
      totalWeight > 0 ? (entry.weight / totalWeight) * surplus : 0;
    const amount = 1 + Math.round(share);
    amounts[entry.slot.key] = amount;
    allocated += amount;
    if (maxWeightEntry === undefined || entry.weight > maxWeightEntry.weight) {
      maxWeightEntry = entry;
    }
  }

  const drift = salaryCap - allocated;
  if (drift !== 0 && maxWeightEntry) {
    const key = maxWeightEntry.slot.key;
    amounts[key] = (amounts[key] ?? 0) + drift;
  }

  return amounts;
}
