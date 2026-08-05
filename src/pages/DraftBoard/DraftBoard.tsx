import {
  Badge,
  Card,
  Center,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ColorSchemeToggle } from "../../components/ColorSchemeToggle";
import { WEEK } from "../../constants/general";
import { POSITION_COLORS, positionColorOrGray } from "../../lib/positionColors";
import { expandRosterSlots } from "../../lib/rosterSlots";
import { assignPicksToSlots } from "../../lib/slotAssignment";
import {
  computeTeamBudgetStats,
  resolveTeamSalaryCap,
} from "../../lib/teamBudget";
import BudgetStats from "./BudgetStats";

interface DraftBoardProps {
  seasonId: Id<"seasons">;
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
export function DraftBoard({ seasonId }: DraftBoardProps) {
  const settingsList = useQuery(api.leagues.listSeasons, {});
  const settings = settingsList?.find((s) => s._id === seasonId);
  const teams = useQuery(api.draft.teams.listSeasonTeams, { seasonId });
  const picks = useQuery(api.draft.picks.listDraftPicks, { seasonId });
  const activeNomination = useQuery(api.draft.picks.getActiveNomination, {
    seasonId,
  });
  const nominationConfig = useQuery(
    api.draft.nominationOrder.getNominationConfig,
    { seasonId },
  );
  const currentNominator = useQuery(
    api.draft.nominationOrder.getCurrentNominator,
    nominationConfig?.nominationOrder ? { seasonId } : "skip",
  );
  const allProjections = useQuery(api.projections.getAllProjections, {
    week: WEEK,
  });

  const playerByFpid = useMemo(() => {
    const map = new Map<number, { name: string; team: string | null }>();
    for (const row of allProjections ?? []) map.set(row.fpid, row);
    return map;
  }, [allProjections]);

  const teamSummaries = useMemo(() => {
    if (!settings || !teams || !picks) return [];
    // Nomination order (when configured) takes precedence over each team's
    // static `order` field - the board should read left-to-right/top-to-
    // bottom in the order teams will actually nominate in, not whatever
    // order they were added to the league. Teams somehow missing from
    // nominationOrder (shouldn't normally happen - see
    // convex/draft/nominationOrder.ts) fall back to `order` as a tiebreak
    // and sort after every team that is listed.
    const nominationOrderIndex = new Map(
      (nominationConfig?.nominationOrder ?? []).map((teamId, index) => [
        teamId,
        index,
      ]),
    );
    return [...teams]
      .sort((a, b) => {
        if (nominationOrderIndex.size > 0) {
          const aIndex = nominationOrderIndex.get(a._id) ?? Infinity;
          const bIndex = nominationOrderIndex.get(b._id) ?? Infinity;
          if (aIndex !== bIndex) return aIndex - bIndex;
        }
        return a.order - b.order;
      })
      .map((team) => {
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
        return { team, stats, slots, bySlot };
      });
  }, [settings, teams, picks, nominationConfig]);

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
              <Badge size="xl" radius="md" variant="light" color="burlywood">
                {nominatingTeam.name} nominated
              </Badge>
            )}
            {!activeNomination && turnTeam && (
              <Badge
                size="xl"
                radius="md"
                variant="light"
                color="saddlebrown.6"
              >
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
                {playerByFpid.get(activeNomination.fpid)?.name ??
                  `#${activeNomination.fpid}`}{" "}
                ({activeNomination.position}) -{" "}
                {playerByFpid.get(activeNomination.fpid)?.team}
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
            radius="lg"
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
            <Stack gap={6}>
              <Text fw={700} size="lg">
                {team.name}
              </Text>
              {index + 1 > boardCols && (
                <BudgetStats stats={stats} position="top" />
              )}

              {slots.map((slot) => {
                const pick = bySlot.get(slot.key);
                const player = pick ? playerByFpid.get(pick.fpid) : undefined;
                return (
                  <>
                    <Group gap={10} w="100%" justify="space-between">
                      <Badge
                        size="sm"
                        variant="light"
                        color={positionColorOrGray(slot.position)}
                        w={65}
                      >
                        {slot.label}
                      </Badge>
                      <Text truncate size="sm" ta="left" w="calc(100% - 155px)">
                        {player?.name ?? "-"}
                      </Text>
                      {pick?.isKeeper && (
                        <Badge size="sm" variant="light" color="gray" w={30}>
                          K{pick.keeperStreak ?? 1}
                        </Badge>
                      )}
                      <Text size="sm" ta="right" w={35} fw={600}>
                        {pick ? `$${pick.price}` : ""}
                      </Text>
                    </Group>
                  </>
                );
              })}

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
