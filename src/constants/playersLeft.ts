// One scale for every bar on the page - price comparisons only make sense
// if a $20 player is the same width in every position group.
export const PX_PER_DOLLAR = 10;
export const BAR_HEIGHT = 40;
export const MIN_BAR_WIDTH = 50;
export const MAX_BAR_WIDTH = 1500;
export const ICON_SIZE = 16;

// How close (in $) a player's value needs to be to an open budget slot's
// amount to get flagged as a "fits the budget" highlight (see
// isNearAnyOpenSlot in lib/planRecommendation.ts) - a window around the
// number rather than strictly under it, so the highlight stays a small,
// glanceable set of realistic bids instead of "everything cheap enough."
export const BUDGET_MATCH_WINDOW = 2;
