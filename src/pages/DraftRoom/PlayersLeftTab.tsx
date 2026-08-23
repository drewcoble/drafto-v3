import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Badge,
  Box,
  Group,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { LayoutGrid, LayoutList, Search } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  POSITIONS,
  type DraftBoardRow,
  type DraftTierRow,
  type PlayerTag,
  type Position,
  type ValueGap,
} from "../../types";
import { expandRosterSlots } from "../../lib/rosterSlots";
import { useTeamBudget } from "../../hooks/useTeamBudget";
import { usePlanSlots } from "../../hooks/usePlanSlots";
import { useRookieFpids } from "../../hooks/useRookieFpids";
import {
  isNearAnyOpenSlot,
  matchPlanSlot,
  type PlanSlotMatch,
} from "../../lib/planRecommendation";
import {
  filterRelevantPlayers,
  scoringConfigFromSeason,
} from "../../lib/relevantPlayers";
import { recommendationFor, groupByTier } from "../../lib/draftRecommendation";
import { POSITION_COLORS } from "../../lib/positionColors";
import { buildStandardValueByFpid } from "../../lib/standardValues";
import {
  MOBILE_HEADER_HEIGHT,
  MOBILE_STATS_ROW_HEIGHT,
  POSITION_FILTER_BAR_HEIGHT,
  WEEK,
} from "../../constants/general";
import { BUDGET_MATCH_WINDOW } from "../../constants/playersLeft";
import { PlayerDetailModal } from "../../components/PlayerDetailModal";
import { PositionFilterBar } from "../../components/PositionFilterBar";
import { GenericValuesNotice } from "../../components/GenericValuesNotice";
import {
  computeConsistencyThresholds,
  getConsistencyLabel,
  type ConsistencyLabel,
} from "../../lib/consistency";
import { PlayerBar } from "./components/PlayerBar";
import { PlayerTableRow } from "./components/PlayerTableRow";
import { PlayerTableRowMobile } from "./components/PlayerTableRowMobile";
import { getErrorMessage } from "../../lib/errors";

type BoardView = "bar" | "table";

// Same namespaced-key convention as lib/leagueStorage.ts - not user-scoped
// like that one, since which layout a person prefers isn't account data,
// just a device-local display preference.
const PLAYERS_VIEW_STORAGE_KEY = "infinidraft:playersView";

function getStoredView(): BoardView {
  return localStorage.getItem(PLAYERS_VIEW_STORAGE_KEY) === "table"
    ? "table"
    : "bar";
}

interface PlayersLeftTabProps {
  seasonId: Id<"seasons">;
  selfTeamId: Id<"seasonTeams">;
}

