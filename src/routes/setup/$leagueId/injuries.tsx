import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "../../../../convex/_generated/dataModel";
import { InjuryReport } from "../../../pages/InjuryReport/InjuryReport";
import { MOBILE_HEADER_HEIGHT, WEEK } from "../../../constants/general";

export const Route = createFileRoute("/setup/$leagueId/injuries")({
  component: InjuriesRoute,
});

function InjuriesRoute() {
  const { leagueId } = Route.useParams();
  return (
    <InjuryReport
      week={WEEK}
      seasonId={
        leagueId === "new" ? undefined : (leagueId as Id<"seasons">)
      }
      filterBarTop={MOBILE_HEADER_HEIGHT}
    />
  );
}
