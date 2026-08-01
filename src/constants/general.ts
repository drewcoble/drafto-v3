// The Sleeper "week" identifier used for the single season-long draft-prep
// dataset (projections, rankings, draft values) - not an actual NFL week,
// but numbered "0" (rather than a non-numeric sentinel like the old
// "draft") so it sorts/compares naturally alongside real weeks "1"-"18"
// (see playerPoints/playerSeasonStats).
export const WEEK = "0";

// Max-width for the app's main content Container (Setup + Draft Room
// layouts) - wider than Mantine's built-in "lg" (1140px) since these pages
// are dense with tables/cards meant to be scanned at a glance during a live
// auction, not read like prose. Sized for a ~1680px-wide window, not full
// bleed, so it still reads as a centered page on wider displays.
export const APP_CONTENT_MAX_WIDTH = 1600;
