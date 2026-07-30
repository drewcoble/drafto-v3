import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "../../../../convex/_generated/dataModel";
import { LeagueTab } from "../../../pages/DraftRoom/LeagueTab";
import { useSelfTeam } from "../../../hooks/useSelfTeam";

export const Route = createFileRoute("/draft/$leagueId/league")({
  component: LeagueRouteLeaf,
});

function LeagueRouteLeaf() {
  const { leagueId } = Route.useParams();
  const draftSettingsId = leagueId as Id<"draftSettings">;
  const selfTeamResult = useSelfTeam(draftSettingsId);
  if (!selfTeamResult?.selfTeam) return null;

  return (
    <LeagueTab
      draftSettingsId={draftSettingsId}
      teams={selfTeamResult.teams}
      selfTeamId={selfTeamResult.selfTeam._id}
    />
  );
}
