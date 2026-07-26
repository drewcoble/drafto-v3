import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  Badge,
  Card,
  Group,
  Progress,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { computeTeamBudgetStats } from "../../lib/teamBudget";
import { expandRosterSlots } from "../../lib/rosterSlots";
import { assignPicksToSlots } from "../../lib/slotAssignment";

const WEEK = "draft";

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
        settings.salaryCap,
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
      const fillPct = slots.length
        ? ((slots.length - needs.length) / slots.length) * 100
        : 0;
      return { team, teamPicks, stats, slots, bySlot, needs, fillPct };
    });
  }, [teams, settings, picks]);

  const sortedSummaries = useMemo(
    () => [...teamSummaries].sort((a, b) => b.stats.remaining - a.stats.remaining),
    [teamSummaries],
  );

  const selfSummary = teamSummaries.find((s) => s.team._id === selfTeamId);
  const teamsCanMatch = selfSummary
    ? teamSummaries.filter(
        (s) => s.team._id !== selfTeamId && s.stats.maxBid >= selfSummary.stats.maxBid,
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

  return (
    <Stack gap="md" py="sm">
      {selfSummary && (
        <Text size="sm" c="dimmed">
          {teamsCanMatch} team{teamsCanMatch === 1 ? "" : "s"} can match your
          ${Math.max(selfSummary.stats.maxBid, 0)}
        </Text>
      )}
      <SimpleGrid cols={3} spacing="md">
        {sortedSummaries.map(({ team, stats, needs, fillPct, teamPicks, slots, bySlot }) => (
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
                <Text fw={700}>${stats.remaining}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">
                  max ${Math.max(stats.maxBid, 0)} - {teamPicks.length}/
                  {stats.totalSlots} filled
                </Text>
              </Group>
              <Progress value={fillPct} size="sm" />
              <Text size="xs" c="dimmed" lineClamp={1}>
                needs {needs.slice(0, 4).join(", ") || "nothing"}
                {needs.length > 4 ? ` +${needs.length - 4}` : ""}
              </Text>
              {expandedTeamIds.has(team._id) && (
                <Stack gap={4} mt="xs">
                  {slots.map((slot) => {
                    const pick = bySlot.get(slot.key);
                    const player = pick ? nameByFpid.get(pick.fpid) : undefined;
                    return (
                      <Group key={slot.key} justify="space-between" gap="xs">
                        <Badge variant="light" size="sm">
                          {slot.label}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {player?.name ?? "—"}
                          {pick ? ` · $${pick.price}` : ""}
                        </Text>
                      </Group>
                    );
                  })}
                </Stack>
              )}
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
