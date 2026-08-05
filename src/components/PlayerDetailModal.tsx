import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Accordion,
  ActionIcon,
  Badge,
  Center,
  Divider,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { Ban, Target } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ScoringFormat } from "../types";
import { POSITION_COLORS } from "../lib/positionColors";
import { formatStatKey, injuryColor } from "../lib/playerFormatting";
import { adpForScoring, pointsForScoring } from "../lib/relevantPlayers";
import { ValueGapIcon } from "../pages/Settings/components/ValueGapIcon";
import { PlayerSeasonGameLog } from "./PlayerSeasonGameLog";
import {
  computeConsistencyThresholds,
  consistencyColor,
  getConsistencyLabel,
} from "../lib/consistency";

interface PlayerDetailModalProps {
  // null = closed. Every call site owns one `useState<number | null>` and
  // renders a single shared modal instance rather than threading fetched
  // player data down through props - that's what lets this be wired into
  // nine different name-rendering components with the same three lines each.
  fpid: number | null;
  onClose: () => void;
  week: string;
  scoring: ScoringFormat;
  season: string;
  // Omit (or pass undefined) from read-only/historical contexts - e.g.
  // Settings' SeasonSummary passes undefined even though it has a
  // seasonId in scope, since writing a target/avoid tag to a finished
  // draft has no effect anywhere that tag is read.
  seasonId: Id<"seasons"> | undefined;
}

