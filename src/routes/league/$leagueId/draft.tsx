import { createFileRoute } from "@tanstack/react-router";
import { Text } from "@mantine/core";
import type { Id } from "../../../../convex/_generated/dataModel";
import { DraftTab } from "../../../pages/DraftRoom/DraftTab";
import { useSelfTeam } from "../../../hooks/useSelfTeam";

export const Route = createFileRoute("/league/$leagueId/draft")({
  component: DraftRouteLeaf,
});

// Reusable pre-start too - with no picks yet (beyond keepers) it just shows
// an empty recent-picks table and shortlist, which is a reasonable "nothing
// drafted yet" state rather than needing a dedicated placeholder. Nominate
// controls live in DraftTopBar (layout route, started-only), not here.
function DraftRouteLeaf() {
  const { leagueId } = Route.useParams();
  const isNew = leagueId === "new";
  const seasonId = isNew ? undefined : (leagueId as Id<"seasons">);
  const selfTeamResult = useSelfTeam(seasonId);

  if (isNew) {
    return (
      <Text c="dimmed" size="sm">
        Select a league first.
      </Text>
    );
  }
  if (!selfTeamResult) {
    return null;
  }

  return (
    <DraftTab
      seasonId={seasonId as Id<"seasons">}
      teams={selfTeamResult.teams}
    />
  );
}
