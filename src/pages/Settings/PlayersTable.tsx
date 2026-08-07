import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { Card, Center, Group, Loader, Stack, Table, Text } from "@mantine/core";
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
import { formatStatKey } from "../../lib/playerFormatting";
import { PlayerDetailModal } from "../../components/PlayerDetailModal";
import { PositionFilterBar } from "../../components/PositionFilterBar";
import {
  MOBILE_HEADER_HEIGHT,
  POSITION_FILTER_BAR_HEIGHT,
} from "../../constants/general";
import {
  computeConsistencyThresholds,
  getConsistencyLabel,
  type ConsistencyLabel,
} from "../../lib/consistency";
import {
  computeKeeperCost,
  formulaForFpid,
  prospectiveKeeperStreak,
} from "../../lib/keeperCost";
import { PlayerRow, type KeeperInfo } from "./components/PlayerRow";

interface PlayersTableProps {
  week: string;
  selectedLeagueId: Id<"seasons"> | undefined;
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
  const draftSettingsList = useQuery(api.leagues.listSeasons, {});
  const selectedSettings = draftSettingsList?.find(
    (league) => league._id === selectedLeagueId,
  );
  const seasonId = selectedSettings?._id;
  // Scoring format now lives on the league settings (edited on the League
  // Details tab) instead of local component state, so it's shared/persisted
  // rather than resetting per-tab-visit.
  const scoring: ScoringFormat = selectedSettings?.scoring ?? "PPR";
  const thisSeason =
    selectedSettings?.year ?? String(new Date().getFullYear());
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
  // too, and vice versa, since both key off seasonId.
  const playerTags = useQuery(
    api.draft.tags.listPlayerTags,
    seasonId ? { seasonId } : "skip",
  );
  const cyclePlayerTag = useMutation(api.draft.tags.cyclePlayerTag);
  const tagByFpid = useMemo(() => {
    const map = new Map<number, PlayerTag>();
    for (const row of playerTags ?? []) map.set(row.fpid, row.tag);
    return map;
  }, [playerTags]);

  // Keeper column (Phase II) - suggested cost/eligibility from the
  // configured keeper rules (see src/lib/keeperCost.ts), evaluated against
  // the self team specifically, same as KeepersTab's team-scoped actions
  // already default to self.
  const priceHistory = useQuery(
    api.draft.history.getPlayerPriceHistory,
    seasonId ? { seasonId } : "skip",
  );
  const draftTeams = useQuery(
    api.draft.teams.listSeasonTeams,
    seasonId ? { seasonId } : "skip",
  );
  const selfTeamId = useMemo(
    () => draftTeams?.find((team) => team.isSelf)?._id,
    [draftTeams],
  );
  const picks = useQuery(
    api.draft.picks.listDraftPicks,
    seasonId ? { seasonId } : "skip",
  );
  const selfKeptFpids = useMemo(() => {
    const set = new Set<number>();
    for (const pick of picks ?? []) {
      if (pick.isKeeper && pick.teamId === selfTeamId) set.add(pick.fpid);
    }
    return set;
  }, [picks, selfTeamId]);
  const selfKeeperCount = selfKeptFpids.size;

