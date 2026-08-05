import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "../../../../convex/_generated/dataModel";
import { DraftTab } from "../../../pages/DraftRoom/DraftTab";
import { useSelfTeam } from "../../../hooks/useSelfTeam";

export const Route = createFileRoute("/draft/$leagueId/draft")({
  component: DraftRouteLeaf,
});

function DraftRouteLeaf() {
  const { leagueId } = Route.useParams();
  const seasonId = leagueId as Id<"seasons">;
  const selfTeamResult = useSelfTeam(seasonId);
  if (!selfTeamResult?.selfTeam) return null;

  return (
    <DraftTab seasonId={seasonId} teams={selfTeamResult.teams} />
  );
}
