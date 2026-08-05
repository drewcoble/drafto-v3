import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { Check, GripVertical, MoreVertical, Pencil, Shuffle } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { TeamOrderRow } from "./TeamOrderRow";

interface TeamsPanelProps {
  seasonId: Id<"seasons">;
  teams: Doc<"seasonTeams">[];
  nominationOrder: Id<"seasonTeams">[] | undefined;
  nominationOrderMode: "linear" | "snake" | undefined;
  salaryCap: number;
  onRenameTeam: (teamId: Id<"seasonTeams">, name: string) => void;
  onSetTeamSalaryCap: (
    teamId: Id<"seasonTeams">,
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
  seasonId,
  teams,
  nominationOrder,
  nominationOrderMode,
  salaryCap,
  onRenameTeam,
  onSetTeamSalaryCap,
  renameError,
}: TeamsPanelProps) {
  const teamById = useMemo(() => {
    const map = new Map<string, Doc<"seasonTeams">>();
    for (const team of teams) map.set(team._id, team);
    return map;
  }, [teams]);

  const defaultOrder = useMemo(
    () => [...teams].sort((a, b) => a.order - b.order).map((t) => t._id),
    [teams],
  );

  const [localOrder, setLocalOrder] = useState<Id<"seasonTeams">[]>(
    nominationOrder ?? defaultOrder,
  );
  const [mode, setMode] = useState<"linear" | "snake">(
    nominationOrderMode ?? "linear",
  );
  const [orderError, setOrderError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingCaps, setEditingCaps] = useState(false);
  const [reordering, setReordering] = useState(false);

  // Distance constraint so tapping the grip handle to just view/scroll
  // doesn't immediately start a drag - same reasoning as elsewhere in this
  // panel about not letting a stray touch quietly change something.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setLocalOrder((current) => {
      const oldIndex = current.indexOf(active.id as Id<"seasonTeams">);
      const newIndex = current.indexOf(over.id as Id<"seasonTeams">);
      if (oldIndex === -1 || newIndex === -1) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  };

  // Fisher-Yates - only touches local state, same as a drag reorder, so it
  // still goes through the existing Save Order flow rather than writing
  // straight to the server (keeps "randomize, look it over, then commit or
  // discard" possible instead of instantly locking in a shuffle).
  const randomize = () => {
    const next = [...localOrder];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j]!, next[i]!];
    }
    setLocalOrder(next);
  };

  const handleSave = async () => {
    setOrderError(null);
    setIsSaving(true);
    try {
      await setNominationOrder({
        seasonId,
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
      await clearNominationOrder({ seasonId });
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
        <Text size="md" fw={500}>
          Teams
        </Text>
        <Group gap="xs">
          <SegmentedControl
            size="sm"
            value={mode}
            onChange={(value) => setMode(value as "linear" | "snake")}
            data={[
              { label: "Linear", value: "linear" },
              { label: "Snake", value: "snake" },
            ]}
          />
          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="default" size={40} aria-label="Team actions">
                <MoreVertical size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<Pencil size={14} />}
                rightSection={editingCaps ? <Check size={14} /> : undefined}
                onClick={() => setEditingCaps((current) => !current)}
              >
                Edit Caps
              </Menu.Item>
              <Menu.Item
                leftSection={<GripVertical size={14} />}
                rightSection={reordering ? <Check size={14} /> : undefined}
                onClick={() => setReordering((current) => !current)}
              >
                Reorder
              </Menu.Item>
              <Menu.Item
                leftSection={<Shuffle size={14} />}
                onClick={randomize}
              >
                Randomize
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={localOrder} strategy={verticalListSortingStrategy}>
          <Stack gap={4}>
            {localOrder.map((teamId, index) => {
              const team = teamById.get(teamId);
              if (!team) return null;
              return (
                <TeamOrderRow
                  key={teamId}
                  team={team}
                  index={index}
                  salaryCap={salaryCap}
                  editingCaps={editingCaps}
                  reordering={reordering}
                  onRename={(name) => onRenameTeam(team._id, name)}
                  onSetSalaryCap={(cap) => onSetTeamSalaryCap(team._id, cap)}
                />
              );
            })}
          </Stack>
        </SortableContext>
      </DndContext>
      {orderError && (
        <Text c="red" size="sm">
          {orderError}
        </Text>
      )}
      <Group gap="xs">
        <Button
          size="md"
          onClick={handleSave}
          loading={isSaving}
          disabled={!isDirty}
        >
          Save Order
        </Button>
        {nominationOrder && (
          <Button size="md" variant="default" onClick={handleClear}>
            Clear (fully manual)
          </Button>
        )}
        <Badge variant="light" color={isDirty ? "yellow" : "teal"}>
          {isDirty ? "Unsaved changes" : "All changes saved"}
        </Badge>
        {nominationOrder && (
          <Badge variant="light" color="teal">
            Order active
          </Badge>
        )}
      </Group>
    </Stack>
  );
}