  const keeperInfoByFpid = useMemo(() => {
    const map = new Map<number, KeeperInfo>();
    const keeperRules = selectedSettings?.keeperRules;
    if (!keeperRules || !priceHistory) return map;
    for (const fpid of Object.keys(priceHistory).map(Number)) {
      const entry = priceHistory[fpid];
      const timesKept =
        entry?.fromImmediateParent && entry.isKeeper
          ? (entry.keeperStreak ?? 1)
          : 0;
      const alreadyKept = selfKeptFpids.has(fpid);
      const prospectiveStreak = prospectiveKeeperStreak(entry);
      const blockedByTeamCap =
        keeperRules.maxKeepersPerTeam !== undefined &&
        selfKeeperCount >= keeperRules.maxKeepersPerTeam &&
        !alreadyKept;
      const blockedByStreak =
        keeperRules.maxConsecutiveYears !== undefined &&
        prospectiveStreak > keeperRules.maxConsecutiveYears;
      const value =
        blockedByTeamCap || blockedByStreak
          ? null
          : computeKeeperCost(
              formulaForFpid(keeperRules, fpid),
              entry?.price,
            );
      map.set(fpid, { timesKept, value });
    }
    return map;
  }, [selectedSettings, priceHistory, selfKeptFpids, selfKeeperCount]);
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
    seasonId ? { seasonId, week, scoring } : "skip",
  );
  interface DraftValuesResult {
    isGeneric: boolean;
    values: DraftValueRow[];
  }
  const { data: draftValuesResult, isFetching: isRecalculatingValues } =
    useTanStackQuery<DraftValuesResult>({
      ...draftValuesQueryOptions,
      placeholderData: (previousData: DraftValuesResult | undefined) =>
        previousData,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  const draftValues = draftValuesResult?.values;
  // True only for the very first fetch of $ values for a selected league -
  // sortedRows falls back to raw-points sort until draftValues exists, so
  // rendering the table during this window would show players in points
  // order and then jump them into $-value order once the fetch resolves.
  // Later scoring-format switches don't hit this (placeholderData keeps the
  // previous league's $ values in place while refetching), so the table
  // keeps updating in place instead of blanking out.
  //
  // Gating on seasonId alone flashes the table: draftSettingsList
  // (and therefore seasonId) starts undefined on mount, so the first
  // render slips through as "no league selected" and shows the table
  // points-sorted, then hides it again once seasonId resolves and
  // draftValues is still loading. Waiting on draftSettingsList too closes
  // that gap - unless the selected league never resolves to a settings row
  // (e.g. it was deleted), in which case draftValues will never fire and we
  // fall through to the points-sorted table instead of spinning forever.
  const isInitialValuesLoad =
    selectedLeagueId !== undefined &&
    (draftSettingsList === undefined ||
      (seasonId !== undefined && draftValues === undefined));

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
  // toggling to just QB shows passing stats - and only keep a column if at
  // least one *visible* player has a nonzero value for it. DST and K each
  // bring in a wide, unrelated set of columns (points-allowed tiers, FG
  // distance buckets, ...) that swamp the table when mixed in with the
  // skill positions, so their stats only surface when that's the only
  // position toggled on.
  const isOnlyDST = selectedPositions.length === 1 && selectedPositions[0] === "DST";
  const isOnlyK = selectedPositions.length === 1 && selectedPositions[0] === "K";
  const statKeys = useMemo(() => {
    const rowsForStats = visibleRows.filter((row) => {
      if (row.position === "DST" && !isOnlyDST) return false;
      if (row.position === "K" && !isOnlyK) return false;
      return true;
    });
    if (rowsForStats.length === 0) return [];
    const keys = new Set<string>();
    for (const row of rowsForStats) {
      for (const key of Object.keys(row.stats)) {
        keys.add(key);
      }
    }
    return Array.from(keys).filter((key) =>
      rowsForStats.some((row) => (row.stats[key] ?? 0) > 0),
    );
  }, [visibleRows, isOnlyDST, isOnlyK]);

  return (
    <Stack
      gap="md"
      py="sm"
      pt={{ base: POSITION_FILTER_BAR_HEIGHT, sm: "sm" }}
    >
      <Group justify="space-between" align="center" wrap="wrap">
        <PositionFilterBar
          positions={activePositions}
          selected={selectedPositions}
          onChange={setSelectedPositions}
          top={MOBILE_HEADER_HEIGHT}
        />
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

      <Card withBorder padding={0}>
      {allProjections === undefined || isInitialValuesLoad ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : visibleRows.length === 0 ? (
        <Text c="dimmed" p="md">
          No projections yet for the selected position(s) - fetch data first.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={900}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Rank</Table.Th>
                {/* Action (target/avoid toggle) then flags (value-gap/
                    consistency) - unlabeled columns right next to Player,
                    same placement every icon-flag table in the app uses. */}
                <Table.Th></Table.Th>
                <Table.Th></Table.Th>
                <Table.Th miw={220}>Player</Table.Th>
                <Table.Th miw={70}>Pos</Table.Th>
                <Table.Th>Team</Table.Th>
                <Table.Th>FPTS</Table.Th>
                {draftValues && (
                  <Table.Th>{draftValuesResult?.isGeneric ? "$ (est.)" : "$"}</Table.Th>
                )}
                {selectedSettings && <Table.Th>Keeper</Table.Th>}
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
                    seasonId
                      ? () =>
                          cyclePlayerTag({ seasonId, fpid: row.fpid })
                      : undefined
                  }
                  onSelectPlayer={setSelectedFpid}
                  consistency={
                    selectedSettings
                      ? consistencyByFpid.get(row.fpid)
                      : undefined
                  }
                  showConsistencyColumn={!!selectedSettings}
                  keeperInfo={
                    selectedSettings
                      ? keeperInfoByFpid.get(row.fpid)
                      : undefined
                  }
                  showKeeperColumn={!!selectedSettings}
                />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      </Card>

      <PlayerDetailModal
        fpid={selectedFpid}
        onClose={() => setSelectedFpid(null)}
        week={week}
        scoring={scoring}
        season={thisSeason}
        seasonId={seasonId}
      />
    </Stack>
  );
}
