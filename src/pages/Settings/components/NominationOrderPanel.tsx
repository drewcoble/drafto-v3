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

interface NominationOrderPanelProps {
  draftSettingsId: Id<"draftSettings">;
  teams: Doc<"draftTeams">[];
  nominationOrder: Id<"draftTeams">[] | undefined;
  nominationOrderMode: "linear" | "snake" | undefined;
}

// Configures the suggested nomination turn order (see
// convex/draft/nominationOrder.ts) - independent of the order teams were
// originally entered in (draftTeams.order), and always just a *suggestion*
// the Draft Room's nominate form defaults to, never an enforced
// restriction - the host can still nominate as any team, or clear "whose
// turn" to none at all (e.g. for a pre-cycle top-X auction), at any time.
export function NominationOrderPanel({
  draftSettingsId,
  teams,
  nominationOrder,
  nominationOrderMode,
}: NominationOrderPanelProps) {
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
  const [error, setError] = useState<string | null>(null);
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
    setError(null);
    setIsSaving(true);
    try {
      await setNominationOrder({
        draftSettingsId,
        teamIds: localOrder,
        mode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save order.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setError(null);
    try {
      await clearNominationOrder({ draftSettingsId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear order.");
    }
  };

  const isDirty =
    localOrder.join(",") !== (nominationOrder ?? defaultOrder).join(",") ||
    mode !== (nominationOrderMode ?? "linear");

  return (
    <Stack gap="sm" maw={420}>
      <Text size="sm" fw={500}>
        Nomination Order
      </Text>
      <Text size="sm" c="dimmed">
        Sets who the nominate form suggests next during the live draft -
        always overridable in the moment, so it's fine if the room deviates.
      </Text>
      <SegmentedControl
        value={mode}
        onChange={(value) => setMode(value as "linear" | "snake")}
        data={[
          { label: "Linear", value: "linear" },
          { label: "Snake", value: "snake" },
        ]}
        w={220}
      />
      <Stack gap={4}>
        {localOrder.map((teamId, index) => (
          <Group key={teamId} gap="xs" wrap="nowrap">
            <Text size="sm" w={20} c="dimmed">
              {index + 1}
            </Text>
            <Text size="sm" flex={1}>
              {teamById.get(teamId)?.name ?? "Unknown team"}
            </Text>
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
        ))}
      </Stack>
      {error && (
        <Text c="red" size="sm">
          {error}
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
      </Group>
      {nominationOrder && (
        <Badge variant="light" color="teal" w="fit-content">
          Order active
        </Badge>
      )}
    </Stack>
  );
}
