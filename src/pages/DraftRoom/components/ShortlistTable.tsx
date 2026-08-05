import {
  ActionIcon,
  Anchor,
  Badge,
  Group,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { POSITION_COLORS } from "../../../lib/positionColors";
import type { DraftTierRow } from "../../../types";

interface ShortlistRow {
  tag: Doc<"draftPlayerTags">;
  row: DraftTierRow | undefined;
  pick: Doc<"draftPicks"> | undefined;
  draftedByTeam: Doc<"seasonTeams"> | undefined;
}

interface ShortlistTableProps {
  rows: ShortlistRow[];
  onMove: (index: number, delta: number) => void;
  onRemove: (fpid: number) => void;
  onSelectPlayer: (fpid: number) => void;
}

// Mirrors RecentPicksTable's structure (title + empty state + table props)
// exactly, so the two read as one consistent pair shown side by side on the
// Draft tab. Tagging itself happens elsewhere (Players Left's bar click, or
// the Setup app's Players table) - this is purely for reviewing, reordering,
// and pruning the resulting shortlist.
export function TargetsTable({
  rows,
  onMove,
  onRemove,
  onSelectPlayer,
}: ShortlistTableProps) {
  return (
    <Stack gap={6}>
      <Text size="sm" fw={500}>
        Targets
      </Text>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          No targets yet.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={500}>
          <Table striped highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th></Table.Th>
                <Table.Th>Player</Table.Th>
                <Table.Th>Value</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(({ tag, row, pick, draftedByTeam }, index) => (
                <Table.Tr key={tag.fpid}>
                  <Table.Td>
                    <Group gap={2} wrap="nowrap">
                      <ActionIcon
                        size={40}
                        variant="subtle"
                        disabled={index === 0}
                        onClick={() => onMove(index, -1)}
                      >
                        <ChevronUp size={14} />
                      </ActionIcon>
                      <ActionIcon
                        size={40}
                        variant="subtle"
                        disabled={index === rows.length - 1}
                        onClick={() => onMove(index, 1)}
                      >
                        <ChevronDown size={14} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    {row ? (
                      <Group gap={6} wrap="nowrap">
                        <Anchor
                          component="button"
                          type="button"
                          onClick={() => onSelectPlayer(tag.fpid)}
                        >
                          {row.name}
                        </Anchor>
                        <Badge
                          size="sm"
                          variant="light"
                          color={POSITION_COLORS[row.position]}
                        >
                          {row.position}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {row.team ?? "—"}
                        </Text>
                      </Group>
                    ) : (
                      <Text size="sm">#{tag.fpid}</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {row
                      ? `$${Math.round(row.dollarValue)} · ${row.tierLabel}`
                      : "—"}
                  </Table.Td>
                  <Table.Td>
                    {pick ? (
                      <Badge
                        variant="light"
                        color={draftedByTeam?.isSelf ? "blue" : "gray"}
                      >
                        {draftedByTeam?.isSelf
                          ? "You"
                          : (draftedByTeam?.name ?? "Drafted")}{" "}
                        - ${pick.price}
                      </Badge>
                    ) : (
                      <Badge variant="light" color="green">
                        Available
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Remove target"
                      onClick={() => onRemove(tag.fpid)}
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
