import type { Position } from "../types";

// Single source of truth for position -> Mantine theme color, consumed by
// the position filter chips/badges (PlayersTable), budget progress bars
// (BudgetTab), and draft board player bars (PlayersLeftTab) - anywhere that
// used to fall back to Mantine's default primary color (blue) instead of
// reflecting the actual position.
export const POSITION_COLORS: Record<Position, string> = {
  QB: "qb",
  RB: "rb",
  WR: "wr",
  TE: "te",
  DST: "dst",
  K: "k",
};

// CSS-var form for consumers that set raw style properties (e.g.
// backgroundColor/outline) rather than passing a Mantine `color` prop.
export function positionColorVar(position: Position, shade: number): string {
  return `var(--mantine-color-${POSITION_COLORS[position]}-${shade})`;
}

const ADDITIONAL_POSITION_COLORS = {
  FLEX: "flex",
  SFLEX: "superflex",
  BENCH: "bn",
} as const;

export const POSITION_ORDER: string[] = [
  "QB",
  "SFLEX",
  "RB",
  "WR",
  "FLEX",
  "TE",
  "DST",
  "K",
  "BENCH",
];

// Same fallback, but for call sites keyed by a plain string that may or may
// not be one of the six Position values (e.g. a roster slot's group label,
// like "FLEX"/"SFLEX"/"BN" - see SlotDescriptor.label in lib/rosterSlots.ts -
// or the raw rosterSlots settings object's own field names, "FLEX"/
// "SUPERFLEX"/"BENCH" - see LeagueDetails.tsx). startsWith rather than an
// exact key lookup because a league with more than one FLEX/SUPERFLEX/bench
// slot numbers the labels ("FLEX1", "FLEX2", "BN1", ...) - and MyTeamTab
// additionally strips trailing digits before calling this, so plain "BN"
// needs to match too, not just "BENCH".
export function positionColorOrDefault(key: string): string {
  if (key in POSITION_COLORS) return POSITION_COLORS[key as Position];
  if (key.startsWith("FLEX")) return ADDITIONAL_POSITION_COLORS.FLEX;
  if (key.startsWith("SFLEX") || key.startsWith("SUPERFLEX")) {
    return ADDITIONAL_POSITION_COLORS.SFLEX;
  }
  if (key.startsWith("BN") || key.startsWith("BENCH")) {
    return ADDITIONAL_POSITION_COLORS.BENCH;
  }
  return "gray";
}
