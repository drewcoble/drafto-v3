import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Center, Loader, Text } from "@mantine/core";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { KeepersTab } from "../../../pages/Settings/KeepersTab";

export const Route = createFileRoute("/setup/$leagueId/keepers")({
  component: KeepersRoute,
});

// The Keepers tab is hidden from NavTabs when a league has turned keepers
// off, but that only keeps someone from clicking into it - this catches
// direct navigation (a bookmarked/typed URL) the same way
// routes/setup/$leagueId/data.tsx guards the super-admin-only Data tab.
function KeepersRoute() {
  const { leagueId } = Route.useParams();
  const navigate = useNavigate();
  const settingsList = useQuery(api.leagues.listSeasons, {});
  const settings = settingsList?.find((league) => league._id === leagueId);
  // Absent means true - see schema.ts's useKeepers comment.
  const keepersEnabled = settings?.useKeepers !== false;

  useEffect(() => {
    if (leagueId !== "new" && settingsList !== undefined && !keepersEnabled) {
      void navigate({
        to: "/setup/$leagueId/league",
        params: { leagueId },
        replace: true,
      });
    }
  }, [leagueId, settingsList, keepersEnabled, navigate]);

  if (leagueId === "new") {
    return (
      <Text c="dimmed" size="sm">
        Select a league first.
      </Text>
    );
  }

  if (settingsList === undefined || !keepersEnabled) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  return <KeepersTab seasonId={leagueId as Id<"seasons">} />;
}
