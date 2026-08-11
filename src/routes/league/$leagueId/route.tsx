import { Box, Center, Loader, Stack, Tabs } from "@mantine/core";
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
  LayoutGrid,
  ListChecks,
  Settings2,
  UserCheck,
  UserSearch,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { AppHeader } from "../../../components/AppHeader";
import { BottomNav } from "../../../components/BottomNav";
import { PageContainer } from "../../../components/PageContainer";
import {
  MOBILE_HEADER_HEIGHT,
  MOBILE_STATS_ROW_HEIGHT,
} from "../../../constants/general";
import { useDraftPhase } from "../../../hooks/useDraftPhase";
import { useSelfTeam } from "../../../hooks/useSelfTeam";
import { DraftTopBar } from "../../../pages/DraftRoom/DraftTopBar";

export const Route = createFileRoute("/league/$leagueId")({
  component: LeagueLayout,
});

const TABS = [
  {
    value: "settings",
    label: "Settings",
    icon: Settings2,
    to: "/league/$leagueId/settings",
  },
  {
    value: "keepers",
    label: "Keepers",
    icon: UserCheck,
    to: "/league/$leagueId/keepers",
  },
  {
    value: "budget",
    label: "Budget",
    icon: DollarSign,
    to: "/league/$leagueId/budget",
  },
  {
    value: "draft",
    label: "Draft",
    icon: ListChecks,
    to: "/league/$leagueId/draft",
  },
  {
    value: "myTeam",
    label: "My Team",
    icon: CircleUserRound,
    to: "/league/$leagueId/myTeam",
  },
  {
    value: "players",
    label: "Players",
    icon: UserSearch,
    to: "/league/$leagueId/players",
  },
  {
    value: "injuries",
    label: "Injuries",
    icon: HeartPulse,
    to: "/league/$leagueId/injuries",
  },
  // Last - the live per-team roster breakdown (see league.tsx) is a
  // draft-in-progress reference tool, not where you land day-to-day the
  // way Settings used to be before the split.
  {
    value: "league",
    label: "League",
    icon: LayoutGrid,
    to: "/league/$leagueId/league",
  },
] as const;

// Settings/Budget/MyTeam/Players are the ones worth a direct bottom-nav
// slot pre-draft - Keepers/Draft/Injuries/League always go in "More".
const ALWAYS_MORE_VALUES = new Set(["keepers", "draft", "injuries", "league"]);

const toBottomNavItem = (tab: (typeof TABS)[number]) => ({
  value: tab.value,
  label: tab.label,
  icon: tab.icon,
  to: tab.to,
});

// Single merged layout for the whole season lifecycle - previously two
// separate trees (/setup and /draft) that let a user be "in" both at once.
// Every tab is always reachable; individual tabs/fields lock themselves once
// the draft starts (see LeagueDetails.tsx's isStarted-driven locks) rather
// than this layout hiding anything structural.
function LeagueLayout() {
  const { leagueId } = Route.useParams();
  const location = useLocation();
  const isNew = leagueId === "new";
  const seasonId = isNew ? undefined : (leagueId as Id<"seasons">);

  const settingsList = useQuery(api.leagues.listSeasons, {});
  const settings = settingsList?.find((s) => s._id === leagueId);
  const phase = useDraftPhase(seasonId);
  // Only mounted once started (see below) - no teams/no self team pre-start
  // is completely normal (teams are created on the Settings tab, in this
  // same layout), so there's nothing to guard against here the way the old
  // Draft Room layout did.
  const selfTeamResult = useSelfTeam(seasonId);
  const isStarted = phase?.isStarted ?? false;

  const activeTab = location.pathname.split("/").pop();

  if (settingsList === undefined) {
    return (
      <>
        <AppHeader />
        <PageContainer>
          <Center>
            <Loader />
          </Center>
        </PageContainer>
      </>
    );
  }

  // Absent means true (see schema.ts's useKeepers comment) - don't hide the
  // tab while settings is still loading, only once positively known off.
  const keepersEnabled = settings?.useKeepers !== false;
  const visibleTabs = TABS.filter((tab) => {
    if (tab.value === "keepers") return keepersEnabled;
    return true;
  });
  // Settings also moves into "More" once the draft has started - it locks
  // itself at that point anyway (see LeagueDetails.tsx), and freeing up its
  // direct slot leaves Budget/MyTeam/Players (3 buttons + the More button =
  // 4) for a clean 2+2 split around the nominate FAB's center gap, instead
  // of a lopsided 3+2 with a direct slot for a tab you can't edit anymore.
  const moreValues = isStarted
    ? new Set([...ALWAYS_MORE_VALUES, "settings"])
    : ALWAYS_MORE_VALUES;
  const bottomNavItems = visibleTabs
    .filter((tab) => !moreValues.has(tab.value))
    .map(toBottomNavItem);
  const bottomNavMoreItems = visibleTabs
    .filter((tab) => moreValues.has(tab.value))
    .map(toBottomNavItem);

  return (
    <PageContainer
      pt={{
        base:
          (isStarted ? MOBILE_STATS_ROW_HEIGHT : 0) + MOBILE_HEADER_HEIGHT + 16,
        sm: "xl",
      }}
      pb={{ base: isStarted ? 230 : 116, sm: "xl" }}
    >
      <Stack gap="md">
        <AppHeader />
        {isStarted && selfTeamResult?.selfTeam && seasonId && (
          <DraftTopBar
            seasonId={seasonId}
            selfTeamId={selfTeamResult.selfTeam._id}
          />
        )}
        <Box visibleFrom="sm">
          <Tabs value={activeTab ?? null}>
            <Tabs.List>
              {visibleTabs.map((tab) => (
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
          items={bottomNavItems}
          more={{ label: "More", items: bottomNavMoreItems }}
          leagueId={leagueId}
          hasFab={isStarted}
        />
        <Outlet />
      </Stack>
    </PageContainer>
  );
}
