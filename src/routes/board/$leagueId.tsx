import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "../../../convex/_generated/dataModel";
import { DraftBoard } from "../../pages/DraftBoard/DraftBoard";

// Deliberately NOT nested under draft/$leagueId/route.tsx - this is a bare,
// full-screen page (no AppHeader/Tabs chrome) meant for a second tab/screen,
// not part of the host's own Draft Room navigation.
export const Route = createFileRoute("/board/$leagueId")({
  component: BoardRoute,
});

function BoardRoute() {
  const { leagueId } = Route.useParams();
  return <DraftBoard draftSettingsId={leagueId as Id<"draftSettings">} />;
}
