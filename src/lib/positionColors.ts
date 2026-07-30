import type { Position } from "../types";

// Single source of truth for position -> Mantine theme color, consumed by
// the position filter chips/badges (PlayersTable), budget progress bars
// (BudgetTab), and draft board player bars (PlayersLeftTab) - anywhere that
// used to fall back to Mantine's default primary color (blue) instead of
// reflecting the actual position.
export const POSITION_COLORS: Record<Position, string> = {
  QB: "blue",
  RB: "green",
  WR: "orange",
  TE: "grape",
  DST: "saddlebrown",
  K: "gray",
};

// CSS-var form for consumers that set raw style properties (e.g.
// backgroundColor/outline) rather than passing a Mantine `color` prop.
export function positionColorVar(position: Position, shade: number): string {
  return `var(--mantine-color-${POSITION_COLORS[position]}-${shade})`;
}

// For roster slots that aren't tied to one fixed position (FLEX/SUPERFLEX/
// BENCH - see SlotDescriptor.position in lib/rosterSlots.ts), fall back to
// gray rather than leaving the color unset (which would render as Mantine's
// default primary color, i.e. blue, regardless of position).
export function positionColorOrGray(position: Position | null): string {
  return position ? POSITION_COLORS[position] : "gray";
}

const POSITION_KEYS = new Set<string>(Object.keys(POSITION_COLORS));

// Same fallback, but for call sites keyed by a plain string that may or may
// not be one of the six Position values (e.g. a roster slot's group label).
export function positionColorOrDefault(key: string): string {
  return POSITION_KEYS.has(key) ? POSITION_COLORS[key as Position] : "gray";
}
