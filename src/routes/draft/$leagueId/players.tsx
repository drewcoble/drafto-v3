import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PlayersLeftTab } from "../../../pages/DraftRoom/PlayersLeftTab";
import { useSelfTeam } from "../../../hooks/useSelfTeam";

export const Route = createFileRoute("/draft/$leagueId/players")({
  component: PlayersRouteLeaf,
});

function PlayersRouteLeaf() {
  const { leagueId } = Route.useParams();
  const draftSettingsId = leagueId as Id<"draftSettings">;
  const selfTeamResult = useSelfTeam(draftSettingsId);
  if (!selfTeamResult?.selfTeam) return null;

  return (
    <PlayersLeftTab
      draftSettingsId={draftSettingsId}
      selfTeamId={selfTeamResult.selfTeam._id}
    />
  );
}
