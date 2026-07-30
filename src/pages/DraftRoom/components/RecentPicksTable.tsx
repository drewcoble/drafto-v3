import { Anchor, Badge, Button, Stack, Table, Text } from "@mantine/core";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";

interface RecentPicksTableProps {
  picks: Doc<"draftPicks">[];
  nameByFpid: Map<number, { name: string; team: string | null }>;
  teamNameById: Map<string, string>;
  onRemove: (pickId: Id<"draftPicks">) => void;
  onSelectPlayer: (fpid: number) => void;
}

export function RecentPicksTable({
  picks,
  nameByFpid,
  teamNameById,
  onRemove,
  onSelectPlayer,
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
          <Table>
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
                  <Table.Td>${pick.price}</Table.Td>
                  <Table.Td>{teamNameById.get(pick.teamId) ?? "—"}</Table.Td>
                  <Table.Td>
                    {pick.isKeeper && (
                      <Badge variant="light" color="gray" size="sm">
                        Keeper
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="compact-sm"
                      variant="subtle"
                      color="red"
                      onClick={() => onRemove(pick._id)}
                    >
                      Remove
                    </Button>
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
