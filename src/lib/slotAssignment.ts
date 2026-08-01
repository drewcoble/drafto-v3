import type { Position } from "../types";
import {
  expandRosterSlots,
  type RosterSlotCounts,
  type SlotDescriptor,
} from "./rosterSlots";

// Greedily picks the best open roster slot for a newly-drafted player:
// prefer a slot dedicated to their exact position, then a FLEX slot (if
// they're flex-eligible), then SUPERFLEX, then bench - whichever comes
// first among slots not already filled. Computed once at the moment a pick
// is logged and stored as draftPicks.planSlotKey, rather than recomputed on
// every render, so a slot assignment doesn't shuffle around after later
// picks or an undo.
export function assignSlotForPick(
  position: Position,
  rosterSlots: RosterSlotCounts,
  filledSlotKeys: ReadonlySet<string>,
  flexPositions: readonly Position[],
  superflexPositions: readonly Position[],
): string | undefined {
  const openSlots = expandRosterSlots(rosterSlots).filter(
    (slot) => !filledSlotKeys.has(slot.key),
  );

  const exact = openSlots.find((slot) => slot.position === position);
  if (exact) return exact.key;

  if (flexPositions.includes(position)) {
    const flexSlot = openSlots.find((slot) => slot.label.startsWith("FLEX"));
    if (flexSlot) return flexSlot.key;
  }

  if (superflexPositions.includes(position)) {
    const superflexSlot = openSlots.find((slot) =>
      slot.label.startsWith("SFLEX"),
    );
    if (superflexSlot) return superflexSlot.key;
  }

  const benchSlot = openSlots.find((slot) => slot.label.startsWith("BN"));
  if (benchSlot) return benchSlot.key;

  return undefined;
}

// Replays a team's picks (in draft order) through assignSlotForPick to
// reconstruct which slot each one most likely fills - but a pick with an
// explicit planSlotKey (auto-assigned for self at pick time, or manually set
// for any team via convex/draft/picks.ts's setPickSlot, e.g. bumping a
// flex-caliber player down to FLEX) always wins that slot outright; only
// picks with no stored assignment (or a stale one - see the validSlotKeys
// check below) fall through to greedy auto-placement. The League tab needs
// *some* notion of "what does this team still need" and "who's in which
// slot" for every team, not just self, so whatever isn't manually pinned is
// computed the same way draftValues.ts computes everything else: on the fly,
// not stored.
export function assignPicksToSlots<
  T extends { position: Position; planSlotKey?: string },
>(
  picksInSequenceOrder: readonly T[],
  rosterSlots: RosterSlotCounts,
  flexPositions: readonly Position[],
  superflexPositions: readonly Position[],
): Map<string, T> {
  const validSlotKeys = new Set(
    expandRosterSlots(rosterSlots).map((slot) => slot.key),
  );
  const bySlot = new Map<string, T>();
  const filled = new Set<string>();
  const unassigned: T[] = [];

  for (const pick of picksInSequenceOrder) {
    if (
      pick.planSlotKey &&
      validSlotKeys.has(pick.planSlotKey) &&
      !filled.has(pick.planSlotKey)
    ) {
      filled.add(pick.planSlotKey);
      bySlot.set(pick.planSlotKey, pick);
    } else {
      unassigned.push(pick);
    }
  }

  for (const pick of unassigned) {
    const slotKey = assignSlotForPick(
      pick.position,
      rosterSlots,
      filled,
      flexPositions,
      superflexPositions,
    );
    if (slotKey) {
      filled.add(slotKey);
      bySlot.set(slotKey, pick);
    }
  }
  return bySlot;
}

// Which of a team's roster slots a player at `position` is allowed to
// occupy - an exact position match, FLEX/SUPERFLEX when eligible, or any
// bench slot. Used to build the "move to..." option list in the League/My
// Team tabs' slot-reassignment UI. Duplicated (rather than imported) from
// convex/draft/slots.ts's isEligibleForSlot, same as expandRosterSlots above
// - Convex's bundler doesn't allow importing across the convex/ boundary.
export function eligibleSlotsForPosition(
  position: Position,
  slots: readonly SlotDescriptor[],
  flexPositions: readonly Position[],
  superflexPositions: readonly Position[],
): SlotDescriptor[] {
  return slots.filter((slot) => {
    if (slot.position === position) return true;
    if (slot.label.startsWith("FLEX")) return flexPositions.includes(position);
    if (slot.label.startsWith("SFLEX")) {
      return superflexPositions.includes(position);
    }
    if (slot.label.startsWith("BN")) return true;
    return false;
  });
}
