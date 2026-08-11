import { Fragment, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Card,
  Center,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { ChevronDown, ChevronUp } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { POSITIONS, type Position, type ScoringConfig } from "../../types";
import { POSITION_COLORS } from "../../lib/positionColors";
import { injuryColor } from "../../lib/playerFormatting";
import {
  filterRelevantPlayers,
  pointsForScoringConfig,
  scoringConfigFromSeason,
} from "../../lib/relevantPlayers";
import { PlayerDetailModal } from "../../components/PlayerDetailModal";
import { PositionFilterBar } from "../../components/PositionFilterBar";
import { POSITION_FILTER_BAR_HEIGHT } from "../../constants/general";

interface InjuryReportProps {
  week: string;
  seasonId: Id<"seasons"> | undefined;
  // Mobile fixed offset for PositionFilterBar - this page is mounted from
  // both the Setup app (nothing else docked under the header) and the Draft
  // Room (DraftTopBar's MobileStatsRow already docked there), so each route
  // passes its own correct value rather than this component guessing.
  filterBarTop: number;
}

export function InjuryReport({
  week,
  seasonId,
  filterBarTop,
}: InjuryReportProps) {
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([
    ...POSITIONS,
  ]);
  const [selectedFpid, setSelectedFpid] = useState<number | null>(null);
  // Which rows' Type/Prob. of Playing/Comment detail is showing - dropped
  // from the main row (see the table below) to fit mobile widths,
  // click-to-expand instead of a fixed column each.
  const [expandedIds, setExpandedIds] = useState<Set<Id<"injuries">>>(
    new Set(),
  );
  const toggleExpanded = (id: Id<"injuries">) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const injuries = useQuery(api.injuries.getInjuries, {});
  const allProjections = useQuery(api.projections.getAllProjections, {
    week,
  });
  const allRankings = useQuery(api.rankings.getAllRankings, { week });
  const draftSettingsList = useQuery(api.leagues.listSeasons, {});
  const settings = seasonId
    ? draftSettingsList?.find((league) => league._id === seasonId)
    : undefined;
  const scoring = settings?.scoring ?? "PPR";
  const scoringConfig: ScoringConfig = useMemo(
    () =>
      settings
        ? scoringConfigFromSeason(settings)
        : { scoring, teScoring: "NONE", sixPointPassTds: false },
    [settings, scoring],
  );
  const thisSeason = settings?.year ?? String(new Date().getFullYear());

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
      (row) => pointsForScoringConfig(row, scoringConfig),
    );
  }, [allProjections, activePositions, scoring, scoringConfig, adpByFpid]);

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
          row.player !== undefined &&
          selectedPositions.includes(row.player.position),
      )
      .sort(
        (a, b) =>
          pointsForScoringConfig(b.player, scoringConfig) -
          pointsForScoringConfig(a.player, scoringConfig),
      );
  }, [injuries, projByFpid, selectedPositions, scoringConfig]);

  const isLoading =
    injuries === undefined ||
    allProjections === undefined ||
    allRankings === undefined;

  return (
    <Stack gap="md" py="sm" pt={{ base: POSITION_FILTER_BAR_HEIGHT, sm: "sm" }}>
      <Group justify="space-between" align="center" wrap="wrap">
        <PositionFilterBar
          positions={activePositions}
          selected={selectedPositions}
          onChange={setSelectedPositions}
          top={filterBarTop}
        />
        {!isLoading && (
          <Text size="xs" c="dimmed">
            {rows.length} currently injured
          </Text>
        )}
      </Group>

      <Card withBorder padding={0}>
        {isLoading ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : rows.length === 0 ? (
          <Text c="dimmed" p="md">
            No currently-injured players for the selected position(s).
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={360}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th miw={140}>Player</Table.Th>
                  <Table.Th miw={60}>Pos</Table.Th>
                  <Table.Th>Team</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map(({ injury, player }) => {
                  const isExpanded = expandedIds.has(injury._id);
                  return (
                    <Fragment key={injury._id}>
                      {/* Type/Prob. of Playing/Comment moved into an
                        expandable detail row below instead of 3 more
                        columns - those pushed this table well past mobile
                        widths for info that's secondary to who's hurt and
                        how badly. */}
                      <Table.Tr
                        onClick={() => toggleExpanded(injury._id)}
                        style={{ cursor: "pointer" }}
                      >
                        <Table.Td>
                          <Anchor
                            component="button"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedFpid(injury.fpid);
                            }}
                          >
                            {player.name}
                          </Anchor>
                        </Table.Td>
                        <Table.Td>
                          <Badge
                            color={POSITION_COLORS[player.position]}
                            variant="light"
                          >
                            {player.position}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{player.team ?? "—"}</Table.Td>
                        <Table.Td>
                          {/* Abbreviated (statusShort - "Q"/"O"/"D"/etc,
                              already computed server-side, see
                              convex/sleeper/projections.ts's
                              INJURY_STATUS_SHORT) rather than the full word,
                              to keep this compact/mobile-condensed column
                              narrow - injuryColor still keys off the full
                              `status` string, whose substring matching
                              ("QUESTIONABLE", "OUT", etc.) wouldn't
                              recognize the abbreviation. The full word is
                              in the expanded row below (a hover-only
                              tooltip wouldn't help touch/mobile users, the
                              actual audience this table's condensed for). */}
                          <Badge
                            color={injuryColor(injury.status)}
                            variant="light"
                          >
                            {injury.statusShort}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label={
                              isExpanded ? "Hide details" : "Show details"
                            }
                          >
                            {isExpanded ? (
                              <ChevronUp size={16} />
                            ) : (
                              <ChevronDown size={16} />
                            )}
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                      {isExpanded && (
                        <Table.Tr>
                          <Table.Td colSpan={5}>
                            <SimpleGrid cols={2} spacing="md" py={4}>
                              <Stack gap={4}>
                                <Group gap={6}>
                                  <Text size="xs" fw={600} c="dimmed">
                                    Status:
                                  </Text>
                                  <Text size="xs">{injury.status}</Text>
                                </Group>
                                <Group gap={6}>
                                  <Text size="xs" fw={600} c="dimmed">
                                    Type:
                                  </Text>
                                  <Text size="xs">
                                    {injury.injuryType || "—"}
                                  </Text>
                                </Group>
                              </Stack>
                              <Stack gap={4}>
                                <Group gap={6}>
                                  <Text size="xs" fw={600} c="dimmed">
                                    Prob. of playing:
                                  </Text>
                                  <Text size="xs">
                                    {injury.probabilityOfPlaying !== null
                                      ? `${Math.round(injury.probabilityOfPlaying * 100)}%`
                                      : "—"}
                                  </Text>
                                </Group>
                                <Group gap={6} wrap="nowrap">
                                  <Text
                                    size="xs"
                                    fw={600}
                                    c="dimmed"
                                    style={{ flexShrink: 0 }}
                                  >
                                    Comment:
                                  </Text>
                                  <Text
                                    size="xs"
                                    c="dimmed"
                                    truncate
                                    style={{ flex: 1, minWidth: 0 }}
                                  >
                                    {injury.comment || "—"}
                                  </Text>
                                </Group>
                              </Stack>
                            </SimpleGrid>
                          </Table.Td>
                        </Table.Tr>
                      )}
                    </Fragment>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <PlayerDetailModal
        fpid={selectedFpid}
        onClose={() => setSelectedFpid(null)}
        week={week}
        scoringConfig={scoringConfig}
        season={thisSeason}
        seasonId={seasonId}
      />
    </Stack>
  );
}
