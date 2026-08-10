import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Center, Loader, Modal, Stack, Text } from "@mantine/core";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { KeepersTab } from "../../../pages/Settings/KeepersTab";
import { UpgradePrompt } from "../../../components/UpgradePrompt";
import { LockedNotice } from "../../../components/LockedNotice";
import { useDraftPhase } from "../../../hooks/useDraftPhase";

export const Route = createFileRoute("/league/$leagueId/keepers")({
  component: KeepersRoute,
});

// The Keepers tab is hidden from the tab bar when a league has turned
// keepers off, but that only keeps someone from clicking into it - this
// catches direct navigation (a bookmarked/typed URL).
//
// Keepers is also Pro-only (see convex/leagues.ts's setUseKeepers) - a
// free-plan visitor gets a non-dismissible upgrade prompt instead of the
// redirect below, since that needs to be seen, not just bounced past. The
// redirect stays for the other case: a Pro owner who turned keepers off on
// purpose for this league.
function KeepersRoute() {
  const { leagueId } = Route.useParams();
  const navigate = useNavigate();
  const settingsList = useQuery(api.leagues.listSeasons, {});
  const settings = settingsList?.find((league) => league._id === leagueId);
  const entitlement = useQuery(api.billing.queries.getMyEntitlement);
  const phase = useDraftPhase(
    leagueId === "new" ? undefined : (leagueId as Id<"seasons">),
  );
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
        to: "/league/$leagueId/league",
        params: { leagueId },
        replace: true,
      });
    }
  }, [
    leagueId,
    settingsList,
    entitlement,
    hasProAccess,
    keepersEnabled,
    navigate,
  ]);

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
        // Mantine's Modal overlay defaults to z-index 400 - well above the
        // app's own fixed chrome (AppHeader at 220, BottomNav/
        // UnallocatedBar/the nominate FAB around 200-210), which would
        // otherwise sit visually and interactively underneath this
        // "can't close it" block, trapping a visitor on the page instead
        // of just blocking the Keepers content itself. 190 keeps it above
        // ordinary page content but below all of that global chrome.
        zIndex={190}
      >
        <UpgradePrompt
          title="Keepers is a Pro feature"
          message="Upgrade to Pro to set up keeper rules for this league."
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

  return (
    <Stack gap="md">
      {phase?.isStarted && (
        <LockedNotice>
          This draft has started - keeper rules are locked, and keepers can no
          longer be added or removed.
        </LockedNotice>
      )}
      <KeepersTab seasonId={leagueId as Id<"seasons">} />
    </Stack>
  );
}
