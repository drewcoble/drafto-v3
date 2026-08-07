import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "../../../../convex/_generated/dataModel";
import { DraftReportCard } from "../../../pages/Season/DraftReportCard";

export const Route = createFileRoute("/season/$leagueId/reportCard")({
  component: ReportCardRouteLeaf,
});

function ReportCardRouteLeaf() {
  const { leagueId } = Route.useParams();
  return <DraftReportCard seasonId={leagueId as Id<"seasons">} />;
}
