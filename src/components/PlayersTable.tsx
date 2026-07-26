import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
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
  Tooltip,
} from "@mantine/core";
import { StickyNote } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  POSITIONS,
  type DraftValueRow,
  type Position,
  type ScoringFormat,
} from "../types";
import { filterRelevantPlayers, pointsForScoring } from "../lib/relevantPlayers";

interface PlayersTableProps {
  week: string;
  selectedLeagueId: Id<"draftSettings"> | undefined;
}

function injuryColor(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("IR") || s.includes("OUT")) return "red";
  if (s.includes("DOUBTFUL")) return "orange";
  if (s.includes("QUESTIONABLE")) return "yellow";
  return "gray";
}

const POSITION_COLORS: Record<Position, string> = {
  QB: "blue",
  RB: "green",
  WR: "orange",
  TE: "grape",
  DST: "saddlebrown",
  K: "gray",
};

// Raw Sleeper stat keys (e.g. "rec_yd", "pts_allow_0") aren't readable as
// column headers - map the ones we've seen in real responses to plain
// labels, and fall back to title-casing anything unmapped (e.g. bonus/return
// fields) so a header never renders as a raw snake_case key.
const STAT_LABELS: Record<string, string> = {
  rec: "Receptions",
  rec_yd: "Rec Yds",
  rec_td: "Rec TDs",
  rec_fd: "Rec First Downs",
  rec_tgt: "Targets",
  rec_2pt: "Rec 2-PT",
  rec_0_4: "Receptions (0-4 Yds)",
  rec_5_9: "Receptions (5-9 Yds)",
  rec_10_19: "Receptions (10-19 Yds)",
  rec_20_29: "Receptions (20-29 Yds)",
  rec_30_39: "Receptions (30-39 Yds)",
  rec_40p: "Receptions (40+ Yds)",
  rush_att: "Rush Att",
  rush_yd: "Rush Yds",
  rush_td: "Rush TDs",
  rush_fd: "Rush First Downs",
  rush_2pt: "Rush 2-PT",
  pass_att: "Pass Att",
  pass_cmp: "Completions",
  pass_yd: "Pass Yds",
  pass_td: "Pass TDs",
  pass_int: "Interceptions",
  pass_fd: "Pass First Downs",
  pass_2pt: "Pass 2-PT",
  fum: "Fumbles",
  fum_lost: "Fumbles Lost",
  gp: "Games Played",
  sack: "Sacks",
  int: "Interceptions",
  fum_rec: "Fumble Recoveries",
  blk_kick: "Blocked Kicks",
  def_fum_td: "Defensive Fumble TDs",
  def_kr_td: "Kick Return TDs",
  pts_allow_0: "Pts Allowed (0)",
  pts_allow_1_6: "Pts Allowed (1-6)",
  pts_allow_7_13: "Pts Allowed (7-13)",
  pts_allow_14_20: "Pts Allowed (14-20)",
  pts_allow_21_27: "Pts Allowed (21-27)",
  pts_allow_28_34: "Pts Allowed (28-34)",
  pts_allow_35p: "Pts Allowed (35+)",
  yds_allow_0_100: "Yds Allowed (0-100)",
  fgm_40_49: "FG Made (40-49)",
  fgm_50p: "FG Made (50+)",
  fgm_yds: "FG Yards",
  fgmiss_40_49: "FG Missed (40-49)",
  fgmiss_50p: "FG Missed (50+)",
  xpm: "XP Made",
  xpmiss: "XP Missed",
};

