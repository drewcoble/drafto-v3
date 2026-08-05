import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PlayersTable } from "../../../pages/Settings/PlayersTable";
import { WEEK } from "../../../constants/general";

export const Route = createFileRoute("/setup/$leagueId/players")({
  component: PlayersRoute,
});

function PlayersRoute() {
  const { leagueId } = Route.useParams();
  return (
    <PlayersTable
      week={WEEK}
      selectedLeagueId={
        leagueId === "new" ? undefined : (leagueId as Id<"seasons">)
      }
    />
  );
}
