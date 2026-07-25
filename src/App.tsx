import { useEffect, useMemo, useState } from "react";
import {
  Container,
  Title,
  Stack,
  Center,
  Loader,
  Text,
  Button,
  Group,
} from "@mantine/core";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { NavTabs } from "./components/NavTabs";
import { LeagueDetails } from "./components/LeagueDetails";
import { PlayersTable } from "./components/PlayersTable";
import { DataPanel } from "./components/DataPanel";
import { AuthPanel } from "./components/AuthPanel";
import { api } from "../convex/_generated/api";
import { getConfiguredSuperAdminEmails } from "./lib/superAdmin";
import type { TabValue } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabValue>("players");
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const ensureUser = useMutation(api.users.ensureCurrentUser);
  const currentUser = useQuery(api.users.getCurrentUser);
  const canFetchData = currentUser?.role === "super-admin";
  const configuredSuperAdminEmails = useMemo(
    () => getConfiguredSuperAdminEmails(),
    [],
  );
  const week = "draft";

  useEffect(() => {
    if (isAuthenticated) {
      void ensureUser({ allowlistedEmails: configuredSuperAdminEmails });
    }
  }, [ensureUser, isAuthenticated, configuredSuperAdminEmails]);

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  if (!isAuthenticated) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="md">
          <Title order={2}>drafto</Title>
          <Text c="dimmed">Sign in to view projections and draft.</Text>
          <AuthPanel />
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={2}>Fantasy Football Projections</Title>
          <Button variant="default" size="sm" onClick={() => signOut()}>
            Sign out
          </Button>
        </Group>
        {!canFetchData && (
          <Text c="dimmed" size="sm">
            Fetching data requires super-admin access.
          </Text>
        )}
        <NavTabs value={activeTab} onChange={setActiveTab} />
        {activeTab === "league" && <LeagueDetails />}
        {activeTab === "players" && <PlayersTable week={week} />}
        {activeTab === "data" && <DataPanel week={week} />}
      </Stack>
    </Container>
  );
}
