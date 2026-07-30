import { useMemo } from "react";
import { useQuery } from "convex/react";
import {
  Badge,
  Card,
  Center,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { computeTeamBudgetStats } from "../../lib/teamBudget";
import { expandRosterSlots } from "../../lib/rosterSlots";
import { assignPicksToSlots } from "../../lib/slotAssignment";
import { positionColorOrGray, POSITION_COLORS } from "../../lib/positionColors";
import { WEEK } from "../../constants/general";
import { ColorSchemeToggle } from "../../components/ColorSchemeToggle";
import BudgetStats from "./BudgetStats";

interface DraftBoardProps {
  draftSettingsId: Id<"draftSettings">;
}

// Read-only, TV/projector-friendly view of every team's roster - meant to be
// opened in its own tab on a second screen while the host runs the actual
// draft elsewhere (see the "TV Board" link in draft/$leagueId/route.tsx), so
// it deliberately shows only what's already public knowledge in a live
// auction: drafted players, prices paid, and each team's remaining
// budget/max bid (every bidder needs to see max bids to bid validly). It
// never reads this app's own analysis - no $ values (draftValues.ts), ADP,
// target/avoid tags (draftPlayerTags), or budget plans - since those are the
// host's private prep, not something to broadcast to the room.
export function DraftBoard({ draftSettingsId }: DraftBoardProps) {
  const settingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const settings = settingsList?.find((s) => s._id === draftSettingsId);
  const teams = useQuery(api.draft.teams.listDraftTeams, { draftSettingsId });
  const picks = useQuery(api.draft.picks.listDraftPicks, { draftSettingsId });
  const activeNomination = useQuery(api.draft.picks.getActiveNomination, {
    draftSettingsId,
  });
  const currentNominator = useQuery(
    api.draft.nominationOrder.getCurrentNominator,
    settings?.nominationOrder ? { draftSettingsId } : "skip",
  );
  const allProjections = useQuery(api.projections.getAllProjections, {
    week: WEEK,
  });

  const nameByFpid = useMemo(() => {
    const map = new Map<number, { name: string; team: string | null }>();
    for (const row of allProjections ?? []) map.set(row.fpid, row);
    return map;
  }, [allProjections]);

  const teamSummaries = useMemo(() => {
    if (!settings || !teams || !picks) return [];
    return [...teams]
      .sort((a, b) => a.order - b.order)
      .map((team) => {
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
        return { team, stats, slots, bySlot };
      });
  }, [settings, teams, picks]);

  const nominatingTeam = teams?.find(
    (team) => team._id === activeNomination?.nominatingTeamId,
  );
  const turnTeam = teams?.find(
    (team) => team._id === currentNominator?.currentTeamId,
  );
  // Whichever team the nominator indicator (below) is currently pointing
  // at - nominatingTeam while a player's up for bids, turnTeam once it's
  // resolved/passed and the board is waiting on the next nomination.
  const highlightedTeamId = activeNomination
    ? nominatingTeam?._id
    : turnTeam?._id;
  // Always exactly 2 rows, however many teams there are - this page is
  // built for a TV/projector, so a fixed (not viewport-responsive) column
  // count that guarantees everyone's roster is visible without scrolling
  // matters more here than reflowing nicely on a narrow screen.
  const boardCols = Math.max(1, Math.ceil(teamSummaries.length / 2));

  if (!settings || !teams || !picks) {
    return (
      <Center h="100vh">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Stack gap="lg" p="lg">
      <Group justify="space-between" align="center" wrap="wrap">
        <Group>
          <Title order={2}>{settings.name}</Title>
          <Group gap="xs" wrap="wrap">
            {activeNomination && nominatingTeam && (
              <Badge size="xl" radius="md" variant="light" color="yellow">
                Nominated by {nominatingTeam.name}
              </Badge>
            )}
            {!activeNomination && turnTeam && (
              <Badge size="xl" radius="md" variant="light" color="yellow">
                {turnTeam.name} is nominating
              </Badge>
            )}
            {activeNomination && (
              <Badge
                size="xl"
                radius="md"
                variant="light"
                color={`${POSITION_COLORS[activeNomination.position]}`}
              >
                On the block:{" "}
                {nameByFpid.get(activeNomination.fpid)?.name ??
                  `#${activeNomination.fpid}`}{" "}
                ({activeNomination.position})
              </Badge>
            )}
          </Group>
        </Group>
        <ColorSchemeToggle />
      </Group>
      <SimpleGrid cols={boardCols} spacing="md">
        {teamSummaries.map(({ team, stats, slots, bySlot }, index) => (
          <Card
            key={team._id}
            withBorder
            padding="xs"
            bd={
              team._id === highlightedTeamId
                ? "3px solid var(--mantine-color-blue-7)"
                : undefined
            }
            shadow={
              team._id === highlightedTeamId
                ? "0px 0px 15px 5px rgba(0, 0, 255, 0.05)"
                : "inherit"
            }
          >
            <Stack gap={6} w="100%" bg="saddlebrown">
              {index + 1 > boardCols && (
                <BudgetStats stats={stats} position="top" />
              )}
              <Text fw={700} size="lg">
                {team.name}
              </Text>
              <Table verticalSpacing={4} fz="sm">
                <Table.Tbody>
                  {slots.map((slot) => {
                    const pick = bySlot.get(slot.key);
                    const player = pick ? nameByFpid.get(pick.fpid) : undefined;
                    return (
                      <Table.Tr key={slot.key}>
                        <Table.Td w={65}>
                          <Badge
                            size="sm"
                            variant="light"
                            color={positionColorOrGray(slot.position)}
                          >
                            {slot.label}
                          </Badge>
                        </Table.Td>
                        <Table.Td w="calc(100% - 169px)">
                          <Text truncate size="xs">
                            {player?.name ?? "-"}
                          </Text>
                        </Table.Td>
                        <Table.Td ta="right" w={44}>
                          <Text size="xs">{pick ? `$${pick.price}` : ""}</Text>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
              {index < boardCols && (
                <BudgetStats stats={stats} position="bottom" />
              )}
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
