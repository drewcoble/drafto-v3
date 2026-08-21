import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Anchor,
  Badge,
  Box,
  Card,
  Center,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { RadarChart } from "@mantine/charts";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { POSITION_COLORS } from "../../lib/positionColors";
import { consistencyColor } from "../../lib/consistency";
import {
  buildLeagueSummary,
  buildTeamSummary,
  rankDescriptor,
  type PickRow,
  type RosterAward,
  type TeamCard,
} from "../../lib/reportCardSummary";
import { PlayerDetailModal } from "../../components/PlayerDetailModal";
import { RookieBadge } from "../../components/RookieBadge";
import { UpgradePrompt } from "../../components/UpgradePrompt";
import { scoringConfigFromSeason } from "../../lib/relevantPlayers";
import { WEEK } from "../../constants/general";
import { useRookieFpids } from "../../hooks/useRookieFpids";

interface DraftReportCardProps {
  seasonId: Id<"seasons">;
}

function formatSigned(amount: number): string {
  return amount >= 0 ? `+$${amount.toFixed(0)}` : `-$${Math.abs(amount).toFixed(0)}`;
}

function surplusColor(amount: number): string {
  return amount > 0 ? "green" : amount < 0 ? "red" : "inherit";
}

// Only three bands, reusing colors already in the theme (green/gold/red -
// see theme.ts) rather than inventing a new ramp for a one-page feature:
// green for the top half of grades, gold for the middle, red for the
// bottom - mirrors the same green/red "beat the market" convention
// DraftTopBar's Budget +/- stat already uses.
function gradeColor(gradeScore: number): string {
  if (gradeScore >= 70) return "green";
  if (gradeScore >= 40) return "gold";
  return "red";
}

