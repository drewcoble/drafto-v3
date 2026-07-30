import type { OverspendBehavior } from "../types";
import { POSITION_COLORS } from "../lib/positionColors";

export const OVERSPEND_OPTIONS: Array<{
  value: OverspendBehavior;
  label: string;
  caption: string;
}> = [
  {
    value: "bench",
    label: "Take from the bench pool",
    caption:
      "Overages come out of the bench pool first, so starters keep their money.",
  },
  {
    value: "spread",
    label: "Spread across open slots",
    caption: "Overages are spread evenly across every slot still open.",
  },
  {
    value: "ask",
    label: "Ask me each time",
    caption: "You'll be prompted to decide each time you go over plan.",
  },
];

// Coarse grouping for the top summary bar - QB/RB/WR/TE stand alone since
// they're the slots you actually compare across, everything else (FLEX/
// SUPERFLEX/DST/K/bench) is lumped into one bucket.
export const CATEGORY_ORDER = [
  "QB",
  "RB",
  "WR",
  "TE",
  "FLEX",
  "SFLEX",
  "DST",
  "K",
  "BENCH",
] as const;

export const CATEGORY_LABELS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  DST: "DST",
  K: "K",
  FLEX: "FLEX",
  SFLEX: "SFLEX",
  BENCH: "bench",
};

export const CATEGORY_COLORS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  QB: POSITION_COLORS.QB,
  RB: POSITION_COLORS.RB,
  WR: POSITION_COLORS.WR,
  TE: POSITION_COLORS.TE,
  DST: POSITION_COLORS.DST,
  K: POSITION_COLORS.K,
  FLEX: "yellow.6",
  SFLEX: "teal.6",
  BENCH: "gray.6",
};