export function PlayerDetailModal({
  fpid,
  onClose,
  week,
  scoring,
  season,
  seasonId,
}: PlayerDetailModalProps) {
  const detail = useQuery(
    api.draft.playerDetail.getPlayerDetail,
    fpid !== null
      ? { fpid, week, ...(seasonId ? { seasonId } : {}) }
      : "skip",
  );
  const news = useQuery(
    api.news.getNewsForFpids,
    fpid !== null ? { fpids: [fpid] } : "skip",
  );
  // Pool-relative computations - deliberately reused as-is rather than
  // folded into getPlayerDetail (see convex/draft/playerDetail.ts). Convex
  // dedupes identical query+args subscriptions, so opening this from a page
  // already subscribed to the same values (e.g. the Players tab) is free.
  const valueGaps = useQuery(api.valueGaps.getAllValueGaps, {
    week,
    scoring,
    lastSeason: String(Number(season) - 1),
  });
  const draftValues = useQuery(
    api.draftValues.getDraftValues,
    seasonId && detail?.player
      ? { seasonId, week, scoring, position: detail.player.position }
      : "skip",
  );
  const cyclePlayerTag = useMutation(api.draft.tags.cyclePlayerTag);

  // The 5 most recently *completed* seasons relative to `season` (the
  // upcoming/current draft season, already shown above as the live
  // projection - deliberately excluded here). One cheap batched call gets
  // every season's summary up front; the full week-by-week log for any one
  // of them is only fetched once its accordion panel is opened (see
  // PlayerSeasonGameLog).
  const recentSeasons = useMemo(
    () =>
      [1, 2, 3, 4, 5].map((n) => String(Number(season) - n)),
    [season],
  );
  const [openSeasons, setOpenSeasons] = useState<string[]>([]);
  const seasonHistory = useQuery(
    api.playerPoints.getPlayerSeasonStatsHistory,
    fpid !== null
      ? { fpid, scoring, seasons: recentSeasons }
      : "skip",
  );
  const seasonStatsBySeason = useMemo(() => {
    const map = new Map<
      string,
      { totalPoints: number; gamesPlayed: number; stdDeviation: number }
    >();
    for (const row of seasonHistory ?? []) map.set(row.season, row);
    return map;
  }, [seasonHistory]);

  // Consistency rating (see src/lib/consistency.ts) - based on last
  // season's PPG/variance against the rest of the player's position, so it
  // just needs the player's position (from `detail`), not a league selected.
  const lastSeason = recentSeasons[0]!;
  const positionSeasonStats = useQuery(
    api.playerPoints.getAllSeasonStats,
    detail?.player
      ? {
          season: lastSeason,
          scoring,
          position: detail.player.position,
        }
      : "skip",
  );
  const consistency = useMemo(() => {
    if (!detail?.player) return null;
    const thresholds = computeConsistencyThresholds(positionSeasonStats ?? []);
    const playerLastSeason = seasonStatsBySeason.get(lastSeason);
    if (!playerLastSeason) return null;
    return getConsistencyLabel(playerLastSeason, thresholds);
  }, [detail?.player, positionSeasonStats, seasonStatsBySeason, lastSeason]);

  const valueGap = useMemo(
    () => valueGaps?.find((gap) => gap.fpid === fpid),
    [valueGaps, fpid],
  );
  const draftValue = useMemo(
    () => draftValues?.find((row) => row.fpid === fpid),
    [draftValues, fpid],
  );
  const recentNews = useMemo(
    () =>
      [...(news ?? [])]
        .sort((a, b) => b.publishedAt - a.publishedAt)
        .slice(0, 5),
    [news],
  );
  const statsEntries = useMemo(
    () =>
      detail?.projection
        ? Object.entries(detail.projection.stats).filter(
            ([, value]) => value > 0,
          )
        : [],
    [detail],
  );

  return (
    <Modal
      opened={fpid !== null}
      onClose={onClose}
      title={detail?.player?.name ?? "Player"}
      size="lg"
    >
      {fpid === null ? null : detail === undefined ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : detail === null ? (
        <Text c="dimmed">Player not found.</Text>
      ) : (
        <Stack gap="md">
          <Group gap="xs">
            <Badge
              color={POSITION_COLORS[detail.player.position]}
              variant="light"
            >
              {detail.player.position}
            </Badge>
            <Text c="dimmed">{detail.player.team ?? "Free agent"}</Text>
            {detail.injury && (
              <Badge color={injuryColor(detail.injury.status)} variant="light">
                {detail.injury.statusShort}
              </Badge>
            )}
            {consistency && (
              <Badge color={consistencyColor(consistency)} variant="light">
                {consistency}
              </Badge>
            )}
            <Tooltip
              label={
                !seasonId
                  ? "Select a league to mark targets/avoids"
                  : detail.tag === "target"
                    ? "Target - click to mark avoid"
                    : detail.tag === "avoid"
                      ? "Avoid - click to clear"
                      : "Click to mark as target"
              }
            >
              <ActionIcon
                variant={detail.tag ? "light" : "subtle"}
                size={40}
                color={
                  detail.tag === "target"
                    ? "green"
                    : detail.tag === "avoid"
                      ? "red"
                      : "gray"
                }
                disabled={!seasonId}
                onClick={() =>
                  seasonId &&
                  cyclePlayerTag({ seasonId, fpid })
                }
                aria-label="Cycle target/avoid"
              >
                {detail.tag === "avoid" ? (
                  <Ban size={16} />
                ) : (
                  <Target size={16} />
                )}
              </ActionIcon>
            </Tooltip>
          </Group>

          <Group gap="lg" wrap="wrap">
            {detail.projection && (
              <Text size="sm">
                <Text span fw={600}>
                  {pointsForScoring(detail.projection, scoring).toFixed(1)}
                </Text>{" "}
                proj pts
              </Text>
            )}
            {detail.ranking && (
              <Text size="sm">
                ADP {adpForScoring(detail.ranking, scoring).toFixed(1)}
              </Text>
            )}
            {draftValue && (
              <Text size="sm">
                {draftValue.usedFallback ? (
                  <Text span fs="italic" c="dimmed">
                    ~${Math.round(draftValue.dollarValue)}
                  </Text>
                ) : (
                  <>${Math.round(draftValue.dollarValue)}</>
                )}
              </Text>
            )}
            {valueGap && (
              <ValueGapIcon valueGap={valueGap} position={detail.player.position} />
            )}
          </Group>

          {detail.pick && (
            <Group gap="xs">
              <Text size="sm">Drafted for ${detail.pick.price}</Text>
              {detail.pick.isKeeper && (
                <Badge variant="light" color="gray" size="sm">
                  Keeper · Yr {detail.pick.keeperStreak ?? 1}
                </Badge>
              )}
            </Group>
          )}

          {statsEntries.length > 0 && (
            <Table.ScrollContainer minWidth={280}>
              <Table>
                <Table.Tbody>
                  {statsEntries.map(([key, value]) => (
                    <Table.Tr key={key}>
                      <Table.Td>{formatStatKey(key)}</Table.Td>
                      <Table.Td>{value}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}

          <Stack gap={6}>
            <Divider label="Game Log" labelPosition="left" />
            <Accordion multiple value={openSeasons} onChange={setOpenSeasons}>
              {recentSeasons.map((seasonYear) => {
                const summary = seasonStatsBySeason.get(seasonYear);
                return (
                  <Accordion.Item key={seasonYear} value={seasonYear}>
                    <Accordion.Control>
                      <Group justify="space-between" wrap="wrap" pr="sm">
                        <Text size="sm">{seasonYear}</Text>
                        <Text size="sm" c="dimmed">
                          {summary
                            ? `${summary.totalPoints.toFixed(1)} pts · ${
                                summary.gamesPlayed
                              } gm · ${(
                                summary.totalPoints /
                                Math.max(summary.gamesPlayed, 1)
                              ).toFixed(1)} ppg`
                            : "No data"}
                        </Text>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <PlayerSeasonGameLog
                        fpid={fpid}
                        season={seasonYear}
                        scoring={scoring}
                        isOpen={openSeasons.includes(seasonYear)}
                      />
                    </Accordion.Panel>
                  </Accordion.Item>
                );
              })}
            </Accordion>
          </Stack>

          {recentNews.length > 0 && (
            <Stack gap={6}>
              <Divider label="Recent news" labelPosition="left" />
              {recentNews.map((item) => (
                <Stack key={item._id} gap={0}>
                  <Text size="sm" fw={500}>
                    {item.title}
                  </Text>
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {item.description}
                  </Text>
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>
      )}
    </Modal>
  );
}
