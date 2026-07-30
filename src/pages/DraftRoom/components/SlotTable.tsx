import { Anchor, Badge, Button, Group, Table, Text } from "@mantine/core";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { SlotDescriptor } from "../../../lib/rosterSlots";
import { positionColorOrGray } from "../../../lib/positionColors";

interface SlotTableProps {
  slots: SlotDescriptor[];
  pickBySlotKey: Map<string, Doc<"draftPicks">>;
  planAmounts: Record<string, number>;
  nameByFpid: Map<number, { name: string; team: string | null }>;
  onRemove: (pickId: Id<"draftPicks">) => void;
  onSelectPlayer: (fpid: number) => void;
}

export function SlotTable({
  slots,
  pickBySlotKey,
  planAmounts,
  nameByFpid,
  onRemove,
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
                        Keeper
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>${planAmount}</Table.Td>
                <Table.Td>{pick ? `$${pick.price}` : "—"}</Table.Td>
                <Table.Td>{pick ? pick.price - planAmount : ""}</Table.Td>
                <Table.Td>
                  {pick && (
                    <Button
                      size="compact-sm"
                      variant="subtle"
                      color="red"
                      onClick={() => onRemove(pick._id)}
                    >
                      Remove
                    </Button>
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
