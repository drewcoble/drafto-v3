import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  Badge,
  Button,
  Card,
  Center,
  Container,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { Plus } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { AppHeader } from "../components/AppHeader";
import {
  APP_CONTENT_MAX_WIDTH,
  MOBILE_HEADER_HEIGHT,
} from "../constants/general";
import { groupSeasonsByLeague } from "../lib/leagueGroups";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

type DraftStatus = "setup" | "in_progress" | "complete";

const STATUS_META: Record<DraftStatus, { label: string; color: string }> = {
  setup: { label: "Setup", color: "gray" },
  in_progress: { label: "Drafting", color: "saddlebrown.8" },
  complete: { label: "Post-Draft", color: "green.8" },
};

// Where "enter this league" goes and what to call it, depending on how far
// its draft has gotten - mirrors AppHeader's modeSwitchButton branching
// (setup vs. live draft vs. completed season).
const ENTER_ACTION: Record<DraftStatus, { label: string }> = {
  setup: { label: "Enter Setup" },
  in_progress: { label: "Enter Draft Room" },
  complete: { label: "Enter Season" },
};

// Renders the right <Link> for a league card's status - kept as three
// explicit branches (rather than a single Link fed a computed "to") because
// TanStack Router's typed route params don't infer through a variable typed
// as a union of routes.
function EnterLeagueLink({
  status,
  leagueId,
  children,
}: {
  status: DraftStatus;
  leagueId: string;
  children: ReactNode;
}) {
  const linkStyle = {
    display: "block",
    height: "100%",
    color: "inherit",
    textDecoration: "none",
  } as const;
  if (status === "in_progress") {
    return (
      <Link to="/draft/$leagueId/draft" params={{ leagueId }} style={linkStyle}>
        {children}
      </Link>
    );
  }
  if (status === "complete") {
    return (
      <Link
        to="/season/$leagueId/freeAgents"
        params={{ leagueId }}
        style={linkStyle}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link to="/setup/$leagueId/league" params={{ leagueId }} style={linkStyle}>
      {children}
    </Link>
  );
}

// The app's home page - the logo (AppHeader.tsx) links here from everywhere
// else. Shows every league this user owns as a card, grouped by
// leagueId (see groupSeasonsByLeague) so multi-year leagues surface once,
// keyed to their most recent season.
function Dashboard() {
  const seasonsList = useQuery(api.leagues.listSeasons, {});

  const leagueGroups = groupSeasonsByLeague(seasonsList ?? []).sort((a, b) =>
    a.latest.name.localeCompare(b.latest.name),
  );

  return (
    <>
      <AppHeader hideLeagueControls />
      <Container
        size={APP_CONTENT_MAX_WIDTH}
        pt={{ base: MOBILE_HEADER_HEIGHT + 16, sm: "xl" }}
        pb="xl"
      >
        <Stack gap="lg">
          {seasonsList === undefined ? (
            <Center py="xl">
              <Loader />
            </Center>
          ) : leagueGroups.length === 0 ? (
            <Stack gap="md" py="xl" align="center">
              <Text c="dimmed">You don't have any leagues yet.</Text>
              <Link to="/setup/$leagueId/league" params={{ leagueId: "new" }}>
                <Button component="span" leftSection={<Plus size={16} />}>
                  New League
                </Button>
              </Link>
            </Stack>
          ) : (
            <>
              <Group justify="flex-end">
                <Link to="/setup/$leagueId/league" params={{ leagueId: "new" }}>
                  <Button
                    component="span"
                    variant="default"
                    leftSection={<Plus size={16} />}
                  >
                    New League
                  </Button>
                </Link>
              </Group>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                {leagueGroups.map(({ latest }) => {
                  const status = STATUS_META[latest.draftStatus];
                  return (
                    <EnterLeagueLink
                      key={latest.leagueId}
                      status={latest.draftStatus}
                      leagueId={latest._id}
                    >
                      <Card
                        withBorder
                        padding="lg"
                        style={{
                          cursor: "pointer",
                          textDecoration: "none",
                          color: "inherit",
                          height: "100%",
                        }}
                      >
                        <Stack gap="sm" justify="space-between" h="100%">
                          <Stack gap={4}>
                            <Group
                              justify="space-between"
                              wrap="nowrap"
                              align="flex-start"
                            >
                              <Text fw={600} lineClamp={2}>
                                {latest.name}
                              </Text>
                              <Badge
                                color={status.color}
                                variant="light"
                                style={{ flexShrink: 0 }}
                              >
                                {status.label}
                              </Badge>
                            </Group>
                            <Text size="sm" c="dimmed">
                              {latest.year} · {latest.teamCount} teams · $
                              {latest.salaryCap} cap · {latest.scoring}
                            </Text>
                          </Stack>
                          <Button component="span" variant="light" fullWidth>
                            {ENTER_ACTION[latest.draftStatus].label}
                          </Button>
                        </Stack>
                      </Card>
                    </EnterLeagueLink>
                  );
                })}
              </SimpleGrid>
            </>
          )}
        </Stack>
      </Container>
    </>
  );
}
