import { createTheme } from "@mantine/core";

// Generated via @mantine/colors-generator from the base color "saddlebrown"
// (#8b4513), which lands as the darkest shade (index 9).
export const theme = createTheme({
  colors: {
    saddlebrown: [
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
    ],
  },
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
