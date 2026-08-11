import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
// useConvexAuth from convex/react, not @convex-dev/auth/react - see
// __root.tsx's comment on the same import for why (the latter's
// isAuthenticated doesn't wait for server confirmation).
import { useConvexAuth, useQuery } from "convex/react";
import {
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { Plus } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { AppHeader } from "../components/AppHeader";
import { PageContainer } from "../components/PageContainer";
import { DRAFT_STATUS_META, type DraftStatus } from "../lib/draftStatus";
import { groupSeasonsByLeague } from "../lib/leagueGroups";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

// Where "enter this league" goes and what to call it, depending on how far
// its draft has gotten - mirrors AppHeader's modeSwitchButton branching
// (unified league view vs. completed season).
const ENTER_ACTION: Record<DraftStatus, { label: string }> = {
  setup: { label: "Enter League" },
  in_progress: { label: "Enter Draft Room" },
  complete: { label: "Enter Season" },
};

// Renders the right <Link> for a league card's status - kept as explicit
// branches (rather than a single Link fed a computed "to") because
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
  // "setup" and "in_progress" both land in the same unified league view now
  // (see routes/league/$leagueId) - the view itself adapts to phase, so
  // there's no separate "in progress" destination anymore. Settings (not
  // league.tsx's live roster breakdown) is the general-purpose landing tab.
  return (
    <Link
      to="/league/$leagueId/settings"
      params={{ leagueId }}
      style={linkStyle}
    >
      {children}
    </Link>
  );
}

// The app's home page - the logo (AppHeader.tsx) links here from everywhere
// else. Shows every league this user owns as a card, grouped by
// leagueId (see groupSeasonsByLeague) so multi-year leagues surface once,
// keyed to their most recent season.
function Dashboard() {
  const { isAuthenticated } = useConvexAuth();
  // __root.tsx only renders this route at all once it believes the user is
  // authenticated, but listSeasons throws (rather than degrading
  // gracefully) if that belief turns out to be premature - see
  // AppHeader.tsx's copy of this same guard for why isAuthenticated is
  // checked here directly instead of trusting the outer gate alone.
  const seasonsList = useQuery(
    api.leagues.listSeasons,
    isAuthenticated ? {} : "skip",
  );

  const leagueGroups = groupSeasonsByLeague(seasonsList ?? []).sort((a, b) =>
    a.latest.name.localeCompare(b.latest.name),
  );

  return (
    <PageContainer>
      <Stack gap="lg">
        <AppHeader hideLeagueControls />
        {seasonsList === undefined ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : leagueGroups.length === 0 ? (
          <Stack gap="md" py="xl" align="center">
            <Text c="dimmed">You don't have any leagues yet.</Text>
            <Link to="/league/$leagueId/settings" params={{ leagueId: "new" }}>
              <Button component="span" leftSection={<Plus size={16} />}>
                New League
              </Button>
            </Link>
          </Stack>
        ) : (
          <>
            <Group justify="flex-end">
              <Link
                to="/league/$leagueId/settings"
                params={{ leagueId: "new" }}
              >
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
                const status = DRAFT_STATUS_META[latest.draftStatus];
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
    </PageContainer>
  );
}
