import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "../../../../convex/_generated/dataModel";
import { InjuryReport } from "../../../pages/InjuryReport/InjuryReport";
import { WEEK } from "../../../constants/general";

export const Route = createFileRoute("/draft/$leagueId/injuries")({
  component: InjuriesRouteLeaf,
});

function InjuriesRouteLeaf() {
  const { leagueId } = Route.useParams();
  return (
    <InjuryReport week={WEEK} draftSettingsId={leagueId as Id<"draftSettings">} />
  );
}
