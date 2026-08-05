import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "../../../../convex/_generated/dataModel";
import { BudgetTab } from "../../../components/BudgetTab";

export const Route = createFileRoute("/draft/$leagueId/budget")({
  component: BudgetRoute,
});

function BudgetRoute() {
  const { leagueId } = Route.useParams();
  return (
    <BudgetTab seasonId={leagueId as Id<"seasons">} mode="live" />
  );
}
