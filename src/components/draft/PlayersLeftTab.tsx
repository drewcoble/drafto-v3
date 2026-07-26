import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { Badge, Box, Group, Stack, Text, Tooltip } from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { DraftBoardRow, DraftTierRow, PlayerTag, Position } from "../../types";
import { expandRosterSlots } from "../../lib/rosterSlots";
import { useTeamBudget } from "../../hooks/useTeamBudget";
import { filterRelevantPlayers } from "../../lib/relevantPlayers";

const WEEK = "draft";
const ALL_POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "DST", "K"];

// One scale for every bar on the page - price comparisons only make sense
// if a $20 player is the same width in every position group.
const PX_PER_DOLLAR = 3.5;
const BAR_HEIGHT = 22;
const MIN_BAR_WIDTH = 6;

interface PlayersLeftTabProps {
  draftSettingsId: Id<"draftSettings">;
  selfTeamId: Id<"draftTeams">;
}

function recommendationFor(
  remainingTopTiers: number,
  openSlotsForPosition: number,
): { label: string; color: string } {
  if (openSlotsForPosition <= 0) return { label: "HOLD", color: "gray" };
  if (remainingTopTiers <= openSlotsForPosition) {
    return { label: "BID HARDER", color: "red" };
  }
  if (remainingTopTiers > openSlotsForPosition * 3) {
    return { label: "WAIT", color: "green" };
  }
  return { label: "HOLD", color: "gray" };
}

// Consecutive rows share a tier group since rows arrive sorted by $ value,
// which is monotonic with positionRank (and therefore tier) - no separate
// pass needed to bucket them.
function groupByTier(rows: DraftBoardRow[]) {
  const groups: Array<{ tier: number; tierLabel: string; rows: DraftBoardRow[] }> =
    [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.tier === row.tier) {
      last.rows.push(row);
    } else {
      groups.push({ tier: row.tier, tierLabel: row.tierLabel, rows: [row] });
    }
  }
  return groups;
}

interface PlayerBarProps {
  row: DraftBoardRow;
  fitsBudget: boolean;
  tag: PlayerTag | undefined;
  onCycleTag: () => void;
}

function barColor(tag: PlayerTag | undefined, fitsBudget: boolean): string {
  if (tag === "target") return "var(--mantine-color-green-6)";
  if (tag === "avoid") return "var(--mantine-color-red-9)";
  return fitsBudget ? "var(--mantine-color-blue-6)" : "var(--mantine-color-gray-6)";
}

// Player identity is hidden by default - only the bar (width = projected
// cost) shows until hovered, when a tooltip reveals who it actually is.
// Clicking a bar cycles it through no-opinion -> target -> avoid, so you can
// mark players you like/dislike right from the board. Drafted players are
// filtered out before this ever renders (see rowsByPosition below).
function PlayerBar({ row, fitsBudget, tag, onCycleTag }: PlayerBarProps) {
  const width = Math.max(
    Math.round(row.dollarValue * PX_PER_DOLLAR),
    MIN_BAR_WIDTH,
  );
  return (
    <Tooltip
      withArrow
      label={
        <Stack gap={2} py={2}>
          <Text size="sm" fw={600}>
            {row.name}
            {row.team ? ` · ${row.team}` : ""}
          </Text>
          <Text size="xs">
            {row.position}
            {row.positionRank} · {row.tierLabel}
          </Text>
          <Text size="xs">
            ${Math.round(row.dollarValue)} proj · {row.points.toFixed(1)} pts
          </Text>
          <Text size="xs" c="dimmed">
            {tag === "target" && "Target - click to mark avoid"}
            {tag === "avoid" && "Avoid - click to clear"}
            {!tag && "Click to mark as target"}
          </Text>
        </Stack>
      }
    >
      <Box
        h={BAR_HEIGHT}
        w={width}
        onClick={onCycleTag}
        style={{
          backgroundColor: barColor(tag, fitsBudget),
          opacity: tag === "avoid" ? 0.3 : 1,
          borderRadius: 3,
          outline:
            fitsBudget && !tag
              ? "2px solid var(--mantine-color-blue-3)"
              : tag === "target"
                ? "2px solid var(--mantine-color-green-3)"
                : "none",
          outlineOffset: 1,
          cursor: "pointer",
        }}
      />
    </Tooltip>
  );
}

export function PlayersLeftTab({
  draftSettingsId,
  selfTeamId,
}: PlayersLeftTabProps) {
  const settingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const settings = settingsList?.find((s) => s._id === draftSettingsId);
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
  const allRankings = useQuery(api.rankings.getAllRankings, { week: WEEK });
  const playerTags = useQuery(api.draft.tags.listPlayerTags, {
    draftSettingsId,
  });
  const cyclePlayerTag = useMutation(api.draft.tags.cyclePlayerTag);
  const stats = useTeamBudget(draftSettingsId, selfTeamId);

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
      list.sort((a, b) => b.dollarValue - a.dollarValue);
    }
    return map;
  }, [board, settings, activePositions, adpByFpid]);

  if (!board || !settings) return null;

  return (
    // A few px of horizontal padding keeps the leftmost/rightmost bars'
    // outlines from being clipped by the scroll container's edge - without
    // it, an outlined bar sitting flush against x=0 has its outline cut off
    // since outline paint is subject to the ancestor's overflow clip region.
    <Box style={{ overflowX: "auto" }} px={4}>
      <Stack gap="lg" py="sm" miw="max-content">
        <Text size="xs" c="dimmed">
          Bar length = projected cost · outline = fits your budget · drafted
          players are hidden. Hover a bar for player info, click to mark
          target/avoid.
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
                gap="xs"
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
                <Badge size="lg">{pos}</Badge>
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
                    <Text size="xs" c="dimmed" tt="uppercase">
                      {group.tierLabel}
                    </Text>
                    <Group gap={3} align="flex-end" wrap="nowrap">
                      {group.rows.map((row) => (
                        <PlayerBar
                          key={row.fpid}
                          row={row}
                          fitsBudget={
                            stats !== undefined &&
                            row.dollarValue <= stats.maxBid
                          }
                          tag={tagByFpid.get(row.fpid)}
                          onCycleTag={() =>
                            cyclePlayerTag({ draftSettingsId, fpid: row.fpid })
                          }
                        />
                      ))}
                    </Group>
                  </Stack>
                ))}
              </Group>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}
