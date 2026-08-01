import { createTheme } from "@mantine/core";

// Generated via @mantine/colors-generator from the base color "saddlebrown"
// (#8b4513), which lands as the darkest shade (index 9).
const saddlebrown = [
  "#fdf4ed",
  "#f5e5da",
  "#edc9af",
  "#e7aa7f",
  "#e19057",
  "#de803e",
  "#dd7731",
  "#c46524",
  "#af591e",
  "#8b4513",
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
    indigo,
    gold,
    green,
    red,
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
      "#18271D", // soft - borders, hover surfaces
      "#101C14", // body background
      "#0B150F",
      "#070E0A",
    ],
  },
  primaryColor: "green",
  components: {
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
  },
});
