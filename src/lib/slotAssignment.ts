import type { Position } from "../types";
import { expandRosterSlots, type RosterSlotCounts } from "./rosterSlots";

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
// reconstruct which slot each one most likely fills. Used for opponents,
// who never get a stored planSlotKey (only the self team's picks do, since
// only self has a budget plan to reconcile against) - the League tab needs
// *some* notion of "what does this team still need" and "who's in which
// slot" for every team, not just self, so it's computed the same way
// draftValues.ts computes everything else: on the fly, not stored.
export function assignPicksToSlots<T extends { position: Position }>(
  picksInSequenceOrder: readonly T[],
  rosterSlots: RosterSlotCounts,
  flexPositions: readonly Position[],
  superflexPositions: readonly Position[],
): Map<string, T> {
  const bySlot = new Map<string, T>();
  const filled = new Set<string>();
  for (const pick of picksInSequenceOrder) {
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
