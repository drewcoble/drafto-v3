import { useMemo } from "react";
import { ActionIcon, Anchor, Badge, Group, Table } from "@mantine/core";
import { Pencil, Trash2 } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { POSITION_COLORS } from "../../../lib/positionColors";
import { STEPPER_BUTTON_SIZE } from "../../../constants/general";

interface KeeperTableProps {
  keepers: Doc<"draftPicks">[];
  nameByFpid: Map<number, { name: string; team: string | null }>;
  teams: { _id: Id<"seasonTeams">; name: string }[];
  onRemove: (pickId: Id<"draftPicks">) => void;
  onEdit: (pick: Doc<"draftPicks">) => void;
  onSelectPlayer: (fpid: number) => void;
  // Gates the "Yrs kept" column below - true when the league has a
  // maxConsecutiveYears cap set (see schema.ts's trackConsecutiveYears
  // comment).
  showStreakInput: boolean;
}

// Deliberately a compact read-only summary rather than inline
// dropdowns/steppers per row - team/price/streak are all edited through
// KeeperEditModal.tsx instead, opened via the pencil icon here. Roster slot
// assignment isn't shown at all anymore - now that My Team is browsable
// pre-draft too, that's handled there instead of duplicating a slot picker
// on this page.
export function KeeperTable({
  keepers,
  nameByFpid,
  teams,
  onRemove,
  onEdit,
  onSelectPlayer,
  showStreakInput,
}: KeeperTableProps) {
  const teamNameById = useMemo(
    () => new Map(teams.map((team) => [team._id, team.name])),
    [teams],
  );

  if (keepers.length === 0) return null;

  return (
    <Table.ScrollContainer minWidth={420} visibleFrom="sm">
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Player</Table.Th>
            <Table.Th>Team</Table.Th>
            <Table.Th>Price</Table.Th>
            {showStreakInput && <Table.Th>Yrs kept</Table.Th>}
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {keepers.map((pick) => (
            <Table.Tr key={pick._id}>
              <Table.Td>
                <Group gap={6} wrap="nowrap">
                  <Badge variant="light" color={POSITION_COLORS[pick.position]}>
                    {pick.position}
                  </Badge>
                  <Anchor
                    component="button"
                    type="button"
                    onClick={() => onSelectPlayer(pick.fpid)}
                  >
                    {nameByFpid.get(pick.fpid)?.name ?? `#${pick.fpid}`}
                  </Anchor>
                </Group>
              </Table.Td>
              <Table.Td>{teamNameById.get(pick.teamId) ?? "—"}</Table.Td>
              <Table.Td>${pick.price}</Table.Td>
              {showStreakInput && <Table.Td>{pick.keeperStreak ?? 1}</Table.Td>}
              <Table.Td>
                <Group gap={4} wrap="nowrap" justify="flex-end">
                  <ActionIcon
                    size={STEPPER_BUTTON_SIZE}
                    variant="subtle"
                    color="gray"
                    aria-label="Edit keeper"
                    onClick={() => onEdit(pick)}
                  >
                    <Pencil size={16} />
                  </ActionIcon>
                  <ActionIcon
                    size={STEPPER_BUTTON_SIZE}
                    variant="subtle"
                    color="red"
                    aria-label="Remove keeper"
                    onClick={() => onRemove(pick._id)}
                  >
                    <Trash2 size={16} />
                  </ActionIcon>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
