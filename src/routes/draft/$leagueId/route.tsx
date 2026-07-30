import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { Button, Center, Container, Group, Loader, Stack, Tabs, Text } from "@mantine/core";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { AppHeader } from "../../../components/AppHeader";
import { DraftTopBar } from "../../../pages/DraftRoom/DraftTopBar";
import { useSelfTeam } from "../../../hooks/useSelfTeam";

export const Route = createFileRoute("/draft/$leagueId")({
  component: DraftLayout,
});

const TABS = [
  { value: "budget", label: "Budget", to: "/draft/$leagueId/budget" },
  { value: "draft", label: "Draft", to: "/draft/$leagueId/draft" },
  { value: "myTeam", label: "My Team", to: "/draft/$leagueId/myTeam" },
  { value: "players", label: "Players", to: "/draft/$leagueId/players" },
  { value: "injuries", label: "Injuries", to: "/draft/$leagueId/injuries" },
  { value: "league", label: "League", to: "/draft/$leagueId/league" },
] as const;

// Teams are set up ahead of time on the League Details tab (Enter Draft Room
// is disabled there until they exist), so this only needs to handle the
// loaded/not-found states, not first-time team setup.
function DraftLayout() {
  const { leagueId } = Route.useParams();
  const location = useLocation();
  const settingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const selfTeamResult = useSelfTeam(leagueId as Id<"draftSettings">);

  const settings = settingsList?.find((s) => s._id === leagueId);
  const activeTab = location.pathname.split("/").pop();

  if (settingsList === undefined || selfTeamResult === undefined) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  if (!settings) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="md" py="xl" align="center">
          <Text c="dimmed">League not found.</Text>
          <Link to="/">
            <Button component="span" variant="default">
              Back to settings
            </Button>
          </Link>
        </Stack>
      </Container>
    );
  }

  if (selfTeamResult.teams.length === 0) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="md" py="xl" align="center">
          <Text c="dimmed">
            Set up your draft teams on the League Details tab first.
          </Text>
          <Link to="/setup/$leagueId/league" params={{ leagueId }}>
            <Button component="span" variant="default">
              Back to League Details
            </Button>
          </Link>
        </Stack>
      </Container>
    );
  }

  const { selfTeam } = selfTeamResult;

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        <AppHeader />
        <Group justify="space-between" align="center">
          <Text size="sm" c="dimmed">
            {settings.name}
          </Text>
          <Link to="/board/$leagueId" params={{ leagueId }} target="_blank">
            <Button component="span" variant="default" size="xs">
              TV Board ↗
            </Button>
          </Link>
        </Group>
        {selfTeam && (
          <DraftTopBar
            draftSettingsId={leagueId as Id<"draftSettings">}
            selfTeamId={selfTeam._id}
          />
        )}
        <Tabs value={activeTab ?? null}>
          <Tabs.List>
            {TABS.map((tab) => (
              <Tabs.Tab
                key={tab.value}
                value={tab.value}
                renderRoot={(props) => (
                  <Link to={tab.to} params={{ leagueId }} {...props} />
                )}
              >
                {tab.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
        <Outlet />
      </Stack>
    </Container>
  );
}
