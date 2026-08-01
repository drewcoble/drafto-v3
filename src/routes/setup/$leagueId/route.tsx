import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Container, Stack, Text } from "@mantine/core";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { AppHeader } from "../../../components/AppHeader";
import { NavTabs } from "../../../components/NavTabs";
import { APP_CONTENT_MAX_WIDTH } from "../../../constants/general";

export const Route = createFileRoute("/setup/$leagueId")({
  component: SetupLayout,
});

function SetupLayout() {
  const currentUser = useQuery(api.users.getCurrentUser);
  const canFetchData = currentUser?.role === "super-admin";

  return (
    <Container size={APP_CONTENT_MAX_WIDTH} py="xl">
      <Stack gap="md">
        <AppHeader />
        {!canFetchData && (
          <Text c="dimmed" size="sm">
            Fetching data requires super-admin access.
          </Text>
        )}
        <NavTabs />
        <Outlet />
      </Stack>
    </Container>
  );
}
