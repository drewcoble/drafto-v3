import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Divider, Stack } from "@mantine/core";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { LeagueDetails } from "../../../pages/Settings/LeagueDetails";
import { LeagueTab as TeamRosterBreakdown } from "../../../pages/DraftRoom/LeagueTab";
import { setStoredLeagueId } from "../../../lib/leagueStorage";
import { useDraftPhase } from "../../../hooks/useDraftPhase";
import { useSelfTeam } from "../../../hooks/useSelfTeam";

export const Route = createFileRoute("/league/$leagueId/league")({
  component: LeagueRoute,
});

// Settings (LeagueDetails, which locks itself once started) plus - only
// once the draft is actually underway - the live per-team roster breakdown
// that used to be the Draft Room's own separate "League" tab
// (pages/DraftRoom/LeagueTab.tsx, aliased here rather than moved since it's
// still a perfectly good standalone component).
function LeagueRoute() {
  const { leagueId } = Route.useParams();
  const navigate = useNavigate();
  const currentUser = useQuery(api.users.getCurrentUser);
  const isNew = leagueId === "new";
  const seasonId = isNew ? undefined : (leagueId as Id<"seasons">);
  const phase = useDraftPhase(seasonId);
  const selfTeamResult = useSelfTeam(seasonId);

  return (
    <Stack gap="lg">
      <LeagueDetails
        selectedLeagueId={isNew ? undefined : (leagueId as Id<"seasons">)}
        isCreatingLeague={isNew}
        onLeagueSaved={(id) => {
          if (currentUser) setStoredLeagueId(currentUser._id, id);
          void navigate({
            to: "/league/$leagueId/league",
            params: { leagueId: id },
            replace: true,
          });
        }}
        onDoneCreating={() => {}}
        onLeagueDeleted={() => {
          void navigate({
            to: "/league/$leagueId/league",
            params: { leagueId: "new" },
            replace: true,
          });
        }}
      />

      {phase?.isStarted && seasonId && selfTeamResult?.selfTeam && (
        <>
          <Divider />
          <TeamRosterBreakdown
            seasonId={seasonId}
            teams={selfTeamResult.teams}
            selfTeamId={selfTeamResult.selfTeam._id}
          />
        </>
      )}
    </Stack>
  );
}
