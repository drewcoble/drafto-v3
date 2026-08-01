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

// Whether a player at `position` is allowed to sit in `slot` - an exact
// position match, a flex-eligible slot when the position is in
// flexPositions, a superflex-eligible slot when it's in superflexPositions,
// or any bench slot (bench takes anyone). Shared by setPickSlot's server-side
// validation and, in duplicate, src/lib/slotAssignment.ts's UI-facing
// eligibleSlotsForPosition (see that file's comment on why it's duplicated
// rather than imported).
export function isEligibleForSlot(
  position: Position,
  slot: SlotDescriptor,
  flexPositions: readonly Position[],
  superflexPositions: readonly Position[],
): boolean {
  if (slot.position === position) return true;
  if (slot.label.startsWith("FLEX")) return flexPositions.includes(position);
  if (slot.label.startsWith("SFLEX")) {
    return superflexPositions.includes(position);
  }
  if (slot.label.startsWith("BN")) return true;
  return false;
}
