import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Container, Stack } from "@mantine/core";
import { AppHeader } from "../../../components/AppHeader";
import { NavTabs } from "../../../components/NavTabs";
import {
  APP_CONTENT_MAX_WIDTH,
  MOBILE_HEADER_HEIGHT,
} from "../../../constants/general";

export const Route = createFileRoute("/setup/$leagueId")({
  component: SetupLayout,
});

function SetupLayout() {
  return (
    <Container
      size={APP_CONTENT_MAX_WIDTH}
      pt={{ base: MOBILE_HEADER_HEIGHT + 16, sm: "xl" }}
      pb={{ base: 116, sm: "xl" }}
    >
      <Stack gap="md">
        <AppHeader />
        <NavTabs />
        <Outlet />
      </Stack>
    </Container>
  );
}
