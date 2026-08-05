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

// Category order for the top summary bar - matches POSITION_ORDER in
// lib/positionColors.ts.
export const CATEGORY_ORDER = [
  "QB",
  "SFLEX",
  "RB",
  "WR",
  "FLEX",
  "TE",
  "DST",
  "K",
  "BENCH",
] as const;

export const CATEGORY_LABELS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  QB: "QB",
  SFLEX: "SFLEX",
  RB: "RB",
  WR: "WR",
  FLEX: "FLEX",
  TE: "TE",
  DST: "DST",
  K: "K",
  BENCH: "bench",
};

export const CATEGORY_COLORS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  QB: POSITION_COLORS.QB,
  SFLEX: "superflex",
  RB: POSITION_COLORS.RB,
  WR: POSITION_COLORS.WR,
  FLEX: "flex",
  TE: POSITION_COLORS.TE,
  DST: POSITION_COLORS.DST,
  K: POSITION_COLORS.K,
  BENCH: "bn",
};
