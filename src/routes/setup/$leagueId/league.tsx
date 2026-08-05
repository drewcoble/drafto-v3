import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { LeagueDetails } from "../../../pages/Settings/LeagueDetails";
import { setStoredLeagueId } from "../../../lib/leagueStorage";

export const Route = createFileRoute("/setup/$leagueId/league")({
  component: LeagueRoute,
});

function LeagueRoute() {
  const { leagueId } = Route.useParams();
  const navigate = useNavigate();
  const currentUser = useQuery(api.users.getCurrentUser);
  const isNew = leagueId === "new";

  return (
    <LeagueDetails
      selectedLeagueId={isNew ? undefined : (leagueId as Id<"seasons">)}
      isCreatingLeague={isNew}
      onLeagueSaved={(id) => {
        if (currentUser) setStoredLeagueId(currentUser._id, id);
        void navigate({
          to: "/setup/$leagueId/league",
          params: { leagueId: id },
          replace: true,
        });
      }}
      onDoneCreating={() => {}}
      onLeagueDeleted={() => {
        // Same "new" landing spot New League already uses - the header's
        // league picker (or the "/" redirect, next visit) is how they get
        // back to any of their other leagues.
        void navigate({
          to: "/setup/$leagueId/league",
          params: { leagueId: "new" },
          replace: true,
        });
      }}
    />
  );
}
