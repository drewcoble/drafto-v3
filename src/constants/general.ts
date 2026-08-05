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

// AppHeader is fixed to the top of the viewport below the "sm" breakpoint
// (see AppHeader.tsx) instead of scrolling with the page. Every mobile
// layout that renders it needs to reserve this much top padding so page
// content doesn't start out hidden underneath it.
export const MOBILE_HEADER_HEIGHT = 60;

// Height of the condensed budget-stats row the Draft Room layout docks
// directly under the fixed AppHeader on mobile (see DraftTopBar.tsx /
// MobileNomination.tsx) - added on top of MOBILE_HEADER_HEIGHT when
// reserving top padding on that route specifically.
export const MOBILE_STATS_ROW_HEIGHT = 40;

// Height of PositionFilterBar's fixed mobile bar (40px circles + 8px
// vertical padding each side + 1px border). Every mobile caller fixes this
// bar below whatever's already docked at the top (MOBILE_HEADER_HEIGHT,
// plus MOBILE_STATS_ROW_HEIGHT in the Draft Room) and must add this much
// top margin/padding to whatever renders right after it, since a `position:
// fixed` element is pulled out of normal document flow.
export const POSITION_FILTER_BAR_HEIGHT = 57;
