import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "../../../convex/_generated/dataModel";
import { DraftReportCard } from "../../pages/DraftReportCard";
import { PageContainer } from "../../components/PageContainer";

// Deliberately NOT nested under any authenticated layout - like
// /board/$leagueId (the TV board), this is a shareable public link (see
// __root.tsx's isPublicRoute exemption) meant to be opened by anyone with
// it, not just the league's owner. Unlike the TV board it's a normal
// scrollable document rather than a full-bleed live display, so it still
// uses the standard PageContainer - just without AppHeader, which assumes
// an authenticated session (league picker, sign out, etc.) that doesn't
// apply to an anonymous visitor.
export const Route = createFileRoute("/reportCard/$leagueId")({
  component: ReportCardRoute,
});

function ReportCardRoute() {
  const { leagueId } = Route.useParams();
  return (
    <PageContainer pt="xl">
      <DraftReportCard seasonId={leagueId as Id<"seasons">} />
    </PageContainer>
  );
}
