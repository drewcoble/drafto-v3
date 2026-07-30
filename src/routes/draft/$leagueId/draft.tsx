import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "../../../../convex/_generated/dataModel";
import { DraftTab } from "../../../pages/DraftRoom/DraftTab";
import { useSelfTeam } from "../../../hooks/useSelfTeam";

export const Route = createFileRoute("/draft/$leagueId/draft")({
  component: DraftRouteLeaf,
});

function DraftRouteLeaf() {
  const { leagueId } = Route.useParams();
  const draftSettingsId = leagueId as Id<"draftSettings">;
  const selfTeamResult = useSelfTeam(draftSettingsId);
  if (!selfTeamResult?.selfTeam) return null;

  return (
    <DraftTab
      draftSettingsId={draftSettingsId}
      teams={selfTeamResult.teams}
      selfTeamId={selfTeamResult.selfTeam._id}
    />
  );
}
