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
  Select,
} from "@mantine/core";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { NavTabs } from "./components/NavTabs";
import { LeagueDetails } from "./components/LeagueDetails";
import { PlayersTable } from "./components/PlayersTable";
import { DataPanel } from "./components/DataPanel";
import { AuthPanel } from "./components/AuthPanel";
import { DraftRoom } from "./components/draft/DraftRoom";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { getConfiguredSuperAdminEmails } from "./lib/superAdmin";
import type { TabValue } from "./types";

const NEW_LEAGUE_VALUE = "__new__";

function leagueStorageKey(userId: string) {
  return `drafto:selectedLeagueId:${userId}`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabValue>("players");
  const [mode, setMode] = useState<"settings" | "draftRoom">("settings");
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

  const draftSettingsList = useQuery(
    api.draftSettings.listDraftSettings,
    isAuthenticated ? {} : "skip",
  );
  const [selectedLeagueId, setSelectedLeagueId] = useState<
    Id<"draftSettings"> | undefined
  >(undefined);
  const [isCreatingLeague, setIsCreatingLeague] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      void ensureUser({ allowlistedEmails: configuredSuperAdminEmails });
    }
  }, [ensureUser, isAuthenticated, configuredSuperAdminEmails]);

  // Resolve which league is active: keep the current selection if it's still
  // valid, else restore the last one this user picked (localStorage), else
  // fall back to their first league.
  useEffect(() => {
    if (!draftSettingsList || !currentUser) return;
    const validIds = new Set(draftSettingsList.map((league) => league._id));
    if (selectedLeagueId && validIds.has(selectedLeagueId)) return;

    const stored = localStorage.getItem(leagueStorageKey(currentUser._id));
    if (stored && validIds.has(stored as Id<"draftSettings">)) {
      setSelectedLeagueId(stored as Id<"draftSettings">);
    } else if (draftSettingsList[0]) {
      setSelectedLeagueId(draftSettingsList[0]._id);
    } else {
      setSelectedLeagueId(undefined);
    }
  }, [draftSettingsList, currentUser, selectedLeagueId]);

  useEffect(() => {
    if (!currentUser || !selectedLeagueId) return;
    localStorage.setItem(leagueStorageKey(currentUser._id), selectedLeagueId);
  }, [currentUser, selectedLeagueId]);

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

  const inDraftRoom = mode === "draftRoom" && !!selectedLeagueId;

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={2}>Fantasy Football Projections</Title>
          <Group gap="sm">
            <Select
              placeholder="Select league"
              data={[
                ...(draftSettingsList ?? []).map((league) => ({
                  value: league._id,
                  label: league.name,
                })),
                { value: NEW_LEAGUE_VALUE, label: "+ New League" },
              ]}
              value={selectedLeagueId ?? null}
              onChange={(value) => {
                if (value === NEW_LEAGUE_VALUE) {
                  setMode("settings");
                  setIsCreatingLeague(true);
                  setActiveTab("league");
                } else if (value) {
                  setSelectedLeagueId(value as Id<"draftSettings">);
                }
              }}
              w={220}
              allowDeselect={false}
            />
            <Button
              variant={inDraftRoom ? "default" : "filled"}
              size="sm"
              disabled={!selectedLeagueId}
              onClick={() => setMode(inDraftRoom ? "settings" : "draftRoom")}
            >
              {inDraftRoom ? "Back to Setup" : "Enter Draft Room"}
            </Button>
            <Button variant="default" size="sm" onClick={() => signOut()}>
              Sign out
            </Button>
          </Group>
        </Group>

        {inDraftRoom && selectedLeagueId ? (
          <DraftRoom
            draftSettingsId={selectedLeagueId}
            onExit={() => setMode("settings")}
          />
        ) : (
          <>
            {!canFetchData && (
              <Text c="dimmed" size="sm">
                Fetching data requires super-admin access.
              </Text>
            )}
            <NavTabs value={activeTab} onChange={setActiveTab} />
            {activeTab === "league" && (
              <LeagueDetails
                selectedLeagueId={selectedLeagueId}
                isCreatingLeague={isCreatingLeague}
                onLeagueSaved={setSelectedLeagueId}
                onDoneCreating={() => setIsCreatingLeague(false)}
              />
            )}
            {activeTab === "players" && (
              <PlayersTable week={week} selectedLeagueId={selectedLeagueId} />
            )}
            {activeTab === "data" && <DataPanel week={week} />}
          </>
        )}
      </Stack>
    </Container>
  );
}
