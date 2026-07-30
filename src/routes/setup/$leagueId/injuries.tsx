import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "../../../../convex/_generated/dataModel";
import { InjuryReport } from "../../../pages/InjuryReport/InjuryReport";
import { WEEK } from "../../../constants/general";

export const Route = createFileRoute("/setup/$leagueId/injuries")({
  component: InjuriesRoute,
});

function InjuriesRoute() {
  const { leagueId } = Route.useParams();
  return (
    <InjuryReport
      week={WEEK}
      draftSettingsId={
        leagueId === "new" ? undefined : (leagueId as Id<"draftSettings">)
      }
    />
  );
}
