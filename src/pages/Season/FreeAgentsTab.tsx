import { useState } from "react";
import { useQuery } from "convex/react";
import {
  Badge,
  Center,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { POSITIONS, type Position } from "../../types";
import { POSITION_COLORS } from "../../lib/positionColors";
import { PositionFilterBar } from "../../components/PositionFilterBar";
import { PlayerDetailModal } from "../../components/PlayerDetailModal";
import { scoringConfigFromSeason } from "../../lib/relevantPlayers";
import {
  MOBILE_HEADER_HEIGHT,
  POSITION_FILTER_BAR_HEIGHT,
} from "../../constants/general";

interface FreeAgentsTabProps {
  seasonId: Id<"seasons">;
  selfTeamId: Id<"seasonTeams">;
}

// Advisory FAAB bid calculator - see convex/season/faabValues.ts for the
// suggestion math. Reuses PositionFilterBar/PlayerDetailModal exactly as
// PlayersLeftTab does during the draft, just against a different query and
// a free-agent-only pool.
export function FreeAgentsTab({
  seasonId,
  selfTeamId,
}: FreeAgentsTabProps) {
  const settingsList = useQuery(api.leagues.listSeasons, {});
  const settings = settingsList?.find((s) => s._id === seasonId);
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([
    ...POSITIONS,
  ]);
  const [selectedFpid, setSelectedFpid] = useState<number | null>(null);

  const result = useQuery(api.season.faabValues.getFaabSuggestions, {
    seasonId,
    teamId: selfTeamId,
  });

  if (!settings || result === undefined) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  if (result.week === null || result.season === null) {
    return (
      <Stack align="center" py="xl" gap={4}>
        <Text c="dimmed">Not currently in an NFL regular season week.</Text>
        <Text c="dimmed" size="sm">
          FAAB suggestions will appear here once the season starts.
        </Text>
      </Stack>
    );
  }

  const rows = result.suggestions
    .filter((row) => selectedPositions.includes(row.position))
    .sort(
      (a, b) => (b.suggestedBid ?? b.marketValue) - (a.suggestedBid ?? a.marketValue),
    );

  return (
    <Stack gap="md" pt={{ base: POSITION_FILTER_BAR_HEIGHT + 8, sm: 0 }}>
      <Group justify="space-between" wrap="wrap">
        <Title order={3}>Free Agents — Week {result.week}</Title>
        <Text c="dimmed" size="sm">
          {result.remainingWeeks} weeks remaining this season
        </Text>
      </Group>
      <PositionFilterBar
        positions={POSITIONS}
        selected={selectedPositions}
        onChange={setSelectedPositions}
        top={MOBILE_HEADER_HEIGHT}
      />
      <Table.ScrollContainer minWidth={680}>
        <Table striped highlightOnHover verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Player</Table.Th>
              <Table.Th>Pos</Table.Th>
              <Table.Th>ROS Pts</Table.Th>
              <Table.Th>Market $</Table.Th>
              <Table.Th>Your Suggested Bid</Table.Th>
              <Table.Th>Why</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr
                key={row.fpid}
                onClick={() => setSelectedFpid(row.fpid)}
                style={{ cursor: "pointer" }}
              >
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    <Text fw={500}>{row.name}</Text>
                    {row.team && (
                      <Text c="dimmed" size="sm">
                        {row.team}
                      </Text>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Badge color={POSITION_COLORS[row.position]} variant="light">
                    {row.position}
                  </Badge>
                </Table.Td>
                <Table.Td>{row.rosValue.toFixed(1)}</Table.Td>
                <Table.Td>${row.marketValue.toFixed(0)}</Table.Td>
                <Table.Td fw={700}>
                  {row.suggestedBid !== null ? `$${row.suggestedBid}` : "—"}
                </Table.Td>
                <Table.Td>
                  <Text c="dimmed" size="sm">
                    {row.rationale ?? "—"}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <PlayerDetailModal
        fpid={selectedFpid}
        onClose={() => setSelectedFpid(null)}
        week={result.week}
        scoringConfig={scoringConfigFromSeason(settings)}
        season={result.season}
        seasonId={seasonId}
      />
    </Stack>
  );
}
