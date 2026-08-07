import type { ReactNode } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Center,
  Container,
  Group,
  Loader,
  Menu,
  SimpleGrid,
  Stack,
  Text,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import {
  CreditCard,
  LogOut,
  Moon,
  MoreVertical,
  Plus,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { groupSeasonsByLeague } from "../lib/leagueGroups";
import { APP_CONTENT_MAX_WIDTH } from "../constants/general";

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
  const linkStyle = { display: "block", height: "100%" };
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
  const currentUser = useQuery(api.users.getCurrentUser);
  const seasonsList = useQuery(api.leagues.listSeasons, {});
  const { signOut } = useAuthActions();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const isDark = colorScheme === "dark";

  const leagueGroups = groupSeasonsByLeague(seasonsList ?? []).sort((a, b) =>
    a.latest.name.localeCompare(b.latest.name),
  );

  return (
    <Container size={APP_CONTENT_MAX_WIDTH} py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Title order={2} fz={{ base: "1.125rem", sm: "1.625rem" }}>
            <Text component="span" inherit c="saddlebrown.6">
              infini
            </Text>
            draft
          </Title>
          <Menu position="bottom-end" withArrow offset={8}>
            <Menu.Target>
              <ActionIcon variant="default" size={40} aria-label="More options">
                <MoreVertical size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                component={Link}
                to="/billing"
                leftSection={<CreditCard size={16} />}
              >
                Billing
              </Menu.Item>
              {currentUser?.role === "super-admin" && (
                <Menu.Item
                  component={Link}
                  to="/admin"
                  leftSection={<ShieldCheck size={16} />}
                >
                  Admin
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={isDark ? <Sun size={16} /> : <Moon size={16} />}
                onClick={() => setColorScheme(isDark ? "light" : "dark")}
              >
                {isDark ? "Light mode" : "Dark mode"}
              </Menu.Item>
              <Menu.Item
                leftSection={<LogOut size={16} />}
                onClick={() => signOut()}
              >
                Sign out
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>

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
                          <Group justify="space-between" wrap="nowrap" align="flex-start">
                            <Text fw={600} lineClamp={2}>
                              {latest.name}
                            </Text>
                            <Badge color={status.color} variant="light" style={{ flexShrink: 0 }}>
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
  );
}
