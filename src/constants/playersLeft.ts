import type { Position } from "../types";

export const ALL_POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "DST", "K"];

// One scale for every bar on the page - price comparisons only make sense
// if a $20 player is the same width in every position group.
export const PX_PER_DOLLAR = 20;
export const BAR_HEIGHT = 35;
export const MIN_BAR_WIDTH = 100;
export const MAX_BAR_WIDTH = 1500;
export const ICON_SIZE = 16;
