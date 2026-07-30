import { ActionIcon, Anchor, Badge, Button, Card, Group, Select, Stack, Text } from "@mantine/core";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type { PlanSlotMatch } from "../../../lib/planRecommendation";
import type { TeamBudgetStats } from "../../../lib/teamBudget";
import { POSITION_COLORS } from "../../../lib/positionColors";

interface NominationCardProps {
  activeNomination: Doc<"draftNominations">;
  nominatedPlayer: { name: string; team: string | null } | undefined;
  nominatedValue: { dollarValue: number } | undefined;
  stats: TeamBudgetStats | undefined;
  planMatch: PlanSlotMatch | undefined;
  teams: Doc<"draftTeams">[];
  winnerTeamId: string | null;
  onWinnerTeamIdChange: (id: string | null) => void;
  actionError: string | null;
  onBumpBid: (delta: number) => void;
  onLogWin: () => void;
  onLogWinner: () => void;
  onPass: () => void;
  onSelectPlayer: (fpid: number) => void;
}

export function NominationCard({
  activeNomination,
  nominatedPlayer,
  nominatedValue,
  stats,
  planMatch,
  teams,
  winnerTeamId,
  onWinnerTeamIdChange,
  actionError,
  onBumpBid,
  onLogWin,
  onLogWinner,
  onPass,
  onSelectPlayer,
}: NominationCardProps) {
  const nominatingTeam = teams.find(
    (team) => team._id === activeNomination.nominatingTeamId,
  );

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            {nominatedPlayer ? (
              <Anchor
                component="button"
                type="button"
                fw={700}
                fz="lg"
                onClick={() => onSelectPlayer(activeNomination.fpid)}
              >
                {nominatedPlayer.name}
              </Anchor>
            ) : (
              <Text fw={700} size="lg">
                Player #{activeNomination.fpid}
              </Text>
            )}
            <Group gap="xs">
              <Badge variant="light" color={POSITION_COLORS[activeNomination.position]}>
                {activeNomination.position}
              </Badge>
              {nominatedPlayer?.team && (
                <Text size="sm" c="dimmed">
                  {nominatedPlayer.team}
                </Text>
              )}
              {nominatingTeam && (
                <Text size="sm" c="dimmed">
                  Nominated by {nominatingTeam.name}
                </Text>
              )}
              {nominatedValue && (
                <Text size="sm" c="dimmed">
                  Fair ~${Math.round(nominatedValue.dollarValue)}
                </Text>
              )}
              {stats?.planSafe !== null && stats?.planSafe !== undefined && (
                <Text size="sm" c="dimmed">
                  Plan-safe max ${Math.max(stats.planSafe, 0)}
                </Text>
              )}
              {planMatch && (
                <Text size="sm" c="dimmed">
                  {planMatch.slotLabel} budget ~${Math.round(planMatch.amount)}
                </Text>
              )}
            </Group>
          </Stack>
          <Group gap="xs" align="center">
            <ActionIcon variant="default" onClick={() => onBumpBid(-1)}>
              −
            </ActionIcon>
            <Text size="xl" fw={700}>
              ${activeNomination.currentBid}
            </Text>
            <ActionIcon variant="default" onClick={() => onBumpBid(1)}>
              +
            </ActionIcon>
          </Group>
        </Group>
        {actionError && (
          <Text c="red" size="sm">
            {actionError}
          </Text>
        )}
        <Group>
          <Button onClick={onLogWin}>
            I won — log at ${activeNomination.currentBid}
          </Button>
          <Select
            placeholder="Someone else won..."
            data={teams
              .filter((team) => !team.isSelf)
              .map((team) => ({ value: team._id, label: team.name }))}
            value={winnerTeamId}
            onChange={onWinnerTeamIdChange}
            w={200}
          />
          <Button variant="default" disabled={!winnerTeamId} onClick={onLogWinner}>
            Log winner
          </Button>
          <Button variant="subtle" color="gray" onClick={onPass}>
            Pass
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
