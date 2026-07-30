import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { Position } from "../../../types";
import { POSITION_COLORS } from "../../../lib/positionColors";

interface SearchResult {
  fpid: number;
  name: string;
  position: Position;
  team: string | null;
}

interface NominateSearchCardProps {
  search: string;
  onSearchChange: (value: string) => void;
  teams: Doc<"draftTeams">[];
  nominatingTeamId: Id<"draftTeams">;
  onNominatingTeamIdChange: (id: Id<"draftTeams">) => void;
  actionError: string | null;
  searchResults: SearchResult[];
  draftValueByFpid: Map<number, { dollarValue: number }>;
  onNominate: (fpid: number) => void;
  onSelectPlayer: (fpid: number) => void;
}

export function NominateSearchCard({
  search,
  onSearchChange,
  actionError,
  searchResults,
  draftValueByFpid,
  onNominate,
  onSelectPlayer,
}: NominateSearchCardProps) {
  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group align="flex-end">
          <TextInput
            label="Search a player to put on the block..."
            placeholder="Player name"
            value={search}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            flex={1}
          />
          {/* <Select
            label="Nominating"
            data={teams.map((team) => ({ value: team._id, label: team.name }))}
            value={nominatingTeamId}
            onChange={(value) =>
              value && onNominatingTeamIdChange(value as Id<"draftTeams">)
            }
            w={180}
          /> */}
        </Group>
        {actionError && (
          <Text c="red" size="sm">
            {actionError}
          </Text>
        )}
        {searchResults.length > 0 && (
          <Table.ScrollContainer minWidth={500}>
            <Table>
              <Table.Tbody>
                {searchResults.map((row) => (
                  <Table.Tr key={row.fpid}>
                    <Table.Td>
                      <Anchor
                        component="button"
                        type="button"
                        onClick={() => onSelectPlayer(row.fpid)}
                      >
                        {row.name}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        color={POSITION_COLORS[row.position]}
                      >
                        {row.position}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{row.team ?? "—"}</Table.Td>
                    <Table.Td>
                      {draftValueByFpid.get(row.fpid)
                        ? `$${Math.round(draftValueByFpid.get(row.fpid)!.dollarValue)}`
                        : "—"}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="compact-sm"
                        onClick={() => onNominate(row.fpid)}
                      >
                        Nominate
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Stack>
    </Card>
  );
}
