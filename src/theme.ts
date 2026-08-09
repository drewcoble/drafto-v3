import { createTheme, type CSSVariablesResolver } from "@mantine/core";

// Base color "saddlebrown" (#8b4513), pinned to shade 7 rather than the
// darkest shade (@mantine/colors-generator's default placement, since
// #8b4513 registers as one of its darkest predefined lightness stops) -
// shades 8-9 are hand-extrapolated further down the same hue/saturation
// curve past #8b4513 so the scale still has two shades darker than the
// pure color available. AppHeader/NominationPanel/MobileNomination/
// BudgetTab/draftRecommendation all use this directly as the "gold glow"-
// style accent - not used for any Position/roster-slot color, so it stays
// free to experiment with independent of the position palette below.
const saddlebrown = [
  "#edc9af",
  "#e7aa7f",
  "#e19057",
  "#de803e",
  "#dd7731",
  "#c46524",
  "#af591e",
  "#8b4513",
  "#6a320c",
  "#4b2307",
] as const;

// Generated via @mantine/colors-generator from the base color "burlywood"
// (#deb887), which lands at shade 3. Wired up as primaryColor below - an
// experiment swapping it in for the light-green accent (default Anchor
// color, i.e. player-name links throughout every table, plus the mobile
// BottomNav's active-tab color, which mirrors primaryColor explicitly
// since Mantine's Group/Stack `c` prop doesn't read theme.primaryColor on
// its own).
const burlywood = [
  "#fff5e5",
  "#f7e9d6",
  "#ead1b0",
  "#deb887",
  "#d3a262",
  "#cd944b",
  "#ca8d3e",
  "#b2792f",
  "#9f6b27",
  "#8b5c1b",
] as const;

// Generated via @mantine/colors-generator from the visual system's base
// colors (see convex/_generated or design doc for the source palette):
// indigo #33397A, gold #C9A24E, green #3E7856, red #B4543F - each lands as
// the darkest shade (index 9), same convention as saddlebrown above.
const indigo = [
  "#f1f1f9",
  "#dee0ec",
  "#babdda",
  "#9498c9",
  "#7479ba",
  "#6065b2",
  "#565baf",
  "#464b9a",
  "#3e438a",
  "#33397a",
] as const;

const gold = [
  "#fff6e4",
  "#f6ecd5",
  "#e9d7b0",
  "#dbc187",
  "#d0ae65",
  "#c9a24e",
  "#c69c41",
  "#ae8732",
  "#9c7829",
  "#87671c",
] as const;

const green = [
  "#f2f8f4",
  "#e4ede8",
  "#c5dbce",
  "#a2c8b1",
  "#85b899",
  "#72ae8a",
  "#67a981",
  "#56946f",
  "#4a8461",
  "#3e7856",
] as const;

const red = [
  "#ffefeb",
  "#f6dfda",
  "#e5beb5",
  "#d69a8d",
  "#c97c6b",
  "#c16955",
  "#be5f4a",
  "#b4543f",
  "#974533",
  "#853929",
] as const;

// Position-specific palette, generated via @mantine/colors-generator from
// one base hex per Position/roster-slot (see lib/positionColors.ts, the
// consumer that maps each Position to one of these).
const qb = [
  "#fff7e2",
  "#fceecf",
  "#f5dca3",
  "#efc873",
  "#eab84b",
  "#e8b23d",
  "#e5a821",
  "#cb9212",
  "#b58208",
  "#9d6f00",
] as const;

const superflex = [
  "#fff4e9",
  "#f6e7d9",
  "#e9cdb2",
  "#deb187",
  "#d49963",
  "#ce8a4b",
  "#cc833e",
  "#b47030",
  "#a8672a",
  "#8d541d",
] as const;

const rb = [
  "#e8fbf1",
  "#dbf1e5",
  "#b9e0cb",
  "#95cfb0",
  "#76c098",
  "#62b789",
  "#4fae7b",
  "#459c6e",
  "#398b60",
  "#297951",
] as const;

const flex = [
  "#e3fcff",
  "#d5f2f7",
  "#afe3ea",
  "#86d2dd",
  "#65c5d2",
  "#4fbccc",
  "#3fb8c9",
  "#2ca2b2",
  "#1a909f",
  "#007d8c",
] as const;

const wr = [
  "#e6f4ff",
  "#d1e5ff",
  "#a5c7f6",
  "#75a8ee",
  "#4f8fe8",
  "#337de4",
  "#2275e4",
  "#1063cb",
  "#0058b7",
  "#004ca3",
] as const;

