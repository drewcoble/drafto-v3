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

type TabValue =
  | "settings"
  | "keepers"
  | "budget"
  | "players"
  | "myTeam"
  | "injuries"
  | "league"
  | "draft";

// Shared metadata, keyed by value - the two phases below reorder and
// regroup these same eight tabs rather than defining separate copies.
const TAB_META: Record<
  TabValue,
  { label: string; icon: typeof Settings2; to: string }
> = {
  settings: {
    label: "Settings",
    icon: Settings2,
    to: "/league/$leagueId/settings",
  },
  keepers: {
    label: "Keepers",
    icon: UserCheck,
    to: "/league/$leagueId/keepers",
  },
  budget: {
    label: "Budget",
    icon: DollarSign,
    to: "/league/$leagueId/budget",
  },
  players: {
    label: "Players",
    icon: UserSearch,
    to: "/league/$leagueId/players",
  },
  myTeam: {
    label: "My Team",
    icon: CircleUserRound,
    to: "/league/$leagueId/myTeam",
  },
  injuries: {
    label: "Injuries",
    icon: HeartPulse,
    to: "/league/$leagueId/injuries",
  },
  // The live per-team roster breakdown (see league.tsx) is a
  // draft-in-progress reference tool.
  league: {
    label: "League",
    icon: LayoutGrid,
    to: "/league/$leagueId/league",
  },
  draft: {
    label: "Draft",
    icon: ListChecks,
    to: "/league/$leagueId/draft",
  },
};

// Two entirely separate orderings/groupings, not just a reshuffle of one
// list - pre-draft is about setting the league up (Settings first), once
// the draft's live the auction tools (Budget/Players) and in-draft
// reference views (League/Draft) matter more than one-time setup.
const PRE_DRAFT_ORDER: TabValue[] = [
  "settings",
  "keepers",
  "budget",
  "players",
  "myTeam",
  "injuries",
  "league",
  "draft",
];
// The first N of the *visible* order fill the direct slots (see
// visibleValues below) - positional rather than a fixed value set, so if
// keepers is off and drops out of the list entirely, myTeam backfills the
// 4th direct slot instead of leaving only 3.
const PRE_DRAFT_DIRECT_COUNT = 4;

const STARTED_ORDER: TabValue[] = [
  "budget",
  "players",
  "league",
  "draft",
  "myTeam",
  "injuries",
  "settings",
  "keepers",
];
// Only 3 direct slots once started (not 4) - the nominate FAB takes the
// bottom nav's center gap, so 3 tab buttons + the More button splits 2+2
// around it instead of the pre-draft 4-tabs-no-FAB layout.
const STARTED_DIRECT_COUNT = 3;

const toBottomNavItem = (value: TabValue) => ({
  value,
  ...TAB_META[value],
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
  const entitlement = useQuery(api.billing.queries.getMyEntitlement);
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

  // Absent means "auction" (see convex/draftType.ts's resolveDraftType,
  // duplicated inline here rather than imported - src/ never imports
  // runtime convex/ modules directly, only _generated types/api).
  const draftType = settings?.draftType ?? "auction";
  const isAuction = draftType === "auction";

  // Absent means true (see schema.ts's useKeepers comment) - don't hide the
  // tab while settings is still loading, only once positively known off.
  // Only applies to Pro leagues though - a free-tier league always shows
  // the tab (regardless of the setting) so clicking it lands on the
  // non-dismissible upgrade prompt (see keepers.tsx's Pro gate) instead of
  // the tab just vanishing, which read as the feature not existing at all.
  // Keepers is also auction-only in phase 1 (SNAKE_DRAFT.md §3.4) - hidden
  // for a snake/linear league regardless of Pro access, same as Budget.
  const hasProAccess = entitlement?.hasProAccess ?? false;
  const keepersEnabled =
    isAuction && (!hasProAccess || settings?.useKeepers !== false);
  // Budget planning is auction-only too (SNAKE_DRAFT.md §3.4) - no
  // $-plan-vs-actual concept exists for a snake/linear draft.
  const budgetEnabled = isAuction;
  const order = isStarted ? STARTED_ORDER : PRE_DRAFT_ORDER;
  const directCount = isStarted ? STARTED_DIRECT_COUNT : PRE_DRAFT_DIRECT_COUNT;
  const visibleValues = order.filter(
    (value) =>
      (value !== "keepers" || keepersEnabled) &&
      (value !== "budget" || budgetEnabled),
  );
  const visibleTabs = visibleValues.map((value) => ({
    value,
    ...TAB_META[value],
  }));
  const bottomNavItems = visibleValues
    .slice(0, directCount)
    .map(toBottomNavItem);
  const bottomNavMoreItems = visibleValues
    .slice(directCount)
    .map(toBottomNavItem);

  return (
    <PageContainer
      pt={{
        base:
          (isStarted && isAuction ? MOBILE_STATS_ROW_HEIGHT : 0) +
          MOBILE_HEADER_HEIGHT +
          16,
        sm: "xl",
      }}
      pb={{ base: isStarted ? 230 : 116, sm: "xl" }}
    >
      <Stack gap="md">
        <AppHeader />
        {/* Auction-only (SNAKE_DRAFT.md §3.4/§5.2) - nominate/bid/budget
            stats have no snake/linear equivalent. The snake Draft tab
            (SnakeDraftTab) is self-contained instead of leaning on this
            persistent top bar the way auction's DraftTab does. */}
        {isStarted && isAuction && selfTeamResult?.selfTeam && seasonId && (
          <DraftTopBar
            seasonId={seasonId}
            selfTeamId={selfTeamResult.selfTeam._id}
          />
        )}
        {/* pos="relative" + zIndex needed so this outranks the Keepers
            route's non-dismissible free-plan upgrade Modal (zIndex 190,
            see keepers.tsx) - without a positioned ancestor here, this Box
            has no stacking context of its own and renders underneath the
            modal's fixed overlay, same reasoning as BottomNav's zIndex
            below, so a free-plan visitor could open Keepers but never
            click back out to another tab on desktop. */}
        <Box visibleFrom="sm" pos="relative" style={{ zIndex: 200 }}>
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
