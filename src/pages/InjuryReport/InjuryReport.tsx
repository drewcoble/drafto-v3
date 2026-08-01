import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  Anchor,
  Badge,
  Button,
  Center,
  Chip,
  Group,
  Loader,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { POSITIONS, type Position, type ScoringFormat } from "../../types";
import { POSITION_COLORS } from "../../lib/positionColors";
import { injuryColor } from "../../lib/playerFormatting";
import {
  filterRelevantPlayers,
  pointsForScoring,
} from "../../lib/relevantPlayers";
import { PlayerDetailModal } from "../../components/PlayerDetailModal";

interface InjuryReportProps {
  week: string;
  draftSettingsId: Id<"draftSettings"> | undefined;
}

export function InjuryReport({ week, draftSettingsId }: InjuryReportProps) {
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([
    ...POSITIONS,
  ]);
  const [selectedFpid, setSelectedFpid] = useState<number | null>(null);

  const injuries = useQuery(api.injuries.getInjuries, {});
  const allProjections = useQuery(api.projections.getAllProjections, {
    week,
  });
  const allRankings = useQuery(api.rankings.getAllRankings, { week });
  const draftSettingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const settings = draftSettingsId
    ? draftSettingsList?.find((league) => league._id === draftSettingsId)
    : undefined;
  const scoring: ScoringFormat = settings?.scoring ?? "PPR";
  const thisSeason = settings?.season ?? String(new Date().getFullYear());

  // A position only matters to the selected league if it fills a dedicated
  // roster slot or is FLEX/SUPERFLEX-eligible - same rule PlayersTable.tsx
  // uses. Falls back to every position while settings are still loading (or
  // no league is selected at all) so nothing flashes empty.
  const activePositions = useMemo(() => {
    if (!settings) return [...POSITIONS];
    return POSITIONS.filter(
      (pos) =>
        settings.rosterSlots[pos] > 0 ||
        settings.flexPositions.includes(pos) ||
        settings.superflexPositions.includes(pos),
    );
  }, [settings]);

  const adpByFpid = useMemo(() => {
    const map = new Map<
      number,
      { adpStd: number; adpHalf: number; adpPpr: number }
    >();
    for (const ranking of allRankings ?? []) {
      map.set(ranking.fpid, ranking);
    }
    return map;
  }, [allRankings]);

  // Same ADP-based relevance trim PlayersTable.tsx/PlayersLeftTab.tsx use,
  // so a deep-bench/practice-squad injury (Sleeper tracks thousands) doesn't
  // show up here just because it's technically "injured" - and restricted
  // to the league's active positions, so e.g. a 0-K league shows no kickers.
  const relevantProjections = useMemo(() => {
    if (!allProjections) return [];
    return filterRelevantPlayers(
      allProjections,
      activePositions,
      scoring,
      adpByFpid,
      (row) => pointsForScoring(row, scoring),
    );
  }, [allProjections, activePositions, scoring, adpByFpid]);

  const projByFpid = useMemo(() => {
    const map = new Map<number, Doc<"projections">>();
    for (const row of relevantProjections) map.set(row.fpid, row);
    return map;
  }, [relevantProjections]);

  // Only players we can actually identify as draft-relevant (see
  // relevantProjections above) and that match the position filter - then
  // most-prominent-first (by projected points), since that's what you'd
  // scan for first before a draft.
  const rows = useMemo(() => {
    return (injuries ?? [])
      .map((injury) => ({ injury, player: projByFpid.get(injury.fpid) }))
      .filter(
        (row): row is { injury: Doc<"injuries">; player: Doc<"projections"> } =>
          row.player !== undefined && selectedPositions.includes(row.player.position),
      )
      .sort((a, b) => pointsForScoring(b.player, scoring) - pointsForScoring(a.player, scoring));
  }, [injuries, projByFpid, selectedPositions, scoring]);

  const isLoading =
    injuries === undefined ||
    allProjections === undefined ||
    allRankings === undefined;

  return (
    <Stack gap="md" py="sm">
      <Group justify="space-between" align="center" wrap="wrap">
        <Chip.Group
          multiple
          value={selectedPositions}
          onChange={(value) => setSelectedPositions(value as Position[])}
        >
          <Group gap="xs">
            <Button
              size="compact-xs"
              variant="default"
              onClick={() => setSelectedPositions(activePositions)}
            >
              All
            </Button>
            {activePositions.map((pos) => (
              <Group key={pos} gap={4} wrap="nowrap">
                <Chip value={pos} color={POSITION_COLORS[pos]}>
                  {pos}
                </Chip>
                <Anchor
                  component="button"
                  type="button"
                  size="xs"
                  c="dimmed"
                  onClick={() => setSelectedPositions([pos])}
                >
                  only
                </Anchor>
              </Group>
            ))}
          </Group>
        </Chip.Group>
        {!isLoading && (
          <Text size="xs" c="dimmed">
            {rows.length} currently injured
          </Text>
        )}
      </Group>

      {isLoading ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : rows.length === 0 ? (
        <Text c="dimmed">No currently-injured players for the selected position(s).</Text>
      ) : (
        <Table.ScrollContainer minWidth={800}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th miw={200}>Player</Table.Th>
                <Table.Th miw={70}>Pos</Table.Th>
                <Table.Th>Team</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Prob. of Playing</Table.Th>
                <Table.Th miw={240}>Comment</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(({ injury, player }) => (
                <Table.Tr key={injury._id}>
                  <Table.Td>
                    <Anchor
                      component="button"
                      type="button"
                      fw={500}
                      c="inherit"
                      onClick={() => setSelectedFpid(injury.fpid)}
                    >
                      {player.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={POSITION_COLORS[player.position]} variant="light">
                      {player.position}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{player.team ?? "—"}</Table.Td>
                  <Table.Td>
                    <Badge color={injuryColor(injury.status)} variant="light">
                      {injury.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{injury.injuryType || "—"}</Table.Td>
                  <Table.Td>
                    {injury.probabilityOfPlaying !== null
                      ? `${Math.round(injury.probabilityOfPlaying * 100)}%`
                      : "—"}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed" lineClamp={2}>
                      {injury.comment || "—"}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <PlayerDetailModal
        fpid={selectedFpid}
        onClose={() => setSelectedFpid(null)}
        week={week}
        scoring={scoring}
        season={thisSeason}
        draftSettingsId={draftSettingsId}
      />
    </Stack>
  );
}
