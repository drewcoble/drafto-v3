import type { Position } from "../types";

export const ALL_POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "DST", "K"];

// One scale for every bar on the page - price comparisons only make sense
// if a $20 player is the same width in every position group.
export const PX_PER_DOLLAR = 15;
export const BAR_HEIGHT = 32;
export const MIN_BAR_WIDTH = 30;
export const MAX_BAR_WIDTH = 400;
export const ICON_SIZE = 16;
