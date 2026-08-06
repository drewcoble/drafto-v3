import {
  Badge,
  Card,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { PlayerDetailModal } from "../../components/PlayerDetailModal";
import { TeamSlotDetail } from "../../components/TeamSlotDetail";
import { WEEK } from "../../constants/general";
import {
  POSITION_ORDER,
  positionColorOrDefault,
} from "../../lib/positionColors";
import { expandRosterSlots } from "../../lib/rosterSlots";
import { assignPicksToSlots } from "../../lib/slotAssignment";
import {
  computeTeamBudgetStats,
  resolveTeamSalaryCap,
} from "../../lib/teamBudget";

interface LeagueTabProps {
  seasonId: Id<"seasons">;
  teams: Doc<"seasonTeams">[];
  selfTeamId: Id<"seasonTeams">;
}

export function LeagueTab({
  seasonId,
  teams,
  selfTeamId,
}: LeagueTabProps) {
  const settingsList = useQuery(api.leagues.listSeasons, {});
  const settings = settingsList?.find((s) => s._id === seasonId);
  const picks = useQuery(api.draft.picks.listDraftPicks, { seasonId });
  const allProjections = useQuery(api.projections.getAllProjections, {
    week: WEEK,
  });
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedFpid, setSelectedFpid] = useState<number | null>(null);
  const removePick = useMutation(api.draft.picks.removePick);
  const setPickSlot = useMutation(api.draft.picks.setPickSlot);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleRemove = async (pickId: Id<"draftPicks">) => {
    setRemoveError(null);
    try {
      await removePick({ pickId });
    } catch (err) {
      setRemoveError(
        err instanceof Error ? err.message : "Failed to remove pick.",
      );
    }
  };

  const handleMove = async (pickId: Id<"draftPicks">, slotKey: string) => {
    setRemoveError(null);
    try {
      await setPickSlot({ pickId, slotKey });
    } catch (err) {
      setRemoveError(
        err instanceof Error ? err.message : "Failed to move pick.",
      );
    }
  };

  const nameByFpid = useMemo(() => {
    const map = new Map<number, { name: string; team: string | null }>();
    for (const row of allProjections ?? []) map.set(row.fpid, row);
    return map;
  }, [allProjections]);

  const teamSummaries = useMemo(() => {
    if (!settings || !picks) return [];
    return teams.map((team) => {
      const teamPicks = picks
        .filter((pick) => pick.teamId === team._id)
        .sort((a, b) => a.sequence - b.sequence);
      const spent = teamPicks.reduce((sum, pick) => sum + pick.price, 0);
      const stats = computeTeamBudgetStats(
        resolveTeamSalaryCap(team, settings.salaryCap),
        settings.rosterSlots,
        teamPicks.length,
        spent,
      );
      const slots = expandRosterSlots(settings.rosterSlots);
      const bySlot = assignPicksToSlots(
        teamPicks,
        settings.rosterSlots,
        settings.flexPositions,
        settings.superflexPositions,
      );
      const needs = slots
        .filter((slot) => !bySlot.has(slot.key))
        .map((slot) => slot.label);
      // Same label-stripping as allNeedGroups below (see its comment) so a
      // group here matches the fixed set of badge slots every team's card
      // renders into.
      const neededGroups = new Set(
        needs.map((label) => label.replace(/\d+$/, "")),
      );
      const fillPct = (stats.remaining / (stats.remaining + stats.spent)) * 100;
      // const fillPct = slots.length
      //   ? ((slots.length - needs.length) / slots.length) * 100
      //   : 0;
      return { team, teamPicks, stats, slots, bySlot, needs, neededGroups, fillPct };
    });
  }, [teams, settings, picks]);

  // The full, fixed set of position groups a "needs" row could ever show for
  // this league (same roster shape for every team) - rendered in this same
  // order for every card so a group's badge sits in the same horizontal spot
  // whether or not that team still needs it, making it easy to scan across
  // teams at a glance. Same label-stripping/sort as the old inline
  // computation below, just against every roster slot instead of only the
  // still-open ones.
  const allNeedGroups = useMemo(() => {
    if (!settings) return [];
    const slots = expandRosterSlots(settings.rosterSlots);
    return Array.from(
      new Set(slots.map((slot) => slot.label.replace(/\d+$/, ""))),
    )
      .filter((group) => POSITION_ORDER.includes(group))
      .sort((a, b) => POSITION_ORDER.indexOf(a) - POSITION_ORDER.indexOf(b));
  }, [settings]);

  const sortedSummaries = useMemo(() => {
    const self = teamSummaries.filter((ts) => ts.team.isSelf);
    const others = teamSummaries
      .filter((ts) => !ts.team.isSelf)
      .sort((a, b) => b.stats.remaining - a.stats.remaining);
    return [...self, ...others];
  }, [teamSummaries]);

  const selfSummary = teamSummaries.find((s) => s.team._id === selfTeamId);
  const teamsCanMatch = selfSummary
    ? teamSummaries.filter(
        (s) =>
          s.team._id !== selfTeamId &&
          s.stats.maxBid >= selfSummary.stats.maxBid,
      ).length
    : 0;

  const toggleExpanded = (teamId: string) => {
    setExpandedTeamIds((current) => {
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  if (!settings || !picks) return null;

  const thisSeason = settings.year;

  return (
    <Stack gap="md" py="sm">
      {selfSummary && (
        <Text size="sm" c="dimmed">
          {teamsCanMatch} team{teamsCanMatch === 1 ? "" : "s"} can match your $
          {Math.max(selfSummary.stats.maxBid, 0)}
        </Text>
      )}
      {removeError && (
        <Text c="red" size="sm">
          {removeError}
        </Text>
      )}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        {sortedSummaries.map(
          ({ team, stats, neededGroups, fillPct, teamPicks, slots, bySlot }) => (
            <Card
              key={team._id}
              withBorder
              padding="md"
              onClick={() => toggleExpanded(team._id)}
              style={{ cursor: "pointer" }}
            >
              <Stack gap={6}>
                <Group justify="space-between">
                  <Text fw={700}>
                    {team.name}
                    {team.isSelf ? " (you)" : ""}
                  </Text>
                  <Text size="sm">
                    max bid: <strong>${Math.max(stats.maxBid, 0)}</strong>
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">
                    max ${Math.max(stats.maxBid, 0)} - {teamPicks.length}/
                    {stats.totalSlots} filled
                  </Text>
                </Group>
                <Progress value={fillPct} size="lg" color="green" />
                <Group justify="space-between" wrap="nowrap" mt={8}>
                  {/* Every group renders in the same order for every team
                      (allNeedGroups), so a group's badge sits in the same
                      horizontal slot whether or not this team still needs
                      it - filled groups render invisible (same label, so
                      same width) instead of disappearing, so the row
                      doesn't reflow as picks come in. */}
                  {allNeedGroups.map((group) => (
                    <Badge
                      key={group}
                      color={positionColorOrDefault(group)}
                      size="xs"
                      variant="light"
                      style={
                        neededGroups.has(group)
                          ? undefined
                          : { visibility: "hidden" }
                      }
                    >
                      {group}
                    </Badge>
                  ))}
                </Group>
                {expandedTeamIds.has(team._id) && (
                  <TeamSlotDetail
                    slots={slots}
                    bySlot={bySlot}
                    nameByFpid={nameByFpid}
                    flexPositions={settings.flexPositions}
                    superflexPositions={settings.superflexPositions}
                    onRemove={handleRemove}
                    onMove={handleMove}
                    onSelectPlayer={setSelectedFpid}
                    trackConsecutiveYears={
                      settings.keeperRules?.trackConsecutiveYears ?? true
                    }
                  />
                )}
              </Stack>
            </Card>
          ),
        )}
      </SimpleGrid>

      <PlayerDetailModal
        fpid={selectedFpid}
        onClose={() => setSelectedFpid(null)}
        week={WEEK}
        scoring={settings.scoring}
        season={thisSeason}
        seasonId={seasonId}
      />
    </Stack>
  );
}
