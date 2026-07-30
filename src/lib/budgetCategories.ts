import type { SlotDescriptor } from "./rosterSlots";
import { CATEGORY_ORDER } from "../constants/budget";

export function categoryForSlot(
  slot: SlotDescriptor,
): (typeof CATEGORY_ORDER)[number] {
  if (
    slot.position === "QB" ||
    slot.position === "RB" ||
    slot.position === "WR" ||
    slot.position === "TE" ||
    slot.position === "DST" ||
    slot.position === "K" ||
    slot.position === "FLEX" ||
    slot.position === "SFLEX"
  ) {
    return slot.position;
  }
  return "BENCH";
}
