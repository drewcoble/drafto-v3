import { createFileRoute } from "@tanstack/react-router";
import { Text } from "@mantine/core";
import type { Id } from "../../../../convex/_generated/dataModel";
import { KeepersTab } from "../../../pages/Settings/KeepersTab";

export const Route = createFileRoute("/setup/$leagueId/keepers")({
  component: KeepersRoute,
});

function KeepersRoute() {
  const { leagueId } = Route.useParams();
  if (leagueId === "new") {
    return (
      <Text c="dimmed" size="sm">
        Select a league first.
      </Text>
    );
  }
  return <KeepersTab draftSettingsId={leagueId as Id<"draftSettings">} />;
}
