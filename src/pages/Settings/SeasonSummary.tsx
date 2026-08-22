import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Card, Group, Progress, SimpleGrid, Stack, Text } from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  computeTeamBudgetStats,
  resolveTeamSalaryCap,
} from "../../lib/teamBudget";
import { expandRosterSlots } from "../../lib/rosterSlots";
import { optimalAssignPicksToSlots } from "../../lib/slotAssignment";
import { WEEK } from "../../constants/general";
import { TeamSlotDetail } from "../../components/TeamSlotDetail";
import { PlayerDetailModal } from "../../components/PlayerDetailModal";
import { scoringConfigFromSeason } from "../../lib/relevantPlayers";

interface SeasonSummaryProps {
  seasonId: Id<"seasons">;
}

// Read-only per-team roster/spend breakdown for a past season - the same
// reconstruction LeagueTab.tsx uses for the live draft (expandRosterSlots +
// optimalAssignPicksToSlots + computeTeamBudgetStats), just pointed at a
// historical seasonId with no mutation affordances (no Remove/Edit/keeper-add).
export function SeasonSummary({ seasonId }: SeasonSummaryProps) {
  const settingsList = useQuery(api.leagues.listSeasons, {});
  const settings = settingsList?.find((s) => s._id === seasonId);
  const teams = useQuery(api.draft.teams.listSeasonTeams, { seasonId });
  const picks = useQuery(api.draft.picks.listDraftPicks, { seasonId });
  const allProjections = useQuery(api.projections.getAllProjections, {
    week: WEEK,
  });
  const draftValues = useQuery(
    api.draftValues.getDraftValues,
    settings
      ? {
          seasonId,
          week: WEEK,
          scoringConfig: scoringConfigFromSeason(settings),
        }
      : "skip",
  );
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedFpid, setSelectedFpid] = useState<number | null>(null);

  const nameByFpid = useMemo(() => {
    const map = new Map<number, { name: string; team: string | null }>();
    for (const row of allProjections ?? []) map.set(row.fpid, row);
    return map;
  }, [allProjections]);

  const pointsByFpid = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of draftValues?.values ?? []) {
      map.set(row.fpid, row.points);
    }
    return map;
  }, [draftValues]);

  const teamSummaries = useMemo(() => {
    if (!settings || !picks || !teams) return [];
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
      const bySlot = optimalAssignPicksToSlots(
        teamPicks,
        settings.rosterSlots,
        settings.flexPositions,
        settings.superflexPositions,
        pointsByFpid,
      );
      return { team, teamPicks, stats, slots, bySlot };
    });
  }, [teams, settings, picks, pointsByFpid]);

  const toggleExpanded = (teamId: string) => {
    setExpandedTeamIds((current) => {
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  if (!settings || !teams || !picks) return null;

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {settings.name} · {settings.year} - ${settings.salaryCap} cap,{" "}
        {settings.teamCount} teams
      </Text>
      <SimpleGrid cols={3} spacing="md">
        {teamSummaries.map(({ team, stats, teamPicks, slots, bySlot }) => {
          const fillPct = slots.length
            ? (teamPicks.length / slots.length) * 100
            : 0;
          return (
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
                  <Text fw={700}>${stats.spent}</Text>
                </Group>
                <Text size="xs" c="dimmed">
                  {teamPicks.length}/{stats.totalSlots} filled
                </Text>
                <Progress value={fillPct} size="sm" />
                {expandedTeamIds.has(team._id) && (
                  <TeamSlotDetail
                    slots={slots}
                    bySlot={bySlot}
                    nameByFpid={nameByFpid}
                    onSelectPlayer={setSelectedFpid}
                    trackConsecutiveYears={
                      settings.keeperRules?.maxConsecutiveYears !== undefined
                    }
                  />
                )}
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>

      <PlayerDetailModal
        fpid={selectedFpid}
        onClose={() => setSelectedFpid(null)}
        week={WEEK}
        scoringConfig={scoringConfigFromSeason(settings)}
        season={settings.year}
        seasonId={undefined}
      />
    </Stack>
  );
}
