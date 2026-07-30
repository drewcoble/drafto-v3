import { useQuery } from "convex/react";
import { Group, SimpleGrid, Text } from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { expandRosterSlots } from "../../lib/rosterSlots";
import { useTeamBudget } from "../../hooks/useTeamBudget";
import { WEEK } from "../../constants/general";
import { StatTile } from "./components/StatTile";

interface DraftTopBarProps {
  draftSettingsId: Id<"draftSettings">;
  selfTeamId: Id<"draftTeams">;
}

export function DraftTopBar({
  draftSettingsId,
  selfTeamId,
}: DraftTopBarProps) {
  const settingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const teams = useQuery(api.draft.teams.listDraftTeams, { draftSettingsId });
  const picks = useQuery(api.draft.picks.listDraftPicks, { draftSettingsId });
  const activeNomination = useQuery(api.draft.picks.getActiveNomination, {
    draftSettingsId,
  });

  const settings = settingsList?.find((s) => s._id === draftSettingsId);

  // Same subscription DraftTab makes for the same args - the client shares
  // one subscription across both when DraftTab is also mounted, so this
  // isn't a second server-side computation in that case.
  const draftValues = useQuery(
    api.draftValues.getDraftValues,
    settings && activeNomination
      ? { draftSettingsId, week: WEEK, scoring: settings.scoring }
      : "skip",
  );
  const nominatedValue = activeNomination
    ? draftValues?.find((value) => value.fpid === activeNomination.fpid)
    : undefined;

  const stats = useTeamBudget(
    draftSettingsId,
    selfTeamId,
    activeNomination?.position,
    nominatedValue?.dollarValue,
  );

  if (!settings || !teams || !picks || !stats) return null;

  const totalPicks = expandRosterSlots(settings.rosterSlots).length * teams.length;
  const nextPickNumber = Math.min(picks.length + 1, totalPicks);
  const nominatingTeam = teams.find(
    (team) => team._id === activeNomination?.nominatingTeamId,
  );

  return (
    <Group justify="space-between" align="center" wrap="wrap">
      <Text size="sm" c="dimmed">
        Pick {nextPickNumber} of {totalPicks}
        {nominatingTeam ? ` · Nominating: ${nominatingTeam.name}` : ""}
      </Text>
      <SimpleGrid cols={stats.planSafe !== null ? 4 : 3} spacing="sm">
        <StatTile label="Remaining" value={`$${stats.remaining}`} />
        <StatTile label="Max Bid" value={`$${Math.max(stats.maxBid, 0)}`} />
        {stats.planSafe !== null && (
          <StatTile
            label="Plan-Safe"
            value={`$${Math.max(stats.planSafe, 0)}`}
          />
        )}
        <StatTile
          label="Per Open Slot"
          value={`$${stats.perOpenSlot.toFixed(1)}`}
        />
      </SimpleGrid>
    </Group>
  );
}
