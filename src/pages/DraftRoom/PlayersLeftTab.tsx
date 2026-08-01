import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Badge, Box, Group, Stack, Text } from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  DraftBoardRow,
  DraftTierRow,
  PlayerTag,
  Position,
  ValueGap,
} from "../../types";
import { expandRosterSlots } from "../../lib/rosterSlots";
import { useTeamBudget } from "../../hooks/useTeamBudget";
import { usePlanSlots } from "../../hooks/usePlanSlots";
import {
  matchPlanSlot,
  type PlanSlotMatch,
} from "../../lib/planRecommendation";
import { filterRelevantPlayers } from "../../lib/relevantPlayers";
import { recommendationFor, groupByTier } from "../../lib/draftRecommendation";
import { POSITION_COLORS } from "../../lib/positionColors";
import { WEEK } from "../../constants/general";
import { ALL_POSITIONS } from "../../constants/playersLeft";
import { PlayerDetailModal } from "../../components/PlayerDetailModal";
import {
  computeConsistencyThresholds,
  getConsistencyLabel,
  type ConsistencyLabel,
} from "../../lib/consistency";
import { PlayerBar } from "./components/PlayerBar";

interface PlayersLeftTabProps {
  draftSettingsId: Id<"draftSettings">;
  selfTeamId: Id<"draftTeams">;
}

export function PlayersLeftTab({
  draftSettingsId,
  selfTeamId,
}: PlayersLeftTabProps) {
  const settingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const settings = settingsList?.find((s) => s._id === draftSettingsId);
  const [selectedFpid, setSelectedFpid] = useState<number | null>(null);
  // Deliberately a separate subscription from listDraftPicks below - this
  // query's only read dependencies are draftSettings + projections, so it
  // doesn't get invalidated/recomputed (the expensive VBD ranking) every
  // time a pick happens elsewhere in the draft. Live drafted-status is
  // joined in client-side from `picks` instead (see `board` below).
  const tieredValues = useQuery(
    api.draft.board.getDraftBoard,
    settings
      ? { draftSettingsId, week: WEEK, scoring: settings.scoring }
      : "skip",
  ) as DraftTierRow[] | undefined;
  const picks = useQuery(api.draft.picks.listDraftPicks, { draftSettingsId });
  const activeNomination = useQuery(api.draft.picks.getActiveNomination, {
    draftSettingsId,
  });
  const allRankings = useQuery(api.rankings.getAllRankings, { week: WEEK });
  const playerTags = useQuery(api.draft.tags.listPlayerTags, {
    draftSettingsId,
  });
  // Same "stable for the live draft" reasoning as tieredValues/allRankings
  // above - last season's stats and this season's projections don't change
  // mid-draft, so this is its own subscription rather than folded into
  // getDraftBoard. `season` is only set on leagues advanced through
  // cloneDraftSettings, so leagues created directly fall back to the
  // system clock's year - the same thing convex/fantasyPros/client.ts's
  // currentSeason() does server-side (fine here since this is frontend
  // code, not a Convex query - queries can't read the wall clock, but
  // components aren't restricted that way).
  const thisSeason = settings?.season ?? String(new Date().getFullYear());
  const valueGaps = useQuery(
    api.valueGaps.getAllValueGaps,
    settings
      ? {
          week: WEEK,
          scoring: settings.scoring,
          lastSeason: String(Number(thisSeason) - 1),
        }
      : "skip",
  );
  // Consistency rating (see src/lib/consistency.ts) - same query/shape as
  // PlayersTable.tsx, unfiltered since this board spans every position.
  const seasonStats = useQuery(
    api.playerPoints.getAllSeasonStats,
    settings
      ? { season: String(Number(thisSeason) - 1), scoring: settings.scoring }
      : "skip",
  );
  const cyclePlayerTag = useMutation(api.draft.tags.cyclePlayerTag);
  const stats = useTeamBudget(draftSettingsId, selfTeamId);
  const planSlots = usePlanSlots(draftSettingsId, selfTeamId);

  const consistencyByFpid = useMemo(() => {
    const map = new Map<number, ConsistencyLabel>();
    if (!settings || !seasonStats) return map;
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
  }, [settings, seasonStats]);

  const tagByFpid = useMemo(() => {
    const map = new Map<number, PlayerTag>();
    for (const row of playerTags ?? []) map.set(row.fpid, row.tag);
    return map;
  }, [playerTags]);

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
    return ALL_POSITIONS.filter(
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
    const map = new Map<Position, DraftBoardRow[]>();
    for (const row of relevant) {
      if (row.drafted) continue;
      const list = map.get(row.position) ?? [];
      list.push(row);
      map.set(row.position, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.tierRank - b.tierRank);
    }
    return map;
  }, [board, settings, activePositions, adpByFpid]);

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

  if (!board || !settings) return null;

  return (
    // A few px of horizontal padding keeps the leftmost/rightmost bars'
    // outlines from being clipped by the scroll container's edge - without
    // it, an outlined bar sitting flush against x=0 has its outline cut off
    // since outline paint is subject to the ancestor's overflow clip region.
    <Box style={{ overflowX: "auto" }} px={4}>
      <Stack gap="lg" py="sm" miw="max-content">
        <Text size="xs" c="dimmed">
          Bar length = projected cost · color = consistency rating · outline =
          target/avoid · faded = over your remaining budget · gold glow +
          gavel = currently on the block. Drafted players are hidden. Hover a
          bar for player info, click to mark target/avoid.
        </Text>
        {activePositions.map((pos) => {
          const rows = rowsByPosition.get(pos) ?? [];
          const remainingTopTiers = rows.filter((row) => row.tier <= 2).length;
          const openSlots = openSlotsByPosition.get(pos) ?? 0;
          const recommendation = recommendationFor(
            remainingTopTiers,
            openSlots,
          );
          const tierGroups = groupByTier(rows);

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
                <Badge size="lg" color={POSITION_COLORS[pos]}>
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
                            planMatch={planMatch}
                            tag={tagByFpid.get(row.fpid)}
                            valueGap={valueGapByFpid.get(row.fpid)}
                            consistency={consistencyByFpid.get(row.fpid)}
                            isNominated={activeNomination?.fpid === row.fpid}
                            onCycleTag={() =>
                              cyclePlayerTag({
                                draftSettingsId,
                                fpid: row.fpid,
                              })
                            }
                            onSelectPlayer={setSelectedFpid}
                          />
                        );
                      })}
                    </Group>
                  </Stack>
                ))}
              </Group>
            </Stack>
          );
        })}
      </Stack>

      <PlayerDetailModal
        fpid={selectedFpid}
        onClose={() => setSelectedFpid(null)}
        week={WEEK}
        scoring={settings.scoring}
        season={thisSeason}
        draftSettingsId={draftSettingsId}
      />
    </Box>
  );
}
