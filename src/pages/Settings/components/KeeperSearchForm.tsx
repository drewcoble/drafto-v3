import { Anchor, Badge, Button, Group, NumberInput, Select, Table, Text, TextInput } from "@mantine/core";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { Position } from "../../../types";
import { POSITION_COLORS } from "../../../lib/positionColors";

interface KeeperSearchResult {
  fpid: number;
  name: string;
  position: Position;
  team: string | null;
}

interface KeeperSearchFormProps {
  keeperSearch: string;
  onKeeperSearchChange: (value: string) => void;
  draftTeams: Doc<"draftTeams">[];
  keeperTeamId: Id<"draftTeams"> | null;
  onKeeperTeamIdChange: (id: Id<"draftTeams"> | null) => void;
  keeperPrice: number;
  onKeeperPriceChange: (price: number) => void;
  keeperError: string | null;
  keeperSearchResults: KeeperSearchResult[];
  draftValueByFpid: Map<number, { dollarValue: number }>;
  priceHistory:
    | Record<number, { price: number; season: string | undefined }>
    | undefined;
  onAddKeeper: (fpid: number, position: Position) => void;
  onSelectPlayer: (fpid: number) => void;
}

export function KeeperSearchForm({
  keeperSearch,
  onKeeperSearchChange,
  draftTeams,
  keeperTeamId,
  onKeeperTeamIdChange,
  keeperPrice,
  onKeeperPriceChange,
  keeperError,
  keeperSearchResults,
  draftValueByFpid,
  priceHistory,
  onAddKeeper,
  onSelectPlayer,
}: KeeperSearchFormProps) {
  return (
    <>
      <Group align="flex-end">
        <TextInput
          label="Search a player to keep..."
          placeholder="e.g. CeeDee Lamb"
          value={keeperSearch}
          onChange={(event) => onKeeperSearchChange(event.currentTarget.value)}
          flex={1}
        />
        <Select
          label="Team"
          data={draftTeams.map((team) => ({
            value: team._id,
            label: team.name,
          }))}
          value={keeperTeamId}
          onChange={(value) => onKeeperTeamIdChange(value as Id<"draftTeams"> | null)}
          w={180}
        />
        <NumberInput
          label="Price"
          min={1}
          prefix="$"
          value={keeperPrice}
          onChange={(value) => onKeeperPriceChange(Number(value) || 1)}
          w={100}
        />
      </Group>
      {keeperError && (
        <Text c="red" size="sm">
          {keeperError}
        </Text>
      )}
      {keeperSearchResults.length > 0 && (
        <Table.ScrollContainer minWidth={600}>
          <Table>
            <Table.Tbody>
              {keeperSearchResults.map((row) => {
                const lastSeason = priceHistory?.[row.fpid];
                return (
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
                      <Badge variant="light" color={POSITION_COLORS[row.position]}>
                        {row.position}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{row.team ?? "—"}</Table.Td>
                    <Table.Td>
                      {draftValueByFpid.get(row.fpid)
                        ? `Fair ~$${Math.round(
                            draftValueByFpid.get(row.fpid)!.dollarValue,
                          )}`
                        : "—"}
                    </Table.Td>
                    <Table.Td>
                      {lastSeason
                        ? `$${lastSeason.price}${
                            lastSeason.season ? ` (${lastSeason.season})` : ""
                          }`
                        : "—"}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="compact-sm"
                        disabled={!keeperTeamId}
                        onClick={() => onAddKeeper(row.fpid, row.position)}
                      >
                        Add as Keeper
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </>
  );
}
