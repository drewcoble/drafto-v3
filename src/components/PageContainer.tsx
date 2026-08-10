import type { ReactNode } from "react";
import { Container, type MantineSpacing } from "@mantine/core";
import {
  APP_CONTENT_MAX_WIDTH,
  MOBILE_HEADER_HEIGHT,
} from "../constants/general";

type ResponsivePadding =
  MantineSpacing | { base?: MantineSpacing; sm?: MantineSpacing };

interface PageContainerProps {
  children: ReactNode;
  // Overrides for layouts with extra fixed chrome docked below AppHeader
  // (DraftTopBar) or a floating BottomNav that needs room reserved below the
  // fold - see routes/league/$leagueId/route.tsx and routes/season/
  // $leagueId/route.tsx for the two cases that need this. Every other page
  // uses the defaults below.
  pt?: ResponsivePadding;
  pb?: ResponsivePadding;
}

// The one Container every top-level page renders into - same max width and
// top/bottom padding everywhere (dashboard, league, season, admin, billing,
// the signed-out screen), so the app doesn't have a different-feeling layout
// depending which page you're on. Pages whose content should stay narrower
// than the full width (a login form, a single settings card) constrain
// their own content with `maw` + `mx="auto"` inside this, rather than this
// component being narrower for them - that way every page still measures
// from the same edges, it's just the content inside that varies.
export function PageContainer({
  children,
  pt = { base: MOBILE_HEADER_HEIGHT + 16, sm: "xl" },
  pb = "xl",
}: PageContainerProps) {
  return (
    <Container size={APP_CONTENT_MAX_WIDTH} pt={pt} pb={pb}>
      {children}
    </Container>
  );
}
