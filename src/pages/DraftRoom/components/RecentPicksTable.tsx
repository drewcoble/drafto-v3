import { ActionIcon, Anchor, Badge, Stack, Table, Text } from "@mantine/core";
import { Trash2 } from "lucide-react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";

interface RecentPicksTableProps {
  picks: Doc<"draftPicks">[];
  nameByFpid: Map<number, { name: string; team: string | null }>;
  teamNameById: Map<string, string>;
  onRemove: (pickId: Id<"draftPicks">) => void;
  onSelectPlayer: (fpid: number) => void;
  // Gates the "· Yr X" suffix on the Keeper badge below - see
  // KeeperRulesPanel.tsx's trackConsecutiveYears toggle.
  trackConsecutiveYears: boolean;
}

export function RecentPicksTable({
  picks,
  nameByFpid,
  teamNameById,
  onRemove,
  onSelectPlayer,
  trackConsecutiveYears,
}: RecentPicksTableProps) {
  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        Recent picks
      </Text>
      {picks.length === 0 ? (
        <Text size="sm" c="dimmed">
          No picks yet.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={500}>
          <Table striped highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Player</Table.Th>
                <Table.Th>Team</Table.Th>
                <Table.Th>Price</Table.Th>
                <Table.Th></Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {picks.map((pick) => (
                <Table.Tr key={pick._id}>
                  <Table.Td>
                    <Anchor
                      component="button"
                      type="button"
                      onClick={() => onSelectPlayer(pick.fpid)}
                    >
                      {nameByFpid.get(pick.fpid)?.name ?? `#${pick.fpid}`}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>{teamNameById.get(pick.teamId) ?? "—"}</Table.Td>
                  <Table.Td>${pick.price}</Table.Td>
                  <Table.Td>
                    {pick.isKeeper && (
                      <Badge variant="light" color="gray" size="sm">
                        {trackConsecutiveYears
                          ? `Keeper · Yr ${pick.keeperStreak ?? 1}`
                          : "Keeper"}
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Remove pick"
                      onClick={() => onRemove(pick._id)}
                    >
                      <Trash2 size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}
