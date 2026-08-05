import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "../../../../convex/_generated/dataModel";
import { MyTeamTab } from "../../../pages/DraftRoom/MyTeamTab";
import { useSelfTeam } from "../../../hooks/useSelfTeam";

export const Route = createFileRoute("/draft/$leagueId/myTeam")({
  component: MyTeamRouteLeaf,
});

function MyTeamRouteLeaf() {
  const { leagueId } = Route.useParams();
  const seasonId = leagueId as Id<"seasons">;
  const selfTeamResult = useSelfTeam(seasonId);
  if (!selfTeamResult?.selfTeam) return null;

  return (
    <MyTeamTab
      seasonId={seasonId}
      teams={selfTeamResult.teams}
      selfTeamId={selfTeamResult.selfTeam._id}
    />
  );
}
