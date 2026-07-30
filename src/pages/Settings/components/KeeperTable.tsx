import { Anchor, Badge, Button, Table } from "@mantine/core";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { POSITION_COLORS } from "../../../lib/positionColors";

interface KeeperTableProps {
  keepers: Doc<"draftPicks">[];
  nameByFpid: Map<number, { name: string; team: string | null }>;
  teamNameById: Map<string, string>;
  onRemove: (pickId: Id<"draftPicks">) => void;
  onSelectPlayer: (fpid: number) => void;
}

export function KeeperTable({
  keepers,
  nameByFpid,
  teamNameById,
  onRemove,
  onSelectPlayer,
}: KeeperTableProps) {
  if (keepers.length === 0) return null;

  return (
    <Table.ScrollContainer minWidth={500}>
      <Table>
        <Table.Tbody>
          {keepers.map((pick) => (
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
              <Table.Td>
                <Badge variant="light" color={POSITION_COLORS[pick.position]}>
                  {pick.position}
                </Badge>
              </Table.Td>
              <Table.Td>{teamNameById.get(pick.teamId) ?? "—"}</Table.Td>
              <Table.Td>${pick.price}</Table.Td>
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
  );
}
