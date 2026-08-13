import {
  ActionIcon,
  Anchor,
  Badge,
  Group,
  Menu,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { MoreVertical } from "lucide-react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { Position } from "../../../types";
import type { SlotDescriptor } from "../../../lib/rosterSlots";
import { eligibleSlotsForPosition } from "../../../lib/slotAssignment";
import { positionColorOrDefault } from "../../../lib/positionColors";

interface SlotTableProps {
  slots: SlotDescriptor[];
  pickBySlotKey: Map<string, Doc<"draftPicks">>;
  planAmounts: Record<string, number>;
  nameByFpid: Map<number, { name: string; team: string | null }>;
  flexPositions: readonly Position[];
  superflexPositions: readonly Position[];
  onRemove: (pickId: Id<"draftPicks">) => void;
  onMove: (pickId: Id<"draftPicks">, slotKey: string) => void;
  onSelectPlayer: (fpid: number) => void;
  // Gates the "· Yr X" suffix on the Keeper badge below - true when the
  // league has a maxConsecutiveYears cap set (see schema.ts's
  // trackConsecutiveYears comment).
  trackConsecutiveYears: boolean;
}

export function SlotTable({
  slots,
  pickBySlotKey,
  planAmounts,
  nameByFpid,
  flexPositions,
  superflexPositions,
  onRemove,
  onMove,
  onSelectPlayer,
  trackConsecutiveYears,
}: SlotTableProps) {
  return (
    <Table.ScrollContainer minWidth={340}>
      <Table highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Player</Table.Th>
            <Table.Th>Budget</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {slots.map((slot) => {
            const pick = pickBySlotKey.get(slot.key);
            const player = pick ? nameByFpid.get(pick.fpid) : undefined;
            const planAmount = planAmounts[slot.key] ?? 0;
            const diff = pick ? planAmount - pick.price : 0;
            const moveTargets = pick
              ? eligibleSlotsForPosition(
                  pick.position,
                  slots,
                  flexPositions,
                  superflexPositions,
                ).filter((target) => target.key !== slot.key)
              : [];
            return (
              <Table.Tr key={slot.key}>
                {/* Slot badge + player name + keeper badge all in one cell
                    (was 2 separate columns) - same compaction as
                    KeeperTable.tsx's Player column. */}
                <Table.Td>
                  <Group gap={6} wrap="nowrap" align="center">
                    <Badge
                      variant="light"
                      color={positionColorOrDefault(slot.label)}
                    >
                      {slot.label}
                    </Badge>
                    {player && pick ? (
                      // Keeper badge always stacks under the name (rather
                      // than sharing the row with the position badge and
                      // wrapping onto its own line only once it runs out of
                      // room) so the position badge stays vertically
                      // centered against a consistent 1- or 2-line block
                      // instead of drifting depending on wrap width.
                      <Stack gap={2}>
                        <Anchor
                          component="button"
                          type="button"
                          size="sm"
                          onClick={() => onSelectPlayer(pick.fpid)}
                        >
                          {player.name}
                        </Anchor>
                        {pick.isKeeper && (
                          <Badge
                            variant="light"
                            color="gray"
                            size="sm"
                            style={{ alignSelf: "flex-start" }}
                          >
                            {trackConsecutiveYears
                              ? `Keeper · Yr ${pick.keeperStreak ?? 1}`
                              : "Keeper"}
                          </Badge>
                        )}
                      </Stack>
                    ) : (
                      <Text size="sm" c="dimmed">
                        —
                      </Text>
                    )}
                  </Group>
                </Table.Td>
                {/* Plan/Paid/+- collapsed into one cell (was 3 separate
                    columns) - paid price up top, plan + the colored
                    over/under diff as a smaller line underneath. */}
                <Table.Td>
                  <Stack gap={0}>
                    <Text size="sm" fw={600}>
                      {pick ? `$${pick.price}` : "—"}
                    </Text>
                    <Text
                      size="xs"
                      c={diff > 0 ? "green" : diff < 0 ? "red" : "dimmed"}
                    >
                      plan ${planAmount}
                      {pick && diff !== 0
                        ? ` (${diff > 0 ? `+${diff}` : diff})`
                        : ""}
                    </Text>
                  </Stack>
                </Table.Td>
                <Table.Td>
                  {pick && (
                    <Group gap={4} wrap="nowrap" justify="flex-end">
                      <Menu shadow="md" width={170} position="bottom-end">
                        <Menu.Target>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label="Slot actions"
                          >
                            <MoreVertical size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {moveTargets.map((target) => {
                            const occupant = pickBySlotKey.get(target.key);
                            const occupantName = occupant
                              ? nameByFpid.get(occupant.fpid)?.name
                              : undefined;
                            return (
                              <Menu.Item
                                key={target.key}
                                onClick={() => onMove(pick._id, target.key)}
                              >
                                Move to {target.label}
                                {occupantName
                                  ? ` (swap w/ ${occupantName})`
                                  : ""}
                              </Menu.Item>
                            );
                          })}
                          {moveTargets.length > 0 && <Menu.Divider />}
                          <Menu.Item
                            color="red"
                            onClick={() => onRemove(pick._id)}
                          >
                            Remove
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
