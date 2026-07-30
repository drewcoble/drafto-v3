import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import {
  Anchor,
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
import type { Id } from "../../../convex/_generated/dataModel";
import {
  POSITIONS,
  type DraftValueRow,
  type PlayerTag,
  type Position,
  type ScoringFormat,
  type ValueGap,
} from "../../types";
import {
  filterRelevantPlayers,
  pointsForScoring,
} from "../../lib/relevantPlayers";
import { POSITION_COLORS } from "../../lib/positionColors";
import { formatStatKey } from "../../lib/playerFormatting";
import { PlayerDetailModal } from "../../components/PlayerDetailModal";
import {
  computeConsistencyThresholds,
  getConsistencyLabel,
  type ConsistencyLabel,
} from "../../lib/consistency";
import { PlayerRow } from "./components/PlayerRow";

interface PlayersTableProps {
  week: string;
  selectedLeagueId: Id<"draftSettings"> | undefined;
}

export function PlayersTable({ week, selectedLeagueId }: PlayersTableProps) {
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([
    ...POSITIONS,
  ]);
  const [selectedFpid, setSelectedFpid] = useState<number | null>(null);

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
  // `season` is only set on leagues advanced through cloneDraftSettings, so
  // a league created directly (or no league selected at all) falls back to
  // the system clock's year - the same thing convex/fantasyPros/client.ts's
  // currentSeason() does server-side (fine here since this is frontend
  // code, not a Convex query).
  const thisSeason =
    selectedSettings?.season ?? String(new Date().getFullYear());
  const lastSeason = String(Number(thisSeason) - 1);
  const valueGaps = useQuery(api.valueGaps.getAllValueGaps, {
    week,
    scoring,
    lastSeason,
  });
  // Consistency rating (see src/lib/consistency.ts) - PPG/variance relative
  // to the rest of each position's cohort, so it doesn't need a league
  // selected (unlike the old replacement-rank cutoff, which did).
  const seasonStats = useQuery(api.playerPoints.getAllSeasonStats, {
    season: lastSeason,
    scoring,
  });
  const consistencyByFpid = useMemo(() => {
    const map = new Map<number, ConsistencyLabel>();
    if (!seasonStats) return map;
    const byPosition = new Map<Position, typeof seasonStats>();
    for (const row of seasonStats) {
      const list = byPosition.get(row.position) ?? [];
      list.push(row);
      byPosition.set(row.position, list);
    }
    for (const [, rows] of byPosition) {
      const thresholds = computeConsistencyThresholds(rows);
      for (const row of rows) {
        const label = getConsistencyLabel(row, thresholds);
        if (label) map.set(row.fpid, label);
      }
    }
    return map;
  }, [seasonStats]);
  // Same draftPlayerTags table the in-draft Players Left tab reads/writes
  // (see convex/draft/tags.ts) - marking a target/avoid here shows up there
  // too, and vice versa, since both key off draftSettingsId.
  const playerTags = useQuery(
    api.draft.tags.listPlayerTags,
    draftSettingsId ? { draftSettingsId } : "skip",
  );
  const cyclePlayerTag = useMutation(api.draft.tags.cyclePlayerTag);
  const tagByFpid = useMemo(() => {
    const map = new Map<number, PlayerTag>();
    for (const row of playerTags ?? []) map.set(row.fpid, row.tag);
    return map;
  }, [playerTags]);
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
  // True only for the very first fetch of $ values for a selected league -
  // sortedRows falls back to raw-points sort until draftValues exists, so
  // rendering the table during this window would show players in points
  // order and then jump them into $-value order once the fetch resolves.
  // Later scoring-format switches don't hit this (placeholderData keeps the
  // previous league's $ values in place while refetching), so the table
  // keeps updating in place instead of blanking out.
  //
  // Gating on draftSettingsId alone flashes the table: draftSettingsList
  // (and therefore draftSettingsId) starts undefined on mount, so the first
  // render slips through as "no league selected" and shows the table
  // points-sorted, then hides it again once draftSettingsId resolves and
  // draftValues is still loading. Waiting on draftSettingsList too closes
  // that gap - unless the selected league never resolves to a settings row
  // (e.g. it was deleted), in which case draftValues will never fire and we
  // fall through to the points-sorted table instead of spinning forever.
  const isInitialValuesLoad =
    selectedLeagueId !== undefined &&
    (draftSettingsList === undefined ||
      (draftSettingsId !== undefined && draftValues === undefined));

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

  const valueGapByFpid = useMemo(() => {
    const map = new Map<number, ValueGap>();
    for (const gap of valueGaps ?? []) map.set(gap.fpid, gap);
    return map;
  }, [valueGaps]);

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
          {isRecalculatingValues && !isInitialValuesLoad && (
            <Loader size="xs" />
          )}
          <Text size="sm" c="dimmed">
            Scoring: {scoring} (set on League Details)
          </Text>
        </Group>
      </Group>

      {allProjections === undefined || isInitialValuesLoad ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : visibleRows.length === 0 ? (
        <Text c="dimmed">
          No projections yet for the selected position(s) - fetch data first.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={900}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Rank</Table.Th>
                <Table.Th></Table.Th>
                <Table.Th></Table.Th>
                <Table.Th miw={220}>Player</Table.Th>
                <Table.Th miw={70}>Pos</Table.Th>
                {selectedSettings && <Table.Th>Consistency</Table.Th>}
                <Table.Th>Team</Table.Th>
                <Table.Th>FPTS</Table.Th>
                {draftValues && <Table.Th>$</Table.Th>}
                {statKeys.map((key) => (
                  <Table.Th key={key}>{formatStatKey(key)}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sortedRows.map((row, index) => (
                <PlayerRow
                  key={row._id}
                  row={row}
                  index={index}
                  scoring={scoring}
                  injury={injuriesByFpid.get(row.fpid)}
                  latestNews={latestNewsByFpid.get(row.fpid)}
                  draftValue={draftValueByFpid.get(row.fpid)}
                  valueGap={valueGapByFpid.get(row.fpid)}
                  showValueColumn={!!draftValues}
                  statKeys={statKeys}
                  tag={tagByFpid.get(row.fpid)}
                  onCycleTag={
                    draftSettingsId
                      ? () =>
                          cyclePlayerTag({ draftSettingsId, fpid: row.fpid })
                      : undefined
                  }
                  onSelectPlayer={setSelectedFpid}
                  consistency={
                    selectedSettings
                      ? consistencyByFpid.get(row.fpid)
                      : undefined
                  }
                  showConsistencyColumn={!!selectedSettings}
                />
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
