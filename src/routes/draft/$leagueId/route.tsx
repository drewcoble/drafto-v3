import {
  Box,
  Button,
  Center,
  Container,
  Loader,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  CircleUserRound,
  DollarSign,
  HeartPulse,
  ListChecks,
  Settings2,
  UserSearch,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { AppHeader } from "../../../components/AppHeader";
import { BottomNav } from "../../../components/BottomNav";
import {
  APP_CONTENT_MAX_WIDTH,
  MOBILE_HEADER_HEIGHT,
  MOBILE_STATS_ROW_HEIGHT,
} from "../../../constants/general";
import { useSelfTeam } from "../../../hooks/useSelfTeam";
import { DraftTopBar } from "../../../pages/DraftRoom/DraftTopBar";

export const Route = createFileRoute("/draft/$leagueId")({
  component: DraftLayout,
});

const TABS = [
  {
    value: "budget",
    label: "Budget",
    icon: DollarSign,
    to: "/draft/$leagueId/budget",
  },
  {
    value: "draft",
    label: "Draft",
    icon: ListChecks,
    to: "/draft/$leagueId/draft",
  },
  {
    value: "myTeam",
    label: "My Team",
    icon: CircleUserRound,
    to: "/draft/$leagueId/myTeam",
  },
  {
    value: "players",
    label: "Players",
    icon: UserSearch,
    to: "/draft/$leagueId/players",
  },
  {
    value: "injuries",
    label: "Injuries",
    icon: HeartPulse,
    to: "/draft/$leagueId/injuries",
  },
  {
    value: "league",
    label: "League",
    icon: Settings2,
    to: "/draft/$leagueId/league",
  },
] as const;

// "draft" moves into More too (not just injuries/league) so the bottom nav
// has an even number of direct items - BottomNav splits them 2-and-2 around
// a center gap reserved for the nominate FAB (see MobileNomination), which
// used to sit directly on top of whichever tab landed in the dead center of
// an odd-count flex row (myTeam, with the old 4-item bar).
const MORE_VALUES = new Set(["draft", "injuries", "league"]);

const BOTTOM_NAV_ITEMS = TABS.filter((tab) => !MORE_VALUES.has(tab.value));
const BOTTOM_NAV_MORE_ITEMS = TABS.filter((tab) => MORE_VALUES.has(tab.value));

// Teams are set up ahead of time on the League Details tab (Enter Draft Room
// is disabled there until they exist), so this only needs to handle the
// loaded/not-found states, not first-time team setup.
function DraftLayout() {
  const { leagueId } = Route.useParams();
  const location = useLocation();
  const settingsList = useQuery(api.leagues.listSeasons, {});
  const selfTeamResult = useSelfTeam(leagueId as Id<"seasons">);

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
    <Container
      size={APP_CONTENT_MAX_WIDTH}
      pt={{
        base: MOBILE_HEADER_HEIGHT + MOBILE_STATS_ROW_HEIGHT + 16,
        sm: "xl",
      }}
      pb={{ base: 230, sm: "xl" }}
    >
      <Stack gap="md">
        <AppHeader />
        {selfTeam && (
          <DraftTopBar
            seasonId={leagueId as Id<"seasons">}
            selfTeamId={selfTeam._id}
          />
        )}
        <Box visibleFrom="sm">
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
        </Box>
        <BottomNav
          items={BOTTOM_NAV_ITEMS}
          more={{ label: "More", items: BOTTOM_NAV_MORE_ITEMS }}
          leagueId={leagueId}
          hasFab
        />
        <Outlet />
      </Stack>
    </Container>
  );
}
