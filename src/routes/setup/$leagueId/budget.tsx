import { createFileRoute } from "@tanstack/react-router";
import { Text } from "@mantine/core";
import type { Id } from "../../../../convex/_generated/dataModel";
import { BudgetTab } from "../../../components/BudgetTab";

export const Route = createFileRoute("/setup/$leagueId/budget")({
  component: BudgetRoute,
});

function BudgetRoute() {
  const { leagueId } = Route.useParams();
  if (leagueId === "new") {
    return (
      <Text c="dimmed" size="sm">
        Select a league first.
      </Text>
    );
  }
  return (
    <BudgetTab
      draftSettingsId={leagueId as Id<"draftSettings">}
      mode="predraft"
    />
  );
}
