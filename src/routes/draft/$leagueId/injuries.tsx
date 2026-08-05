import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "../../../../convex/_generated/dataModel";
import { InjuryReport } from "../../../pages/InjuryReport/InjuryReport";
import {
  MOBILE_HEADER_HEIGHT,
  MOBILE_STATS_ROW_HEIGHT,
  WEEK,
} from "../../../constants/general";

export const Route = createFileRoute("/draft/$leagueId/injuries")({
  component: InjuriesRouteLeaf,
});

function InjuriesRouteLeaf() {
  const { leagueId } = Route.useParams();
  return (
    <InjuryReport
      week={WEEK}
      seasonId={leagueId as Id<"seasons">}
      filterBarTop={MOBILE_HEADER_HEIGHT + MOBILE_STATS_ROW_HEIGHT}
    />
  );
}
