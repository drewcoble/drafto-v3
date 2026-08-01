import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { TeamNameField } from "./TeamNameField";
import { TeamSalaryCapField } from "./TeamSalaryCapField";

interface TeamsPanelProps {
  draftSettingsId: Id<"draftSettings">;
  teams: Doc<"draftTeams">[];
  nominationOrder: Id<"draftTeams">[] | undefined;
  nominationOrderMode: "linear" | "snake" | undefined;
  salaryCap: number;
  onRenameTeam: (teamId: Id<"draftTeams">, name: string) => void;
  onSetTeamSalaryCap: (
    teamId: Id<"draftTeams">,
    salaryCap: number | null,
  ) => void;
  renameError: string | null;
}

// One consolidated list for every "teams already exist" concern - renaming
// and nomination-order reordering both just operate on the same list of
// teams, so they used to live in two separate cards (Draft Teams /
// Nomination Order) that each rendered their own copy of the team list.
// Order here (see convex/draft/nominationOrder.ts) is always just a
// *suggestion* the Draft Room's nominate form defaults to, never an
// enforced restriction - the host can still nominate as any team, or clear
// "whose turn" to none at all (e.g. for a pre-cycle top-X auction), at any
// time.
export function TeamsPanel({
  draftSettingsId,
  teams,
  nominationOrder,
  nominationOrderMode,
  salaryCap,
  onRenameTeam,
  onSetTeamSalaryCap,
  renameError,
}: TeamsPanelProps) {
  const teamById = useMemo(() => {
    const map = new Map<string, Doc<"draftTeams">>();
    for (const team of teams) map.set(team._id, team);
    return map;
  }, [teams]);

  const defaultOrder = useMemo(
    () => [...teams].sort((a, b) => a.order - b.order).map((t) => t._id),
    [teams],
  );

  const [localOrder, setLocalOrder] = useState<Id<"draftTeams">[]>(
    nominationOrder ?? defaultOrder,
  );
  const [mode, setMode] = useState<"linear" | "snake">(
    nominationOrderMode ?? "linear",
  );
  const [orderError, setOrderError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalOrder(nominationOrder ?? defaultOrder);
  }, [nominationOrder, defaultOrder]);

  useEffect(() => {
    setMode(nominationOrderMode ?? "linear");
  }, [nominationOrderMode]);

  const setNominationOrder = useMutation(
    api.draft.nominationOrder.setNominationOrder,
  );
  const clearNominationOrder = useMutation(
    api.draft.nominationOrder.clearNominationOrder,
  );

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= localOrder.length) return;
    const next = [...localOrder];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setLocalOrder(next);
  };

  const handleSave = async () => {
    setOrderError(null);
    setIsSaving(true);
    try {
      await setNominationOrder({
        draftSettingsId,
        teamIds: localOrder,
        mode,
      });
    } catch (err) {
      setOrderError(
        err instanceof Error ? err.message : "Failed to save order.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setOrderError(null);
    try {
      await clearNominationOrder({ draftSettingsId });
    } catch (err) {
      setOrderError(
        err instanceof Error ? err.message : "Failed to clear order.",
      );
    }
  };

  // No order active yet is always "dirty" - Save should be clickable even
  // when localOrder (seeded from defaultOrder) happens to already match
  // what team-creation order would produce, since clicking Save is still a
  // real state change (inactive -> active) rather than a no-op. Once an
  // order IS active, only an actual difference from it makes this dirty.
  const isDirty =
    !nominationOrder ||
    localOrder.join(",") !== nominationOrder.join(",") ||
    mode !== (nominationOrderMode ?? "linear");

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500}>
          Teams
        </Text>
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(value) => setMode(value as "linear" | "snake")}
          data={[
            { label: "Linear", value: "linear" },
            { label: "Snake", value: "snake" },
          ]}
        />
      </Group>
      <Text size="xs" c="dimmed">
        Rename teams and reorder to set who the nominate form suggests next
        during the live draft - always overridable in the moment, so it's
        fine if the room deviates.
      </Text>
      {renameError && (
        <Text c="red" size="sm">
          {renameError}
        </Text>
      )}
      <Stack gap={4}>
        {localOrder.map((teamId, index) => {
          const team = teamById.get(teamId);
          if (!team) return null;
          return (
            <Group key={teamId} gap="xs" wrap="nowrap">
              <Text size="sm" w={20} c="dimmed">
                {index + 1}
              </Text>
              <TeamNameField
                team={team}
                onRename={(name) => onRenameTeam(team._id, name)}
              />
              <TeamSalaryCapField
                team={team}
                leagueSalaryCap={salaryCap}
                onSetSalaryCap={(cap) => onSetTeamSalaryCap(team._id, cap)}
              />
              {team.isSelf && (
                <Badge variant="light" size="sm">
                  you
                </Badge>
              )}
              <ActionIcon
                variant="default"
                size="sm"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ChevronUp size={14} />
              </ActionIcon>
              <ActionIcon
                variant="default"
                size="sm"
                disabled={index === localOrder.length - 1}
                onClick={() => move(index, 1)}
              >
                <ChevronDown size={14} />
              </ActionIcon>
            </Group>
          );
        })}
      </Stack>
      {orderError && (
        <Text c="red" size="sm">
          {orderError}
        </Text>
      )}
      <Group gap="xs">
        <Button
          size="sm"
          onClick={handleSave}
          loading={isSaving}
          disabled={!isDirty}
        >
          Save Order
        </Button>
        {nominationOrder && (
          <Button size="sm" variant="default" onClick={handleClear}>
            Clear (fully manual)
          </Button>
        )}
        {nominationOrder && (
          <Badge variant="light" color="teal">
            Order active
          </Badge>
        )}
      </Group>
    </Stack>
  );
}
