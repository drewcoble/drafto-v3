import { useMemo } from "react";
import {
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import type { Position } from "../../../types";
import { POSITION_COLORS } from "../../../lib/positionColors";
import {
  computeKeeperCost,
  formulaForFpid,
  prospectiveKeeperStreak,
  type KeeperPriceHistoryEntry,
  type KeeperRules,
} from "../../../lib/keeperCost";

interface ProjectionRow {
  fpid: number;
  name: string;
  position: Position;
  team: string | null;
}

interface RecommendedKeepersProps {
  priceHistory: Record<number, KeeperPriceHistoryEntry> | undefined;
  keeperRules: KeeperRules | undefined;
  draftValueByFpid: Map<number, { dollarValue: number }>;
  allProjections: ProjectionRow[] | undefined;
  activePositions: readonly Position[];
  draftedFpids: Set<number>;
  // Adds the keeper outright at the suggested cost - team is resolved by
  // the caller (KeepersTab.tsx) from `teamName` below when it's set
  // (a confirmed manual-entry roster - see getPlayerPriceHistory), falling
  // back to whatever team is otherwise selected.
  onQuickAdd: (
    fpid: number,
    position: Position,
    price: number,
    teamName: string | undefined,
  ) => void;
  onSelectPlayer: (fpid: number) => void;
  onOpenManualEntry: () => void;
}

const MAX_RECOMMENDATIONS = 10;

// Surfaces the league's best keeper bargains (this year's fair value minus
// what the keeper-cost formula would charge to keep them) so a host doesn't
// have to manually search every name from last year's draft to find one.
// Deliberately team-less - getPlayerPriceHistory only tells us the PRICE a
// player went for last season, not which of THIS season's teams (if any)
// still has them on a roster, so this can only ever suggest "this would be
// a great keeper for someone," never "for your team specifically." Clicking
// a row just drops the name into the search box above so the host can pick
// it up through the normal add-a-keeper flow (team + confirm cost).
export function RecommendedKeepers({
  priceHistory,
  keeperRules,
  draftValueByFpid,
  allProjections,
  activePositions,
  draftedFpids,
  onQuickAdd,
  onSelectPlayer,
  onOpenManualEntry,
}: RecommendedKeepersProps) {
  const recommendations = useMemo(() => {
    if (!priceHistory || !keeperRules || !allProjections) return [];
    const projectionByFpid = new Map(
      allProjections.map((row) => [row.fpid, row]),
    );
    const activeSet = new Set(activePositions);

    const rows = Object.entries(priceHistory)
      .map(([fpidStr, entry]) => {
        const fpid = Number(fpidStr);
        const player = projectionByFpid.get(fpid);
        if (!player || !activeSet.has(player.position)) return null;
        if (draftedFpids.has(fpid)) return null;

        const fairValue = draftValueByFpid.get(fpid)?.dollarValue;
        if (fairValue === undefined) return null;

        if (keeperRules.maxConsecutiveYears !== undefined) {
          const streak = prospectiveKeeperStreak(entry);
          if (streak > keeperRules.maxConsecutiveYears) return null;
        }

        const formula = formulaForFpid(keeperRules, fpid, player.position);
        const keeperCost = computeKeeperCost(formula, entry.price);
        if (keeperCost === null) return null;

        const savings = fairValue - keeperCost;
        if (savings <= 0) return null;

        return {
          player,
          keeperCost,
          fairValue,
          savings,
          teamName: entry.teamName,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.savings - a.savings)
      .slice(0, MAX_RECOMMENDATIONS);

    return rows;
  }, [
    priceHistory,
    keeperRules,
    allProjections,
    activePositions,
    draftedFpids,
    draftValueByFpid,
  ]);

  // No prior-season price data at all (no import, no manual entry) - prompt
  // for manual entry instead of a bare table with nothing to show, since
  // there's a concrete action available (unlike "no strong keeper values
  // found" below, which just means the data exists but nothing cleared the
  // savings bar).
  if (!priceHistory || Object.keys(priceHistory).length === 0) {
    return (
      <Card withBorder padding="md">
        <Stack gap="sm">
          <Text size="sm" fw={500}>
            Recommended Keepers
          </Text>
          <Text size="xs" c="dimmed">
            No previous season data on file yet, so there's nothing to base a
            keeper suggestion on. Enter last season's results by hand to get
            started.
          </Text>
          <Button
            variant="light"
            size="xs"
            onClick={onOpenManualEntry}
            style={{ alignSelf: "flex-start" }}
          >
            Add last season's results
          </Button>
        </Stack>
      </Card>
    );
  }

  return (
    <Card withBorder padding="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm" fw={500}>
            Recommended Keepers
          </Text>
          <Anchor
            component="button"
            type="button"
            size="xs"
            onClick={onOpenManualEntry}
          >
            Edit last season's results
          </Anchor>
        </Group>
        {!keeperRules ? (
          <Text size="xs" c="dimmed">
            Configure keeper rules to see recommended keepers.
          </Text>
        ) : recommendations.length === 0 ? (
          <Text size="xs" c="dimmed">
            No strong keeper values found.
          </Text>
        ) : (
          <>
            <Text size="xs" c="dimmed">
              Best value vs. this year's fair price, based on last season's cost
              - team-less, since last season's draft doesn't tell us who still
              has them.
            </Text>
            <Table.ScrollContainer minWidth={420}>
              <Table verticalSpacing={4}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Player</Table.Th>
                    <Table.Th ta="right">Keeper Cost</Table.Th>
                    <Table.Th ta="right">Fair Value</Table.Th>
                    <Table.Th ta="right">Savings</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {recommendations.map(
                    ({ player, keeperCost, fairValue, savings, teamName }) => (
                      <Table.Tr key={player.fpid}>
                        <Table.Td>
                          <Group gap={6} wrap="nowrap">
                            <Badge
                              size="sm"
                              variant="light"
                              color={POSITION_COLORS[player.position]}
                            >
                              {player.position}
                            </Badge>
                            <Anchor
                              component="button"
                              type="button"
                              size="sm"
                              onClick={() => onSelectPlayer(player.fpid)}
                            >
                              {player.name}
                            </Anchor>
                            {player.team && (
                              <Text size="xs" c="dimmed">
                                {player.team}
                              </Text>
                            )}
                          </Group>
                          {teamName && (
                            <Text size="xs" c="dimmed">
                              Likely on: {teamName}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td ta="right">${keeperCost}</Table.Td>
                        <Table.Td ta="right">${Math.round(fairValue)}</Table.Td>
                        <Table.Td ta="right">
                          <Group gap={6} justify="flex-end" wrap="nowrap">
                            <Text size="sm" fw={600} c="teal">
                              +${Math.round(savings)}
                            </Text>
                            <Anchor
                              component="button"
                              type="button"
                              size="xs"
                              onClick={() =>
                                onQuickAdd(
                                  player.fpid,
                                  player.position,
                                  keeperCost,
                                  teamName,
                                )
                              }
                            >
                              Add
                            </Anchor>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ),
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </>
        )}
      </Stack>
    </Card>
  );
}
