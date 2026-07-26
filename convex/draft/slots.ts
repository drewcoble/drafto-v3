import { POSITIONS } from "../positions";

type Position = (typeof POSITIONS)[number];

export interface RosterSlotCounts {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  DST: number;
  K: number;
  FLEX: number;
  SUPERFLEX: number;
  BENCH: number;
}

export interface SlotDescriptor {
  key: string;
  label: string;
  // null for FLEX/SUPERFLEX/BENCH - those slots aren't tied to one fixed
  // position, just eligibility rules.
  position: Position | null;
}

const SLOT_ORDER: Array<{
  countKey: keyof RosterSlotCounts;
  label: string;
  position: Position | null;
}> = [
  { countKey: "QB", label: "QB", position: "QB" },
  { countKey: "RB", label: "RB", position: "RB" },
  { countKey: "WR", label: "WR", position: "WR" },
  { countKey: "TE", label: "TE", position: "TE" },
  { countKey: "FLEX", label: "FLEX", position: null },
  { countKey: "SUPERFLEX", label: "SFLEX", position: null },
  { countKey: "DST", label: "DST", position: "DST" },
  { countKey: "K", label: "K", position: "K" },
  { countKey: "BENCH", label: "BN", position: null },
];

// Deterministic, ordered slot list for a league's roster shape - the single
// source of truth for budget-plan keys (draftBudgetPlans.amounts) and
// draftPicks.planSlotKey. A slot with count 1 keys/labels as e.g. "QB";
// counts above 1 number each instance ("RB1", "RB2", ...).
export function expandRosterSlots(
  rosterSlots: RosterSlotCounts,
): SlotDescriptor[] {
  const slots: SlotDescriptor[] = [];
  for (const { countKey, label, position } of SLOT_ORDER) {
    const count = rosterSlots[countKey];
    if (count <= 0) continue;
    if (count === 1) {
      slots.push({ key: label, label, position });
    } else {
      for (let i = 1; i <= count; i++) {
        slots.push({ key: `${label}${i}`, label: `${label}${i}`, position });
      }
    }
  }
  return slots;
}
