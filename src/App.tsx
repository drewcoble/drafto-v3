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
import { PositionTabs } from "./components/PositionTabs";
import { ProjectionsTable } from "./components/ProjectionsTable";
import { ScraperPanel } from "./components/ScraperPanel";
import { AuthPanel } from "./components/AuthPanel";
import { api } from "../convex/_generated/api";
import { getConfiguredSuperAdminEmails } from "./lib/superAdmin";
import type { TabValue } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabValue>("QB");
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const ensureUser = useMutation(api.users.ensureCurrentUser);
  const currentUser = useQuery(api.users.getCurrentUser);
  const canRunScraper = currentUser?.role === "super-admin";
  const showScraperTab = isAuthenticated;
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
        {!canRunScraper && isAuthenticated && (
          <Text c="dimmed" size="sm">
            The scraper tab is available to signed-in users. Running it requires
            super-admin access.
          </Text>
        )}
        <PositionTabs
          value={activeTab}
          onChange={setActiveTab}
          showScraperTab={showScraperTab}
        />
        {activeTab === "scraper" ? (
          <ScraperPanel week={week} />
        ) : (
          <ProjectionsTable position={activeTab} week={week} />
        )}
      </Stack>
    </Container>
  );
}