export function DraftReportCard({ seasonId }: DraftReportCardProps) {
  const settingsList = useQuery(api.leagues.listSeasons, {});
  const settings = settingsList?.find((s) => s._id === seasonId);
  const report = useQuery(
    api.draft.reportCard.getDraftReportCard,
    settings
      ? { seasonId, week: WEEK, scoringConfig: scoringConfigFromSeason(settings) }
      : "skip",
  );
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedFpid, setSelectedFpid] = useState<number | null>(null);
  const rookieFpids = useRookieFpids();

  const ensureSummaryGenerated = useMutation(
    api.draft.reportCard.ensureReportSummaryGenerated,
  );
  const regenerateSummary = useMutation(
    api.draft.reportCard.regenerateReportSummary,
  );
  const [isRegenerating, setIsRegenerating] = useState(false);
  // Backfills the AI recap for a draft that completed while the owner was
  // still free-tier (convex/draft/status.ts only ever schedules generation
  // once, at the moment the draft completes) - fires once per page view
  // whenever there's no cached recap yet; the mutation itself is a no-op if
  // one's already cached or already being generated, so this is safe to
  // call again on remount. The ref guard is just to avoid re-firing on
  // every re-render while report is settling into "ok".
  const requestedSummaryRef = useRef(false);
  useEffect(() => {
    if (
      report?.status === "ok" &&
      report.data.aiSummary === null &&
      !requestedSummaryRef.current &&
      settings
    ) {
      requestedSummaryRef.current = true;
      void ensureSummaryGenerated({
        seasonId,
        week: WEEK,
        scoringConfig: scoringConfigFromSeason(settings),
      });
    }
  }, [report, settings, seasonId, ensureSummaryGenerated]);

  const handleRegenerate = async () => {
    if (!settings) return;
    setIsRegenerating(true);
    try {
      await regenerateSummary({
        seasonId,
        week: WEEK,
        scoringConfig: scoringConfigFromSeason(settings),
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const toggleExpanded = (teamId: string) => {
    setExpandedTeamIds((current) => {
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  if (settingsList === undefined || (settings && report === undefined)) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  if (!settings) {
    return (
      <Center py="xl">
        <Text c="dimmed">League not found.</Text>
      </Center>
    );
  }

  if (!report) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  if (report.status === "not_ready") {
    return (
      <Center py="xl">
        <Text c="dimmed">
          Report card will be available once the draft is complete.
        </Text>
      </Center>
    );
  }

  if (report.status === "requires_upgrade") {
    return <ReportCardTeaser />;
  }

  const data = report.data;
  const teams = [...data.teams].sort((a, b) => b.gradeScore - a.gradeScore);

  return (
    <Stack gap="lg">
      <Card withBorder padding="md">
        <Stack gap={4}>
          <Title order={4}>Recap</Title>
          <Text size="sm">{data.aiSummary ?? buildLeagueSummary(data)}</Text>
          {data.aiSummary && (
            <Group gap={6}>
              <Text size="xs" c="dimmed">
                AI-written recap
              </Text>
              <Anchor
                size="xs"
                c="dimmed"
                onClick={handleRegenerate}
                style={{ pointerEvents: isRegenerating ? "none" : undefined }}
              >
                {isRegenerating ? "Regenerating…" : "Regenerate"}
              </Anchor>
            </Group>
          )}
        </Stack>
      </Card>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <PickCallouts
          title="Biggest Steals"
          picks={data.leagueSteals}
          onSelectPlayer={setSelectedFpid}
          rookieFpids={rookieFpids}
        />
        <PickCallouts
          title="Biggest Reaches"
          picks={data.leagueReaches}
          onSelectPlayer={setSelectedFpid}
          rookieFpids={rookieFpids}
        />
      </SimpleGrid>

      {(data.leagueBestKeepers.length > 0 ||
        data.leagueWorstKeepers.length > 0) && (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <PickCallouts
            title="Best Keeper Value"
            picks={data.leagueBestKeepers}
            onSelectPlayer={setSelectedFpid}
            getValue={(pick) => pick.keeperEstimatedValue}
            getSurplus={(pick) => pick.keeperSurplus}
            rookieFpids={rookieFpids}
          />
          <PickCallouts
            title="Worst Keeper Value"
            picks={data.leagueWorstKeepers}
            onSelectPlayer={setSelectedFpid}
            getValue={(pick) => pick.keeperEstimatedValue}
            getSurplus={(pick) => pick.keeperSurplus}
            rookieFpids={rookieFpids}
          />
        </SimpleGrid>
      )}

      {(data.mostReliableRoster || data.mostVolatileRoster) && (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <RosterAwardCard
            title="Most Reliable Roster"
            subtitle="high, steady scorers from last season"
            award={data.mostReliableRoster}
            color="green"
          />
          <RosterAwardCard
            title="Most Volatile Roster"
            subtitle="highest-upside boom/bust scorers from last season"
            award={data.mostVolatileRoster}
            color="orange"
          />
        </SimpleGrid>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
        {teams.map((team) => (
          <TeamReportCard
            key={team.teamId}
            team={team}
            totalTeams={teams.length}
            expanded={expandedTeamIds.has(team.teamId)}
            onToggle={() => toggleExpanded(team.teamId)}
            onSelectPlayer={setSelectedFpid}
            rookieFpids={rookieFpids}
          />
        ))}
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

const TEASER_TEAMS: Array<{ name: string; letter: string }> = [
  { name: "The Dynasty", letter: "A+" },
  { name: "Waiver Wire Warriors", letter: "B" },
  { name: "Auto-Draft Army", letter: "C+" },
  { name: "Bench Points FC", letter: "A-" },
  { name: "Trade Deadline Special", letter: "B-" },
  { name: "Injury Prone", letter: "D" },
];

// Free-tier empty state for the Report Card - a blurred, non-interactive
// mock of the real layout (see the "ok" branch below) with the upgrade
// callout centered on top, so a free owner sees the shape of what they're
// missing rather than a plain "upgrade to Pro" message. Team names/grades
// here are fixed placeholders, not this league's real data - the whole
// point is this renders even though the real data was withheld server-side
// (getDraftReportCard never sends numeric stats to a non-Pro caller).
function ReportCardTeaser() {
  return (
    <Box pos="relative">
      <Box
        style={{ filter: "blur(6px)", pointerEvents: "none", userSelect: "none" }}
        aria-hidden
      >
        <Stack gap="lg">
          <Card withBorder padding="md">
            <Stack gap={4}>
              <Title order={4}>Recap</Title>
              <Text size="sm">
                The Dynasty takes the top grade of the draft with an A+. The
                steal of the draft: Auto-Draft Army landed a star well under
                market value, while Injury Prone paid a premium across the
                board.
              </Text>
            </Stack>
          </Card>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {TEASER_TEAMS.map((team) => (
              <Card key={team.name} withBorder padding="md">
                <Stack gap={6}>
                  <Group justify="space-between">
                    <Text fw={700}>{team.name}</Text>
                    <Badge color="gray" size="lg">
                      {team.letter}
                    </Badge>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Value surplus
                    </Text>
                    <Text size="sm" fw={700}>
                      +$24
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text size="sm" c="dimmed">
                      Points above replacement
                    </Text>
                    <Text size="sm">312</Text>
                  </Group>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        </Stack>
      </Box>
      <Box pos="absolute" inset={0} style={{ display: "flex" }}>
        <UpgradePrompt title="Report Card is a Pro feature" />
      </Box>
    </Box>
  );
}

function PickCallouts({
  title,
  picks,
  onSelectPlayer,
  getValue = (pick) => pick.dollarValue,
  getSurplus = (pick) => pick.surplus,
  rookieFpids,
}: {
  title: string;
  picks: PickRow[];
  onSelectPlayer: (fpid: number) => void;
  // Defaults to real auction dollarValue/surplus - overridden for the
  // keeper-value callouts, which have no real market value and instead
  // compare price against an interpolated keeperEstimatedValue.
  getValue?: (pick: PickRow) => number | null;
  getSurplus?: (pick: PickRow) => number | null;
  rookieFpids: Set<number>;
}) {
  return (
    <Card withBorder padding="md">
      <Stack gap="xs">
        <Title order={5}>{title}</Title>
        {picks.length === 0 && (
          <Text size="sm" c="dimmed">
            Not enough data yet.
          </Text>
        )}
        {picks.map((pick) => {
          const value = getValue(pick);
          const surplus = getSurplus(pick);
          return (
            <Group key={pick.pickId} justify="space-between" wrap="nowrap">
              <Group gap={6} wrap="nowrap">
                <Badge color={POSITION_COLORS[pick.position]} size="sm">
                  {pick.position}
                </Badge>
                <Text
                  size="sm"
                  style={{ cursor: "pointer" }}
                  onClick={() => onSelectPlayer(pick.fpid)}
                >
                  {pick.name}
                </Text>
                {rookieFpids.has(pick.fpid) && <RookieBadge />}
              </Group>
              <Group gap={6} wrap="nowrap">
                <Text size="sm" c="dimmed">
                  ${pick.price} vs ${(value ?? 0).toFixed(0)}
                </Text>
                <Text size="sm" fw={700} c={surplusColor(surplus ?? 0)}>
                  {formatSigned(surplus ?? 0)}
                </Text>
              </Group>
            </Group>
          );
        })}
      </Stack>
    </Card>
  );
}

function RosterAwardCard({
  title,
  subtitle,
  award,
  color,
}: {
  title: string;
  subtitle: string;
  award: RosterAward | null;
  color: string;
}) {
  return (
    <Card withBorder padding="md">
      <Stack gap={4}>
        <Title order={5}>{title}</Title>
        <Text size="xs" c="dimmed">
          {subtitle}
        </Text>
        {award ? (
          <Group justify="space-between" mt={4}>
            <Text fw={700}>{award.teamName}</Text>
            <Badge color={color} size="lg">
              {award.count}
            </Badge>
          </Group>
        ) : (
          <Text size="sm" c="dimmed" mt={4}>
            Not enough prior-season data yet.
          </Text>
        )}
      </Stack>
    </Card>
  );
}

// Per-team positional strength, starters only (no bench) - each axis is a
// league-wide 1-indexed rank (1 = best) for that category's starters, so
// the polygon's shape shows where a team is strong/weak relative to the
// rest of the league rather than an absolute point total. QB folds in
// SUPERFLEX and FLEX stays its own axis - see StarterCategory in
// convex/draft/lineupOptimizer.ts for why.
function PositionalRadarChart({
  team,
  totalTeams,
}: {
  team: TeamCard;
  totalTeams: number;
}) {
  // Nothing to rank against with 0-1 other teams.
  if (totalTeams <= 1 || team.positionalRanks.length === 0) return null;

  const data = team.positionalRanks.map(({ category, rank }) => ({
    category,
    rank,
  }));

  return (
    <RadarChart
      h={200}
      data={data}
      dataKey="category"
      series={[{ name: "rank", color: gradeColor(team.gradeScore) }]}
      withPolarRadiusAxis
      polarRadiusAxisProps={{
        domain: [1, totalTeams],
        reversed: true,
        tick: false,
        axisLine: false,
        tickLine: false,
      }}
      withTooltip
      tooltipProps={{
        content: (props) => {
          const entry = props.active ? props.payload?.[0] : undefined;
          if (!entry) return null;
          const point = entry.payload as {
            category: string;
            rank: number;
          };
          return (
            <Paper withBorder shadow="sm" p="xs">
              <Text size="sm" fw={700}>
                {point.category}
              </Text>
              <Text size="xs" c="dimmed">
                {rankDescriptor(point.rank, totalTeams)} in the league
              </Text>
            </Paper>
          );
        },
      }}
    />
  );
}

function TeamReportCard({
  team,
  totalTeams,
  expanded,
  onToggle,
  onSelectPlayer,
  rookieFpids,
}: {
  team: TeamCard;
  totalTeams: number;
  expanded: boolean;
  onToggle: () => void;
  onSelectPlayer: (fpid: number) => void;
  rookieFpids: Set<number>;
}) {
  return (
    <Card
      withBorder
      padding="md"
      onClick={onToggle}
      style={{ cursor: "pointer" }}
    >
      <Stack gap={6}>
        <Group justify="space-between">
          <Text fw={700}>
            {team.teamName}
            {team.isSelf ? " (you)" : ""}
          </Text>
          <Badge color={gradeColor(team.gradeScore)} size="lg">
            {team.letter}
          </Badge>
        </Group>
        <Text size="sm">{team.aiSummary ?? buildTeamSummary(team, totalTeams)}</Text>
        <PositionalRadarChart team={team} totalTeams={totalTeams} />
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Value surplus
          </Text>
          <Text size="sm" fw={700} c={surplusColor(team.surplusTotal)}>
            {formatSigned(team.surplusTotal)}
          </Text>
        </Group>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            Points above replacement
          </Text>
          <Text size="sm">{team.vorTotal.toFixed(0)}</Text>
        </Group>
        <Group justify="space-between">
          <Text size="sm" c="dimmed">
            $ / VOR point
          </Text>
          <Text size="sm">
            {team.efficiencyDollarsPerVor === null
              ? "—"
              : `$${team.efficiencyDollarsPerVor.toFixed(2)}`}
          </Text>
        </Group>
        {team.bestPick && (
          <Text size="xs" c="dimmed">
            Best pick: {team.bestPick.name} ({formatSigned(team.bestPick.surplus ?? 0)})
          </Text>
        )}
        {team.worstPick && (
          <Text size="xs" c="dimmed">
            Worst pick: {team.worstPick.name} ({formatSigned(team.worstPick.surplus ?? 0)})
          </Text>
        )}
        {team.bestKeeper && (
          <Text size="xs" c="dimmed">
            Best keeper: {team.bestKeeper.name} (
            {formatSigned(team.bestKeeper.keeperSurplus ?? 0)})
          </Text>
        )}
        {team.worstKeeper && (
          <Text size="xs" c="dimmed">
            Worst keeper: {team.worstKeeper.name} (
            {formatSigned(team.worstKeeper.keeperSurplus ?? 0)})
          </Text>
        )}

        {expanded && (
          <Table
            withRowBorders={false}
            fz="xs"
            mt="xs"
            onClick={(e) => e.stopPropagation()}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Player</Table.Th>
                <Table.Th>Price</Table.Th>
                <Table.Th>Value</Table.Th>
                <Table.Th>Surplus</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[...team.picks]
                .sort((a, b) => a.sequence - b.sequence)
                .map((pick) => {
                  // Keepers have no real dollarValue - fall back to the
                  // interpolated keeper estimate so the table isn't just
                  // dashes for every kept player.
                  const value = pick.dollarValue ?? pick.keeperEstimatedValue;
                  const surplus = pick.surplus ?? pick.keeperSurplus;
                  return (
                    <Table.Tr key={pick.pickId}>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          <Badge
                            color={POSITION_COLORS[pick.position]}
                            size="xs"
                          >
                            {pick.position}
                          </Badge>
                          <Text
                            size="xs"
                            style={{ cursor: "pointer" }}
                            onClick={() => onSelectPlayer(pick.fpid)}
                          >
                            {pick.name}
                            {pick.isKeeper ? " (K)" : ""}
                          </Text>
                          {rookieFpids.has(pick.fpid) && <RookieBadge />}
                          {pick.consistencyLabel && (
                            <Badge
                              color={consistencyColor(pick.consistencyLabel)}
                              size="xs"
                              variant="light"
                            >
                              {pick.consistencyLabel}
                            </Badge>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>${pick.price}</Table.Td>
                      <Table.Td>
                        {value === null ? "—" : `$${value.toFixed(0)}`}
                      </Table.Td>
                      <Table.Td c={surplusColor(surplus ?? 0)}>
                        {surplus === null ? "—" : formatSigned(surplus)}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Card>
  );
}
