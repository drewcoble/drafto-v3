import { Tabs } from "@mantine/core";
import { Link, useLocation, useParams } from "@tanstack/react-router";

const TABS = [
  { value: "league", label: "League Details", to: "/setup/$leagueId/league" },
  { value: "keepers", label: "Keepers", to: "/setup/$leagueId/keepers" },
  { value: "budget", label: "Budget", to: "/setup/$leagueId/budget" },
  { value: "players", label: "Players", to: "/setup/$leagueId/players" },
  { value: "injuries", label: "Injuries", to: "/setup/$leagueId/injuries" },
  { value: "data", label: "Data", to: "/setup/$leagueId/data" },
] as const;

export function NavTabs() {
  const { leagueId } = useParams({ from: "/setup/$leagueId" });
  const location = useLocation();
  const activeTab = location.pathname.split("/").pop();

  return (
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
  );
}
