import { Fragment, useMemo } from "react";
import { ActionIcon, Anchor, Badge, Group, Table, Text } from "@mantine/core";
import { Pencil, Trash2 } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { POSITION_COLORS } from "../../../lib/positionColors";
import { STEPPER_BUTTON_SIZE } from "../../../constants/general";
import { formatSignedDollar, keeperValueColor } from "../../../lib/keeperValue";

interface KeeperTableProps {
  keepers: Doc<"draftPicks">[];
  nameByFpid: Map<number, { name: string; team: string | null }>;
  teams: { _id: Id<"seasonTeams">; name: string }[];
  // This year's fair-market price per player, used to compute each
  // keeper's value (fair price - what's actually being paid to keep them).
  draftValueByFpid: Map<number, { dollarValue: number }>;
  onRemove: (pickId: Id<"draftPicks">) => void;
  onEdit: (pick: Doc<"draftPicks">) => void;
  onSelectPlayer: (fpid: number) => void;
  // Gates the "Yrs kept" column below - true when the league has a
  // maxConsecutiveYears cap set (see schema.ts's trackConsecutiveYears
  // comment).
  showStreakInput: boolean;
}

// Grouped by team, matching KeeperCardList.tsx's mobile layout - a header
// row per team (name + keeper count/total cost) followed by that team's
// player rows, instead of a flat list with a per-row Team column.
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
  draftValueByFpid,
  onRemove,
  onEdit,
  onSelectPlayer,
  showStreakInput,
}: KeeperTableProps) {
  const keepersByTeamId = useMemo(() => {
    const map = new Map<Id<"seasonTeams">, Doc<"draftPicks">[]>();
    for (const pick of keepers) {
      const list = map.get(pick.teamId);
      if (list) {
        list.push(pick);
      } else {
        map.set(pick.teamId, [pick]);
      }
    }
    return map;
  }, [keepers]);

  if (keepers.length === 0) return null;

  const columnCount = showStreakInput ? 5 : 4;

  return (
    <Table.ScrollContainer minWidth={420} visibleFrom="sm">
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Player</Table.Th>
            <Table.Th>Price</Table.Th>
            <Table.Th>Value</Table.Th>
            {showStreakInput && <Table.Th>Yrs kept</Table.Th>}
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {teams.map((team) => {
            const teamKeepers = keepersByTeamId.get(team._id);
            if (!teamKeepers || teamKeepers.length === 0) return null;

            const totalCost = teamKeepers.reduce(
              (sum, pick) => sum + pick.price,
              0,
            );
            const totalValue = teamKeepers.reduce(
              (sum, pick) =>
                sum +
                ((draftValueByFpid.get(pick.fpid)?.dollarValue ?? 0) -
                  pick.price),
              0,
            );

            return (
              <Fragment key={team._id}>
                <Table.Tr>
                  <Table.Td colSpan={columnCount}>
                    <Group justify="space-between" wrap="nowrap">
                      <Text fw={600}>{team.name}</Text>
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm" c="dimmed">
                          {teamKeepers.length} keeper
                          {teamKeepers.length === 1 ? "" : "s"} · ${totalCost}
                        </Text>
                        <Text
                          size="sm"
                          fw={600}
                          c={keeperValueColor(totalValue)}
                        >
                          {formatSignedDollar(totalValue)} value
                        </Text>
                      </Group>
                    </Group>
                  </Table.Td>
                </Table.Tr>
                {teamKeepers.map((pick) => {
                  const value =
                    (draftValueByFpid.get(pick.fpid)?.dollarValue ?? 0) -
                    pick.price;
                  return (
                    <Table.Tr key={pick._id}>
                      <Table.Td>
                        <Group gap={6} wrap="nowrap">
                          <Badge
                            variant="light"
                            color={POSITION_COLORS[pick.position]}
                          >
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
                      <Table.Td>${pick.price}</Table.Td>
                      <Table.Td>
                        <Text size="sm" c={keeperValueColor(value)}>
                          {formatSignedDollar(value)}
                        </Text>
                      </Table.Td>
                      {showStreakInput && (
                        <Table.Td>{pick.keeperStreak ?? 1}</Table.Td>
                      )}
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
                  );
                })}
              </Fragment>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