const te = [
  "#fbecff",
  "#eed7fa",
  "#d8adef",
  "#c280e4",
  "#b15fdb",
  "#a342d5",
  "#9d36d3",
  "#8928bb",
  "#7a22a8",
  "#6b1994",
] as const;

const k = [
  "#ffebf8",
  "#fad7e8",
  "#eeaecd",
  "#e282b0",
  "#d9639c",
  "#d24589",
  "#d03882",
  "#b8296f",
  "#a52163",
  "#921556",
] as const;

const dst = [
  "#fbf0ee",
  "#f0dddb",
  "#e5b8b2",
  "#da8f86",
  "#d16e61",
  "#cd5949",
  "#cb4d3d",
  "#b33f2f",
  "#a03729",
  "#7c271d",
] as const;

const bn = [
  "#f0f5fe",
  "#e4e7ec",
  "#c9ccd2",
  "#abafb7",
  "#9397a1",
  "#828893",
  "#7a808e",
  "#6b7280",
  "#5a6270",
  "#4b5465",
] as const;

// Provider brand colors, generated via @mantine/colors-generator the same
// way as the palette above - Sleeper's dark navy blue (base #1F2A44, lands
// at shade 9) and Yahoo's purple (base #6001D2, lands at shade 8). Eyeballed
// from each provider's own branding rather than an official brand kit, so
// nudge the base hex above and regenerate if either reads off. Used only on
// LeagueCreateChoice.tsx's "Import from Sleeper"/"Import from Yahoo"
// buttons - not wired into positionColors.ts or anything provider-neutral.
const sleeper = [
  "#f1f3f9",
  "#e1e4eb",
  "#bec6d8",
  "#99a6c6",
  "#7b8bb6",
  "#677aad",
  "#5c72aa",
  "#4c6095",
  "#435686",
  "#1f2a44",
] as const;

const yahoo = [
  "#f5eaff",
  "#e5d0ff",
  "#c89dfc",
  "#aa66fb",
  "#9139fa",
  "#811efa",
  "#7911fb",
  "#6805e0",
  "#6001d2",
  "#4e00b0",
] as const;

