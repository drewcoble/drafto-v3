import { createFileRoute } from "@tanstack/react-router";
import { Stack, Text } from "@mantine/core";
import type { Id } from "../../../../convex/_generated/dataModel";
import { LeagueTab as TeamRosterBreakdown } from "../../../pages/DraftRoom/LeagueTab";
import { useDraftPhase } from "../../../hooks/useDraftPhase";
import { useSelfTeam } from "../../../hooks/useSelfTeam";

export const Route = createFileRoute("/league/$leagueId/league")({
  component: LeagueRoute,
});

// The live per-team roster breakdown (pages/DraftRoom/LeagueTab.tsx,
// aliased here rather than moved since it's still a perfectly good
// standalone component) - previously combined with league setup on this
// same tab, now split out so day-to-day draft-room use isn't sharing a tab
// with one-time/rare setup config (see settings.tsx). Only meaningful once
// the draft has actually started; nothing to break down before then.
function LeagueRoute() {
  const { leagueId } = Route.useParams();
  const isNew = leagueId === "new";
  const seasonId = isNew ? undefined : (leagueId as Id<"seasons">);
  const phase = useDraftPhase(seasonId);
  const selfTeamResult = useSelfTeam(seasonId);

  if (phase?.isStarted && seasonId && selfTeamResult?.selfTeam) {
    return (
      <TeamRosterBreakdown
        seasonId={seasonId}
        teams={selfTeamResult.teams}
        selfTeamId={selfTeamResult.selfTeam._id}
      />
    );
  }

  return (
    <Stack gap="lg">
      <Text c="dimmed">
        Each team's roster and budget will show up here once the draft starts.
      </Text>
    </Stack>
  );
}
