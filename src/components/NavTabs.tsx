import { Box, Tabs } from "@mantine/core";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  Database,
  DollarSign,
  HeartPulse,
  Settings2,
  UserCheck,
  UserSearch,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { BottomNav } from "./BottomNav";

const TABS = [
  {
    value: "league",
    label: "League Details",
    shortLabel: "League",
    icon: Settings2,
    to: "/setup/$leagueId/league",
  },
  {
    value: "keepers",
    label: "Keepers",
    shortLabel: "Keepers",
    icon: UserCheck,
    to: "/setup/$leagueId/keepers",
  },
  {
    value: "budget",
    label: "Budget",
    shortLabel: "Budget",
    icon: DollarSign,
    to: "/setup/$leagueId/budget",
  },
  {
    value: "players",
    label: "Players",
    shortLabel: "Players",
    icon: UserSearch,
    to: "/setup/$leagueId/players",
  },
  {
    value: "injuries",
    label: "Injuries",
    shortLabel: "Injuries",
    icon: HeartPulse,
    to: "/setup/$leagueId/injuries",
  },
  {
    value: "data",
    label: "Data",
    shortLabel: "Data",
    icon: Database,
    to: "/setup/$leagueId/data",
  },
] as const;

const MORE_VALUES = new Set(["keepers", "injuries", "data"]);

const toBottomNavItem = (tab: (typeof TABS)[number]) => ({
  value: tab.value,
  label: tab.shortLabel,
  icon: tab.icon,
  to: tab.to,
});

export function NavTabs() {
  const { leagueId } = useParams({ from: "/setup/$leagueId" });
  const location = useLocation();
  const activeTab = location.pathname.split("/").pop();
  const currentUser = useQuery(api.users.getCurrentUser);
  const isSuperAdmin = currentUser?.role === "super-admin";
  const settingsList = useQuery(api.leagues.listSeasons, {});
  const settings = settingsList?.find((league) => league._id === leagueId);
  // Absent means true (see schema.ts's useKeepers comment) - don't hide the
  // tab while settingsList is still loading, only once we positively know
  // it's off, so the tab doesn't flash away and back on every visit.
  const keepersEnabled = settings?.useKeepers !== false;

  // Data fetching is a super-admin-only tool - not just gated once you're
  // on the tab (see DataPanel), hidden from non-super-admins entirely so
  // there's no dead-end tab or mention of a feature they can't use. Keepers
  // works the same way when a league has turned them off (see
  // routes/setup/$leagueId/keepers.tsx for the matching route-level guard).
  const visibleTabs = TABS.filter((tab) => {
    if (tab.value === "data") return isSuperAdmin;
    if (tab.value === "keepers") return keepersEnabled;
    return true;
  });
  const bottomNavItems = visibleTabs
    .filter((tab) => !MORE_VALUES.has(tab.value))
    .map(toBottomNavItem);
  const bottomNavMoreItems = visibleTabs
    .filter((tab) => MORE_VALUES.has(tab.value))
    .map(toBottomNavItem);

  return (
    <>
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
      />
    </>
  );
}