function formatStatKey(key: string): string {
  return (
    STAT_LABELS[key] ??
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function PlayersTable({ week, selectedLeagueId }: PlayersTableProps) {
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([
    ...POSITIONS,
  ]);

  const allProjections = useQuery(api.projections.getAllProjections, {
    week,
  });
  const allRankings = useQuery(api.rankings.getAllRankings, { week });
  const injuries = useQuery(api.injuries.getInjuries, {});
  const draftSettingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const selectedSettings = draftSettingsList?.find(
    (league) => league._id === selectedLeagueId,
  );
  const draftSettingsId = selectedSettings?._id;
  // Scoring format now lives on the league settings (edited on the League
  // Details tab) instead of local component state, so it's shared/persisted
  // rather than resetting per-tab-visit.
  const scoring: ScoringFormat = selectedSettings?.scoring ?? "PPR";
  // A position only matters to the selected league if it fills a dedicated
  // roster slot or is FLEX/SUPERFLEX-eligible - e.g. a 0-K league shouldn't
  // show a K pill or any kickers. Fall back to every position while the
  // league's settings are still loading so nothing flashes empty.
  const activePositions = useMemo(() => {
    if (!selectedSettings) return [...POSITIONS];
    return POSITIONS.filter(
      (pos) =>
        selectedSettings.rosterSlots[pos] > 0 ||
        selectedSettings.flexPositions.includes(pos) ||
        selectedSettings.superflexPositions.includes(pos),
    );
  }, [selectedSettings]);
  // TanStack Query (via convexQuery) instead of plain Convex useQuery here:
  // switching scoring format changes this query's args, and
  // placeholderData keeps showing the previous result (with isFetching
  // flagging a background recalc) instead of the $ column/sort disappearing
  // and reappearing on every scoring click.
  //
  // Use Convex's own "skip" convention rather than TanStack's `enabled`
  // option to conditionally disable this query - convexQuery's `enabled`
  // support is currently broken (the query fires even when disabled; see
  // https://github.com/get-convex/convex-react-query/issues/5), but "skip"
  // is handled correctly.
  const draftValuesQueryOptions = convexQuery(
    api.draftValues.getDraftValues,
    draftSettingsId ? { draftSettingsId, week, scoring } : "skip",
  );
  const { data: draftValues, isFetching: isRecalculatingValues } =
    useTanStackQuery<DraftValueRow[]>({
      ...draftValuesQueryOptions,
      placeholderData: (previousData: DraftValueRow[] | undefined) =>
        previousData,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

  const fpids = useMemo(
    () => (allProjections ?? []).map((row) => row.fpid),
    [allProjections],
  );
  const news = useQuery(
    api.news.getNewsForFpids,
    allProjections ? { fpids } : "skip",
  );

  const injuriesByFpid = useMemo(() => {
    const map = new Map<number, { status: string; statusShort: string }>();
    for (const injury of injuries ?? []) {
      map.set(injury.fpid, injury);
    }
    return map;
  }, [injuries]);

  const latestNewsByFpid = useMemo(() => {
    const map = new Map<number, { title: string; publishedAt: number }>();
    for (const item of news ?? []) {
      const existing = map.get(item.fpid);
      if (!existing || item.publishedAt > existing.publishedAt) {
        map.set(item.fpid, item);
      }
    }
    return map;
  }, [news]);

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

  const draftValueByFpid = useMemo(() => {
    const map = new Map<
      number,
      { dollarValue: number; usedFallback: boolean }
    >();
    for (const value of draftValues ?? []) {
      map.set(value.fpid, value);
    }
    return map;
  }, [draftValues]);

  const relevantProjections = useMemo(() => {
    if (!allProjections) return [];
    return filterRelevantPlayers(
      allProjections,
      activePositions,
      scoring,
      adpByFpid,
      (row) => pointsForScoring(row, scoring),
    );
  }, [allProjections, adpByFpid, scoring, activePositions]);

  // Only the positions currently toggled on via the pills.
  const visibleRows = useMemo(() => {
    return relevantProjections.filter((row) =>
      selectedPositions.includes(row.position),
    );
  }, [relevantProjections, selectedPositions]);

  // Global ranking across every visible position, by $ Value when available
  // (an auction draft board compares players across positions directly),
  // falling back to raw points if no draft settings are configured yet.
  const sortedRows = useMemo(() => {
    const rows = [...visibleRows];
    if (draftValues) {
      rows.sort(
        (a, b) =>
          (draftValueByFpid.get(b.fpid)?.dollarValue ?? 0) -
          (draftValueByFpid.get(a.fpid)?.dollarValue ?? 0),
      );
    } else {
      rows.sort(
        (a, b) => pointsForScoring(b, scoring) - pointsForScoring(a, scoring),
      );
    }
    return rows;
  }, [visibleRows, draftValues, draftValueByFpid, scoring]);

  // Stat columns depend on whichever positions are currently visible - e.g.
  // toggling to just DST shows points-allowed tiers, toggling to just QB
  // shows passing stats - and only keep a column if at least one *visible*
  // player has a nonzero value for it.
  const statKeys = useMemo(() => {
    if (visibleRows.length === 0) return [];
    const keys = new Set<string>();
    for (const row of visibleRows) {
      for (const key of Object.keys(row.stats)) {
        keys.add(key);
      }
    }
    return Array.from(keys).filter((key) =>
      visibleRows.some((row) => (row.stats[key] ?? 0) > 0),
    );
  }, [visibleRows]);

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
        {allProjections && (
          <Text size="xs" c="dimmed">
            Showing {relevantProjections.length} draft-relevant players (of{" "}
            {allProjections.length} total fetched)
          </Text>
        )}
        <Group gap="xs">
          {isRecalculatingValues && <Loader size="xs" />}
          <Text size="sm" c="dimmed">
            Scoring: {scoring} (set on League Details)
          </Text>
        </Group>
      </Group>

      {allProjections === undefined ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : visibleRows.length === 0 ? (
        <Text c="dimmed">
          No projections yet for the selected position(s) - fetch data first.
        </Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Rank</Table.Th>
              <Table.Th miw={150}>Player</Table.Th>
              <Table.Th miw={100}></Table.Th>
              <Table.Th miw={70}>Pos</Table.Th>
              <Table.Th>Team</Table.Th>
              <Table.Th>FPTS</Table.Th>
              {draftValues && <Table.Th>$</Table.Th>}
              {statKeys.map((key) => (
                <Table.Th key={key}>{formatStatKey(key)}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sortedRows.map((row, index) => {
              const injury = injuriesByFpid.get(row.fpid);
              const latestNews = latestNewsByFpid.get(row.fpid);
              const draftValue = draftValueByFpid.get(row.fpid);
              return (
                <Table.Tr key={row._id}>
                  <Table.Td>{index + 1}</Table.Td>
                  <Table.Td miw={150}>{row.name}</Table.Td>
                  <Table.Td miw={100}>
                    <Group gap={6} wrap="nowrap">
                      {injury && (
                        <Badge
                          color={injuryColor(injury.status)}
                          size="sm"
                          variant="light"
                        >
                          {injury.statusShort}
                        </Badge>
                      )}
                      {latestNews && (
                        <Tooltip
                          label={latestNews.title}
                          multiline
                          w={260}
                          withArrow
                        >
                          <StickyNote
                            size={14}
                            strokeWidth={2}
                            aria-label="Recent news"
                          />
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td miw={70}>
                    <Badge color={POSITION_COLORS[row.position]} variant="light">
                      {row.position}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{row.team ?? "—"}</Table.Td>
                  <Table.Td>
                    {pointsForScoring(row, scoring).toFixed(1)}
                  </Table.Td>
                  {draftValues && (
                    <Table.Td>
                      {draftValue ? (
                        draftValue.usedFallback ? (
                          <Tooltip
                            label="Approximate: this position's replacement-level player isn't in our data yet, so this uses a fallback estimate"
                            multiline
                            w={260}
                            withArrow
                          >
                            <Text span fs="italic" c="dimmed">
                              ${Math.round(draftValue.dollarValue)}
                            </Text>
                          </Tooltip>
                        ) : (
                          `$${Math.round(draftValue.dollarValue)}`
                        )
                      ) : (
                        "—"
                      )}
                    </Table.Td>
                  )}
                  {statKeys.map((key) => (
                    <Table.Td key={key}>{row.stats[key] ?? "—"}</Table.Td>
                  ))}
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