export const theme = createTheme({
  fontFamily: "Inter, sans-serif",
  fontFamilyMonospace: "IBM Plex Mono, monospace",
  headings: {
    fontFamily: "Space Grotesk, sans-serif",
  },
  // Paper (#F5F4EF) is the light-mode surface; ink (#12161C) rides along as
  // the light-mode text color via Mantine's --mantine-color-black variable.
  white: "#F5F4EF",
  black: "#12161C",
  colors: {
    saddlebrown,
    burlywood,
    indigo,
    gold,
    green,
    red,
    qb,
    superflex,
    rb,
    flex,
    wr,
    te,
    k,
    dst,
    bn,
    sleeper,
    yahoo,
    // Dark-mode surfaces retinted to a very dark, desaturated forest green
    // instead of the plain blue-black ink used before (too close to every
    // other fantasy football site's dark-blue theme) and Mantine's neutral
    // gray dark palette. Only shades 6-9 (the ones Mantine actually uses for
    // body/card/border/hover backgrounds) are replaced; 0-5 are left as
    // Mantine's defaults since those are tuned for text/dimmed-text contrast
    // rather than brand color.
    dark: [
      "#C1C2C5",
      "#A6A7AB",
      "#909296",
      "#5C5F66",
      "#373A40",
      "#2C2E33",
      "#121B17", // soft - borders, hover surfaces
      "#0C1310", // body background
      "#090F0D",
      "#060A08",
    ],
  },
  primaryColor: "burlywood",
  components: {
    Card: {
      defaultProps: {
        radius: "md",
        shadow: "sm",
      },
    },
    // Dark mode matches var(--mantine-color-dark-6) - the same "soft
    // surface" shade Card uses, already Mantine's own default there - so
    // every Popover in the app (SlotRow's closest-players list, PlayerBar's
    // detail card, MobileNomination's nominate search) reads as the same
    // floating-panel surface as Card, on purpose, not by accident of
    // Mantine's current defaults. Light mode gets a plain light gray
    // instead of gray-1's dark-tinted counterpart - dark-6 is a fixed shade
    // from the dark palette (see the dark: [...] array above), not
    // something that flips with color scheme on its own, so without this
    // light mode would render the same dark-green surface as dark mode.
    Popover: {
      styles: {
        dropdown: {
          backgroundColor:
            "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))",
        },
      },
    },
    // Anchor defaults to primaryColor's "filled" shade (8 in dark mode,
    // Mantine's default primaryShade.dark) - reads too dark/saturated as
    // burlywood link text against the app's dark background (these are
    // player-name links throughout every table). Pinned to the lighter,
    // truer-to-the-named-color shade 3 in dark mode, independent of
    // primaryColor's shade elsewhere (BottomNav's active-tab color, etc.
    // are untouched by this) - but that same light shade 3 is nearly
    // unreadable in light mode (light text on theme.white's light cream),
    // so light mode gets a darker shade 7 instead via light-dark().
    Anchor: {
      defaultProps: {
        c: "light-dark(var(--mantine-color-burlywood-7), var(--mantine-color-burlywood-3))",
      },
    },
    // Buttons default to saddlebrown rather than primaryColor (burlywood) -
    // a default-color Button (no explicit `color` prop) still comes up
    // constantly (e.g. "Sign out", "Back to Setup" on desktop) alongside
    // the many Buttons that already set an explicit color (gold, red, etc),
    // and saddlebrown reads better there than burlywood's filled shade.
    Button: {
      defaultProps: {
        color: "saddlebrown",
        // Mantine's own default ("sm", 36px) is just under the ~40px
        // minimum comfortable tap target - "md" (42px) clears it without
        // an explicit size prop needed at every call site.
        size: "md",
      },
    },
    // Mantine's own default ("md", 28px) is well under the ~40px minimum
    // comfortable tap target - individual call sites already pass an
    // explicit size where one made sense, this just raises the floor for
    // any that don't.
    ActionIcon: {
      defaultProps: {
        size: 40,
      },
    },
    // Mantine's default unfilled track (gray-2) is tuned for a plain white
    // canvas - against theme.white's warm cream tint it's nearly invisible
    // (e.g. MyTeamTab's $0-spent category bars, SlotRow's empty slots).
    // Bumped to gray-4 for light mode only; dark mode's dark-4 default
    // (already legible against the near-black body) is untouched.
    Progress: {
      styles: {
        root: {
          backgroundColor:
            "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-4))",
        },
      },
    },
    // Every <Table> in the app follows this size by default now (previously
    // font size wasn't set here, so individual tables inherited whatever
    // ambient size happened to be in scope and drifted out of sync with each
    // other) - "sm" matches the size DraftRoom/MyTeamTab's SlotTable reads
    // as. A table can still override with its own `fz` prop if it genuinely
    // needs to differ.
    Table: {
      defaultProps: {
        fz: "sm",
      },
    },
    // Mantine's own default Tooltip is inverted relative to the page (light
    // bg in dark mode, dark bg in light mode) - that's the "white bg in dark
    // mode" that got overridden before light mode existed. Now that both
    // schemes are live, match the tooltip to whichever one is active instead
    // of forcing one fixed look: dark surface in dark mode, light surface in
    // light mode. `light-dark()` is a plain CSS function (not a Mantine
    // helper) - it resolves off the `color-scheme` CSS property, which
    // Mantine already sets on the root to match MantineProvider's current
    // color scheme, so no JS/theme-context plumbing is needed here.
    Tooltip: {
      defaultProps: {
        bg: "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-9))",
        c: "light-dark(var(--mantine-color-dark-9), var(--mantine-color-dark-1))",
      },
    },
    // Mantine's default close button (Modal/Drawer/etc.) is only 28px
    // ("md") - below the ~40px minimum comfortable tap target, and it's the
    // one control every sheet/dialog in the app shares, mobile included.
    CloseButton: {
      defaultProps: {
        size: 40,
      },
    },
  },
});

// Mantine's own light-mode body defaults to var(--mantine-color-white)
// (theme.white, this app's warm cream) - a plain page background, no
// distinct "surface" to pop off of. Dark mode already has that contrast
// for free (body is dark-7, Card/Popover default to the lighter dark-6),
// so this gives light mode the same relationship: body drops to a plain
// gray-1, while Card/Popover's gray-0 default (see the Popover entry
// above) reads as a distinctly lighter surface again. Only --mantine-
// color-body changes - theme.white itself (button text contrast, etc.)
// is untouched.
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    "--mantine-color-body": "var(--mantine-color-gray-1)",
  },
  dark: {},
});