export function PlayersLeftTab({ seasonId, selfTeamId }: PlayersLeftTabProps) {
  const settingsList = useQuery(api.leagues.listSeasons, {});
  const settings = settingsList?.find((s) => s._id === seasonId);
  const [selectedFpid, setSelectedFpid] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Restored from localStorage (see getStoredView) rather than always
  // starting on "bar" - reselecting "Bars"/"Table" every time you come back
  // to this tab (or reload mid-draft) got old fast.
  const [view, setView] = useState<BoardView>(getStoredView);
  // Which table-view rows' nominate/target/avoid actions are showing -
  // dropped from the main row to fit mobile widths, same click-to-expand
  // pattern PlayersTable.tsx/PlayerRow.tsx uses.
  const [expandedFpids, setExpandedFpids] = useState<Set<number>>(new Set());
  const toggleExpanded = (fpid: number) => {
    setExpandedFpids((current) => {
      const next = new Set(current);
      if (next.has(fpid)) {
        next.delete(fpid);
      } else {
        next.add(fpid);
      }
      return next;
    });
  };
  // Mobile table view's counterpart to expandedFpids above - only one row's
  // Target/Avoid actions are ever swiped open at a time (see
  // PlayerTableRowMobile.tsx), rather than each row tracking its own.
  const [swipedFpid, setSwipedFpid] = useState<number | null>(null);
  // Narrows which position sections render, in both bar and table view -
  // useful even in the bar view's already position-grouped layout once a
  // league has many active positions and scrolling past ones you're not
  // drafting for gets tedious.
  const [selectedPositions, setSelectedPositions] = useState<Position[]>([
    ...POSITIONS,
  ]);
  // One search box narrows every position section at once (both bar and
  // table view read from the same rowsByPosition map below), rather than
  // needing a separate search per position.
  const [search, setSearch] = useState("");
  // Deliberately a separate subscription from listDraftPicks below - this
  // query's only read dependencies are draftSettings + projections, so it
  // doesn't get invalidated/recomputed (the expensive VBD ranking) every
  // time a pick happens elsewhere in the draft. Live drafted-status is
  // joined in client-side from `picks` instead (see `board` below).
  const draftBoardResult = useQuery(
    api.draft.board.getDraftBoard,
    settings
      ? {
          seasonId,
          week: WEEK,
          scoringConfig: scoringConfigFromSeason(settings),
        }
      : "skip",
  ) as { isGeneric: boolean; rows: DraftTierRow[] } | undefined;
  const tieredValues = draftBoardResult?.rows;
  const usingGenericValues = draftBoardResult?.isGeneric ?? false;
  const picks = useQuery(api.draft.picks.listDraftPicks, { seasonId });
  const activeNomination = useQuery(api.draft.picks.getActiveNomination, {
    seasonId,
  });
  const allRankings = useQuery(api.rankings.getAllRankings, { week: WEEK });
  const injuries = useQuery(api.injuries.getInjuries, {});
  const playerTags = useQuery(api.draft.tags.listPlayerTags, {
    seasonId,
  });
  const nominationConfig = useQuery(
    api.draft.nominationOrder.getNominationConfig,
    { seasonId },
  );
  // Only fetched when a nomination order is configured - same "who gets
  // credited" logic as DraftTopBar's nominatingTeamId below.
  const currentNominator = useQuery(
    api.draft.nominationOrder.getCurrentNominator,
    nominationConfig?.nominationOrder ? { seasonId } : "skip",
  );
  // Same "stable for the live draft" reasoning as tieredValues/allRankings
  // above - last season's stats and this season's projections don't change
  // mid-draft, so this is its own subscription rather than folded into
  // getDraftBoard. `season` is only set on leagues advanced through
  // cloneDraftSettings, so leagues created directly fall back to the
  // system clock's year - the same thing convex/fantasyPros/client.ts's
  // currentSeason() does server-side (fine here since this is frontend
  // code, not a Convex query - queries can't read the wall clock, but
  // components aren't restricted that way).
  const thisSeason = settings?.year ?? String(new Date().getFullYear());
  const standardValues = useQuery(api.standardValues.getStandardValues, {
    season: thisSeason,
  });
  const valueGaps = useQuery(
    api.valueGaps.getAllValueGaps,
    settings
      ? {
          week: WEEK,
          scoringConfig: scoringConfigFromSeason(settings),
          lastSeason: String(Number(thisSeason) - 1),
        }
      : "skip",
  );
  // Consistency rating (see src/lib/consistency.ts) - same query/shape as
  // PlayersTable.tsx, unfiltered since this board spans every position.
  const seasonStats = useQuery(
    api.playerPoints.getAllSeasonStats,
    settings
      ? {
          season: String(Number(thisSeason) - 1),
          scoringConfig: scoringConfigFromSeason(settings),
        }
      : "skip",
  );
  const setPlayerTag = useMutation(api.draft.tags.setPlayerTag);
  const nominate = useMutation(api.draft.picks.nominate);
  const stats = useTeamBudget(seasonId, selfTeamId);
  const planSlots = usePlanSlots(seasonId, selfTeamId);

  // Who gets credited on a nomination made from this board - mirrors
  // DraftTopBar's identical nominatingTeamId logic exactly, so a nomination
  // started here attributes the same way one started from the top bar
  // would. No fallback team when an order is configured but no one's
  // "current" (the manual/no-one state) - defaulting silently would
  // misattribute the nomination.
  const nominatingTeamId = nominationConfig?.nominationOrder
    ? (currentNominator?.currentTeamId ?? undefined)
    : selfTeamId;

  const consistencyByFpid = useMemo(() => {
    const map = new Map<number, ConsistencyLabel>();
    if (!settings || !seasonStats) return map;
    const byPosition = new Map<Position, typeof seasonStats>();
    for (const row of seasonStats) {
      const list = byPosition.get(row.position) ?? [];
      list.push(row);
      byPosition.set(row.position, list);
    }
    for (const [position, rows] of byPosition) {
      const thresholds = computeConsistencyThresholds(position, rows);
      for (const row of rows) {
        const label = getConsistencyLabel(position, row, thresholds);
        if (label) map.set(row.fpid, label);
      }
    }
    return map;
  }, [settings, seasonStats]);

  const tagByFpid = useMemo(() => {
    const map = new Map<number, PlayerTag>();
    for (const row of playerTags ?? []) map.set(row.fpid, row.tag);
    return map;
  }, [playerTags]);

  const rookieFpids = useRookieFpids();

  const injuriesByFpid = useMemo(() => {
    const map = new Map<number, { status: string; statusShort: string }>();
    for (const injury of injuries ?? []) {
      map.set(injury.fpid, injury);
    }
    return map;
  }, [injuries]);

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

  const pickByFpid = useMemo(() => {
    const map = new Map<number, Doc<"draftPicks">>();
    for (const pick of picks ?? []) map.set(pick.fpid, pick);
    return map;
  }, [picks]);

  const valueGapByFpid = useMemo(() => {
    const map = new Map<number, ValueGap>();
    for (const gap of valueGaps ?? []) map.set(gap.fpid, gap);
    return map;
  }, [valueGaps]);

  const standardValueByFpid = useMemo(
    () =>
      buildStandardValueByFpid(
        standardValues,
        settings?.scoring ?? "PPR",
        (settings?.rosterSlots.SUPERFLEX ?? 0) > 0,
      ),
    [standardValues, settings],
  );

  // The cheap join: re-runs on every pick, but only touches the small
  // tieredValues/picks arrays already in memory - no server recompute.
  const board: DraftBoardRow[] | undefined = useMemo(() => {
    if (!tieredValues) return undefined;
    return tieredValues.map((row) => {
      const pick = pickByFpid.get(row.fpid);
      return {
        ...row,
        drafted: pick !== undefined,
        ...(pick
          ? { draftedByTeamId: pick.teamId, draftedPrice: pick.price }
          : {}),
      };
    });
  }, [tieredValues, pickByFpid]);

  const activePositions = useMemo(() => {
    if (!settings) return [];
    return POSITIONS.filter(
      (pos) =>
        settings.rosterSlots[pos] > 0 ||
        settings.flexPositions.includes(pos) ||
        settings.superflexPositions.includes(pos),
    );
  }, [settings]);

  const openSlotsByPosition = useMemo(() => {
    const counts = new Map<Position, number>();
    if (!settings || !picks) return counts;
    const filledSlotKeys = new Set(
      picks
        .filter((pick) => pick.teamId === selfTeamId)
        .map((pick) => pick.planSlotKey)
        .filter((key): key is string => !!key),
    );
    for (const slot of expandRosterSlots(settings.rosterSlots)) {
      if (slot.position && !filledSlotKeys.has(slot.key)) {
        counts.set(slot.position, (counts.get(slot.position) ?? 0) + 1);
      }
    }
    return counts;
  }, [settings, picks, selfTeamId]);

  // Drafted players are hidden entirely rather than shown faded - once
  // they're off the board they're no longer a decision to weigh here.
  // getDraftBoard returns every player Sleeper has a projection for
  // (hundreds of deep-bench/practice-squad guys per position) - trimmed
  // down to actually draft-relevant ones with the same ADP-based filter
  // PlayersTable/DraftTab already use, or this tab renders (and Tooltips)
  // hundreds of bars nobody would ever nominate.
  const rowsByPosition = useMemo(() => {
    const relevant = settings
      ? filterRelevantPlayers(
          board ?? [],
          activePositions,
          settings.scoring,
          adpByFpid,
          (row) => row.points,
        )
      : [];
    const query = search.trim().toLowerCase();
    const map = new Map<Position, DraftBoardRow[]>();
    for (const row of relevant) {
      if (row.drafted) continue;
      if (query && !row.name.toLowerCase().includes(query)) continue;
      const list = map.get(row.position) ?? [];
      list.push(row);
      map.set(row.position, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.tierRank - b.tierRank);
    }
    return map;
  }, [board, settings, activePositions, adpByFpid, search]);

  // Across the whole board, not just whatever positions selectedPositions
  // currently has toggled visible - see lib/draftRecommendation.ts's
  // barWidth for why this needs to be the same regardless of the position
  // filter, so a $20 player's bar is always the same width no matter which
  // positions happen to be shown at the moment.
  const highestVisibleDollarValue = useMemo(() => {
    let max = 0;
    for (const rows of rowsByPosition.values()) {
      for (const row of rows) {
        if (row.dollarValue > max) max = row.dollarValue;
      }
    }
    return max;
  }, [rowsByPosition]);

  // Which of the team's still-open budget-plan slots each visible player's
  // market value best matches (e.g. a $23 WR reads against WR2's $23 budget
  // rather than WR1's $40, even though WR1 is the "first" open WR slot) -
  // drives fitsBudget and the plan-slot line in each bar's tooltip. Only
  // ever populated when a budget plan has been saved; without one there's
  // nothing to match against.
  const planMatchByFpid = useMemo(() => {
    const map = new Map<number, PlanSlotMatch>();
    if (!planSlots) return map;
    for (const list of rowsByPosition.values()) {
      for (const row of list) {
        const match = matchPlanSlot(
          row.position,
          row.dollarValue,
          planSlots.openSlots,
          planSlots.amounts,
          planSlots.flexPositions,
          planSlots.superflexPositions,
        );
        if (match) map.set(row.fpid, match);
      }
    }
    return map;
  }, [rowsByPosition, planSlots]);

  // Whether each visible player's $ value is within BUDGET_MATCH_WINDOW of
  // the budgeted amount for *any* still-open slot eligible for their
  // position, not just the single closest-matched one planMatchByFpid
  // narrows to - drives the highlight called out in the legend text below.
  // A window (not "at or under") on purpose - the goal is a small,
  // glanceable set of players worth bidding on right now, not everything
  // technically affordable.
  const budgetMatchByFpid = useMemo(() => {
    const map = new Map<number, boolean>();
    if (!planSlots) return map;
    for (const list of rowsByPosition.values()) {
      for (const row of list) {
        map.set(
          row.fpid,
          isNearAnyOpenSlot(
            row.position,
            row.dollarValue,
            planSlots.openSlots,
            planSlots.amounts,
            planSlots.flexPositions,
            planSlots.superflexPositions,
            BUDGET_MATCH_WINDOW,
          ),
        );
      }
    }
    return map;
  }, [rowsByPosition, planSlots]);

  // Position sections hidden entirely (rather than shown with a "0 left"
  // header) once a search query filters every one of their rows out - a wall
  // of empty position headers isn't useful feedback for "no matches".
  const visiblePositions = activePositions
    .filter((pos) => selectedPositions.includes(pos))
    .filter(
      (pos) => !search.trim() || (rowsByPosition.get(pos)?.length ?? 0) > 0,
    );

  if (!board || !settings) return null;

  return (
    // The caption/toggle/error row lives outside the horizontally-scrolling
    // Box below (rather than as its first child) so the view switcher stays
    // reachable without having to scroll all the way across the bars first
    // - a child anchored to the far edge of an very-wide (miw: max-content)
    // scroll container is only actually visible once scrolled there.
    <Stack gap="lg" py="sm">
      {/* Reserves space for PositionFilterBar's fixed mobile bar below,
          which is pulled out of document flow - see
          POSITION_FILTER_BAR_HEIGHT's comment for why this is a real
          spacer element rather than a `pt` prop on this Stack (which
          already sets `py`). */}
      <Box hiddenFrom="sm" h={POSITION_FILTER_BAR_HEIGHT} />
      <Group justify="space-between" wrap="wrap" gap="sm" px={4}>
        <Text size="xs" c="dimmed" maw={640}>
          {view === "bar"
            ? "Length = cost · color = consistency · outline = target/avoid · faded = over budget · gold = on the block"
            : "$ = cost · green = fits budget · gold row = on the block"}
        </Text>
        <SegmentedControl
          size="sm"
          value={view}
          onChange={(value) => {
            const nextView = value as BoardView;
            setView(nextView);
            localStorage.setItem(PLAYERS_VIEW_STORAGE_KEY, nextView);
          }}
          data={[
            {
              value: "bar",
              label: (
                <Group gap={4} wrap="nowrap">
                  <LayoutList size={16} />
                  <Text size="sm">Bars</Text>
                </Group>
              ),
            },
            {
              value: "table",
              label: (
                <Group gap={4} wrap="nowrap">
                  <LayoutGrid size={16} />
                  <Text size="sm">Table</Text>
                </Group>
              ),
            },
          ]}
        />
      </Group>
      {usingGenericValues && (
        <Box px={4} mt={-8}>
          <GenericValuesNotice />
        </Box>
      )}
      <Box px={4}>
        <TextInput
          placeholder="Search players..."
          leftSection={<Search size={16} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          w={{ base: "100%", sm: 260 }}
          mb="sm"
          autoComplete="off"
        />
        <PositionFilterBar
          positions={activePositions}
          selected={selectedPositions}
          onChange={setSelectedPositions}
          top={MOBILE_HEADER_HEIGHT + MOBILE_STATS_ROW_HEIGHT}
        />
      </Box>
      {actionError && (
        <Text size="xs" c="red" px={4}>
          {actionError}
        </Text>
      )}
      {/* A few px of horizontal padding keeps the leftmost/rightmost bars'
          outlines from being clipped by the scroll container's edge -
          without it, an outlined bar sitting flush against x=0 has its
          outline cut off since outline paint is subject to the ancestor's
          overflow clip region. */}
      <Box style={{ overflowX: view === "bar" ? "auto" : "visible" }} px={4}>
        <Stack gap="lg" miw={view === "bar" ? "max-content" : undefined}>
          {visiblePositions.length === 0 && (
            <Text c="dimmed" px={4}>
              No players match your search.
            </Text>
          )}
          {visiblePositions.map((pos) => {
            const rows = rowsByPosition.get(pos) ?? [];
            const remainingTopTiers = rows.filter(
              (row) => row.tier <= 2,
            ).length;
            const openSlots = openSlotsByPosition.get(pos) ?? 0;
            const recommendation = recommendationFor(
              remainingTopTiers,
              openSlots,
            );
            const tierGroups = groupByTier(rows);

            const handleSetTag = (fpid: number, nextTag: PlayerTag) => {
              setActionError(null);
              setSwipedFpid((current) => (current === fpid ? null : current));
              setPlayerTag({ seasonId, fpid, tag: nextTag }).catch((err) => {
                setActionError(getErrorMessage(err, "Failed to update tag."));
              });
            };

            const handleNominate = (fpid: number) => {
              setActionError(null);
              nominate({
                seasonId,
                fpid,
                ...(nominatingTeamId ? { nominatingTeamId } : {}),
                openingBid: 1,
              }).catch((err) => {
                setActionError(getErrorMessage(err, "Failed to nominate."));
              });
            };

            return (
              <Stack key={pos} gap={6}>
                <Group
                  gap="sm"
                  wrap="nowrap"
                  style={{
                    position: "sticky",
                    left: 0,
                    width: "fit-content",
                    backgroundColor: "var(--mantine-color-body)",
                    zIndex: 1,
                  }}
                  py={2}
                  pr="md"
                >
                  <Badge size="lg" variant="light" color={POSITION_COLORS[pos]}>
                    {pos}
                  </Badge>
                  <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                    {remainingTopTiers} left in tiers 1-2 - {openSlots} slot
                    {openSlots === 1 ? "" : "s"} to fill
                  </Text>
                  <Badge color={recommendation.color} variant="light">
                    {recommendation.label}
                  </Badge>
                </Group>
                {view === "table" && (
                  <Box hiddenFrom="sm">
                    <Text size="xs" c="dimmed">
                      Swipe a row left for Target/Avoid
                    </Text>
                  </Box>
                )}
                {view === "bar" ? (
                  <Group gap="lg" align="flex-end" wrap="nowrap">
                    {tierGroups.map((group) => (
                      <Stack key={group.tier} gap={4} style={{ flexShrink: 0 }}>
                        <Text
                          size="xs"
                          c="dimmed"
                          tt="uppercase"
                          style={{
                            position: "sticky",
                            left: 0,
                            width: "fit-content",
                            backgroundColor: "var(--mantine-color-body)",
                            zIndex: 1,
                          }}
                        >
                          {group.tierLabel}
                        </Text>
                        <Group gap={8} align="flex-end" wrap="nowrap">
                          {group.rows.map((row) => {
                            const planMatch = planMatchByFpid.get(row.fpid);
                            const budgetAmount =
                              planMatch?.amount ?? stats?.perOpenSlot;
                            return (
                              <PlayerBar
                                key={row.fpid}
                                row={row}
                                budgetAmount={budgetAmount}
                                highestVisibleDollarValue={
                                  highestVisibleDollarValue
                                }
                                planMatch={planMatch}
                                tag={tagByFpid.get(row.fpid)}
                                valueGap={valueGapByFpid.get(row.fpid)}
                                consistency={consistencyByFpid.get(row.fpid)}
                                isRookie={rookieFpids.has(row.fpid)}
                                isNominated={
                                  activeNomination?.fpid === row.fpid
                                }
                                hasActiveNomination={!!activeNomination}
                                onSetTag={(nextTag) =>
                                  handleSetTag(row.fpid, nextTag)
                                }
                                onNominate={() => handleNominate(row.fpid)}
                                onSelectPlayer={setSelectedFpid}
                              />
                            );
                          })}
                        </Group>
                      </Stack>
                    ))}
                  </Group>
                ) : (
                  <>
                    <Box visibleFrom="sm">
                      <Table.ScrollContainer minWidth={300}>
                        <Table
                          verticalSpacing={4}
                          horizontalSpacing="xs"
                          highlightOnHover
                        >
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th></Table.Th>
                              <Table.Th>Player</Table.Th>
                              <Table.Th>Tier</Table.Th>
                              <Table.Th>$</Table.Th>
                              <Table.Th>vs. market</Table.Th>
                              <Table.Th>Pts</Table.Th>
                              <Table.Th></Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {rows.map((row) => (
                              <PlayerTableRow
                                key={row.fpid}
                                row={row}
                                tag={tagByFpid.get(row.fpid)}
                                standardValue={standardValueByFpid.get(
                                  row.fpid,
                                )}
                                valueGap={valueGapByFpid.get(row.fpid)}
                                consistency={consistencyByFpid.get(row.fpid)}
                                injury={injuriesByFpid.get(row.fpid)}
                                isRookie={rookieFpids.has(row.fpid)}
                                isNominated={
                                  activeNomination?.fpid === row.fpid
                                }
                                hasActiveNomination={!!activeNomination}
                                budgetMatch={
                                  budgetMatchByFpid.get(row.fpid) ?? false
                                }
                                isExpanded={expandedFpids.has(row.fpid)}
                                onSetTag={(nextTag) =>
                                  handleSetTag(row.fpid, nextTag)
                                }
                                onNominate={() => handleNominate(row.fpid)}
                                onSelectPlayer={setSelectedFpid}
                                onToggleExpand={() => toggleExpanded(row.fpid)}
                              />
                            ))}
                          </Table.Tbody>
                        </Table>
                      </Table.ScrollContainer>
                    </Box>

                    <Box hiddenFrom="sm">
                      <Box
                        style={{
                          border:
                            "1px solid var(--mantine-color-default-border)",
                          borderRadius: "var(--mantine-radius-sm)",
                          overflow: "hidden",
                        }}
                      >
                        <Group
                          gap={8}
                          wrap="nowrap"
                          px={6}
                          py={4}
                          style={{
                            borderBottom:
                              "1px solid var(--mantine-color-default-border)",
                          }}
                        >
                          <Text
                            size="10px"
                            c="dimmed"
                            tt="uppercase"
                            style={{ flex: 1 }}
                          >
                            Player
                          </Text>
                          <Text
                            size="10px"
                            c="dimmed"
                            tt="uppercase"
                            style={{ width: 36, flexShrink: 0 }}
                          >
                            $
                          </Text>
                          <Text
                            size="10px"
                            c="dimmed"
                            tt="uppercase"
                            style={{ width: 36, flexShrink: 0 }}
                          >
                            vs Mkt
                          </Text>
                          <Text
                            size="10px"
                            c="dimmed"
                            tt="uppercase"
                            style={{ width: 40, flexShrink: 0 }}
                          >
                            Pos
                          </Text>
                          <Text
                            size="10px"
                            c="dimmed"
                            tt="uppercase"
                            style={{
                              width: 34,
                              flexShrink: 0,
                              textAlign: "right",
                            }}
                          >
                            Pts
                          </Text>
                        </Group>
                        {rows.map((row) => (
                          <PlayerTableRowMobile
                            key={row.fpid}
                            row={row}
                            tag={tagByFpid.get(row.fpid)}
                            standardValue={standardValueByFpid.get(row.fpid)}
                            valueGap={valueGapByFpid.get(row.fpid)}
                            consistency={consistencyByFpid.get(row.fpid)}
                            injury={injuriesByFpid.get(row.fpid)}
                            isRookie={rookieFpids.has(row.fpid)}
                            isNominated={activeNomination?.fpid === row.fpid}
                            isSwiped={swipedFpid === row.fpid}
                            onSwipeOpen={() => setSwipedFpid(row.fpid)}
                            onSetTag={(nextTag) =>
                              handleSetTag(row.fpid, nextTag)
                            }
                            onCloseSwipe={() => setSwipedFpid(null)}
                            onSelectPlayer={setSelectedFpid}
                          />
                        ))}
                      </Box>
                    </Box>
                  </>
                )}
              </Stack>
            );
          })}
        </Stack>
      </Box>

      <PlayerDetailModal
        fpid={selectedFpid}
        onClose={() => setSelectedFpid(null)}
        week={WEEK}
        scoringConfig={scoringConfigFromSeason(settings)}
        season={thisSeason}
        seasonId={seasonId}
      />
    </Stack>
  );
}
