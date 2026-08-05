import { ActionIcon, Anchor, Badge, Group, Menu, Table, Text } from "@mantine/core";
import { MoreVertical } from "lucide-react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { Position } from "../../../types";
import type { SlotDescriptor } from "../../../lib/rosterSlots";
import { eligibleSlotsForPosition } from "../../../lib/slotAssignment";
import { positionColorOrGray } from "../../../lib/positionColors";

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
}: SlotTableProps) {
  return (
    <Table.ScrollContainer minWidth={500}>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Slot</Table.Th>
            <Table.Th>Player</Table.Th>
            <Table.Th>Plan</Table.Th>
            <Table.Th>Paid</Table.Th>
            <Table.Th>+/-</Table.Th>
            <Table.Th></Table.Th>
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
                <Table.Td>
                  <Badge variant="light" color={positionColorOrGray(slot.position)}>
                    {slot.label}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    {player && pick ? (
                      <Anchor
                        component="button"
                        type="button"
                        size="sm"
                        onClick={() => onSelectPlayer(pick.fpid)}
                      >
                        {player.name}
                      </Anchor>
                    ) : (
                      <Text size="sm">—</Text>
                    )}
                    {pick?.isKeeper && (
                      <Badge variant="light" color="gray" size="sm">
                        Keeper · Yr {pick.keeperStreak ?? 1}
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>${planAmount}</Table.Td>
                <Table.Td>{pick ? `$${pick.price}` : "—"}</Table.Td>
                <Table.Td>
                  {pick && (
                    <Text
                      size="sm"
                      c={diff > 0 ? "green" : diff < 0 ? "red" : "inherit"}
                    >
                      {diff > 0 ? `+${diff}` : diff}
                    </Text>
                  )}
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
                                {occupantName ? ` (swap w/ ${occupantName})` : ""}
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
