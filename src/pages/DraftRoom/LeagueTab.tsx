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
import { Position } from "../../types";

interface LeagueTabProps {
  draftSettingsId: Id<"draftSettings">;
  teams: Doc<"draftTeams">[];
  selfTeamId: Id<"draftTeams">;
}

export function LeagueTab({
  draftSettingsId,
  teams,
  selfTeamId,
}: LeagueTabProps) {
  const settingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const settings = settingsList?.find((s) => s._id === draftSettingsId);
  const picks = useQuery(api.draft.picks.listDraftPicks, { draftSettingsId });
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
      console.log(stats);
      const fillPct = (stats.remaining / (stats.remaining + stats.spent)) * 100;
      // const fillPct = slots.length
      //   ? ((slots.length - needs.length) / slots.length) * 100
      //   : 0;
      return { team, teamPicks, stats, slots, bySlot, needs, fillPct };
    });
  }, [teams, settings, picks]);

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

  const thisSeason = settings.season ?? String(new Date().getFullYear());
  console.log(settings.rosterSlots);

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
      <SimpleGrid cols={3} spacing="md">
        {sortedSummaries.map(
          ({ team, stats, needs, fillPct, teamPicks, slots, bySlot }) => (
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
                <Group>
                  {Object.keys(settings.rosterSlots)
                    .sort(
                      (a, b) =>
                        POSITION_ORDER.indexOf(a as Position) -
                        POSITION_ORDER.indexOf(b as Position),
                    )
                    .map((slot) => {
                      if (needs.some((p) => p.startsWith(slot))) {
                        return (
                          <Badge
                            key={slot}
                            color={positionColorOrDefault(slot)}
                            size="xs"
                            variant="light"
                          >
                            {slot}
                          </Badge>
                        );
                      }
                      return null;
                    })}
                </Group>
                <Text size="xs" c="dimmed" lineClamp={1}>
                  needs {needs.slice(0, 4).join(", ") || "nothing"}
                  {needs.length > 4 ? ` +${needs.length - 4}` : ""}
                </Text>
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
        draftSettingsId={draftSettingsId}
      />
    </Stack>
  );
}
