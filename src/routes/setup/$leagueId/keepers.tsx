import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Center, Loader, Modal, Text } from "@mantine/core";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { KeepersTab } from "../../../pages/Settings/KeepersTab";
import { UpgradePrompt } from "../../../components/UpgradePrompt";

export const Route = createFileRoute("/setup/$leagueId/keepers")({
  component: KeepersRoute,
});

// The Keepers tab is hidden from NavTabs when a league has turned keepers
// off, but that only keeps someone from clicking into it - this catches
// direct navigation (a bookmarked/typed URL) the same way
// routes/setup/$leagueId/data.tsx guards the super-admin-only Data tab.
//
// Keepers is also Pro-only now (see convex/leagues.ts's setUseKeepers) -
// a free-plan visitor gets a non-dismissible upgrade prompt instead of the
// redirect below, since that needs to be seen, not just bounced past. The
// redirect stays for the other case: a Pro owner who turned keepers off on
// purpose for this league.
function KeepersRoute() {
  const { leagueId } = Route.useParams();
  const navigate = useNavigate();
  const settingsList = useQuery(api.leagues.listSeasons, {});
  const settings = settingsList?.find((league) => league._id === leagueId);
  const entitlement = useQuery(api.billing.queries.getMyEntitlement);
  // Absent means true - see schema.ts's useKeepers comment.
  const keepersEnabled = settings?.useKeepers !== false;
  const hasProAccess = entitlement?.hasProAccess ?? false;

  useEffect(() => {
    if (
      leagueId !== "new" &&
      settingsList !== undefined &&
      entitlement !== undefined &&
      hasProAccess &&
      !keepersEnabled
    ) {
      void navigate({
        to: "/setup/$leagueId/league",
        params: { leagueId },
        replace: true,
      });
    }
  }, [leagueId, settingsList, entitlement, hasProAccess, keepersEnabled, navigate]);

  if (leagueId === "new") {
    return (
      <Text c="dimmed" size="sm">
        Select a league first.
      </Text>
    );
  }

  if (settingsList === undefined || entitlement === undefined) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  if (!hasProAccess) {
    return (
      <Modal
        opened
        onClose={() => {}}
        withCloseButton={false}
        closeOnClickOutside={false}
        closeOnEscape={false}
        centered
      >
        <UpgradePrompt
          title="Keepers is a Pro feature"
          message="Upgrade to Pro to set up keeper rules and tiers for this league."
        />
      </Modal>
    );
  }

  if (!keepersEnabled) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  return <KeepersTab seasonId={leagueId as Id<"seasons">} />;
}
