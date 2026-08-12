import {
  ActionIcon,
  Anchor,
  Badge,
  Group,
  Table,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import {
  Banknote,
  BanknoteArrowDown,
  BatteryLow,
  CircleSlash,
  Crosshair,
  HandCoins,
  Rocket,
  ShieldCheck,
  TrendingDown,
  TrendingUpDown,
  UserRoundPlus,
} from "lucide-react";
import { ICON_SIZE } from "../../../constants/playersLeft";
import {
  consistencyColor,
  type ConsistencyLabel,
} from "../../../lib/consistency";
import type { DraftBoardRow, PlayerTag, ValueGap } from "../../../types";

// Matches the icon choices PlayerBar.tsx/PlayerBarDetails.tsx use for the
// same consistency ratings - kept in sync there rather than imported, same
// duplication convention as the other status icons in this file.
const CONSISTENCY_ICON: Record<ConsistencyLabel, typeof ShieldCheck> = {
  Reliable: ShieldCheck,
  "Boom/Bust": TrendingUpDown,
  "Low Output": BatteryLow,
};

interface PlayerTableRowProps {
  row: DraftBoardRow;
  budgetAmount: number | undefined;
  tag: PlayerTag | undefined;
  valueGap: ValueGap | undefined;
  consistency: ConsistencyLabel | undefined;
  isNominated: boolean;
  hasActiveNomination: boolean;
  // True when this player's $ value fits under the budget for at least one
  // of the team's still-open roster slots eligible for their position (see
  // fitsAnyOpenSlot in lib/planRecommendation.ts) - colors the $ figure
  // green when true, orange when not (only once budgetAmount is defined,
  // i.e. there's an actual plan to compare against).
  budgetMatch: boolean;
  onSetTag: (tag: PlayerTag) => void;
  onNominate: () => void;
  onSelectPlayer: (fpid: number) => void;
}

// Table-view alternative to PlayerBar.tsx for the same DraftBoardRow data -
// same status icons/actions (nominate, target/avoid), but as a plain
// scannable row instead of a cost-proportional bar with the name hidden
// until hover. Toggled via PlayersLeftTab's view switch; consistency here
// intentionally deep-links the same icon/color choices PlayerBar and
// PlayerBarDetails use so a player reads the same way in either view.
export function PlayerTableRow({
  row,
  budgetAmount,
  tag,
  valueGap,
  consistency,
  isNominated,
  hasActiveNomination,
  budgetMatch,
  onSetTag,
  onNominate,
  onSelectPlayer,
}: PlayerTableRowProps) {
  // No color at all until there's actually a budget plan to compare
  // against (budgetAmount undefined) - green/orange only once budgetMatch
  // is a real signal, not a default.
  const priceColor =
    budgetAmount === undefined
      ? "inherit"
      : budgetMatch
        ? "green.6"
        : "orange.6";
  const ConsistencyIcon = consistency
    ? CONSISTENCY_ICON[consistency]
    : undefined;

  return (
    <Table.Tr
      style={
        isNominated
          ? {
              boxShadow: "inset 0 0 0 2px var(--mantine-color-yellow-6)",
              backgroundColor: "var(--mantine-color-yellow-light)",
            }
          : undefined
      }
    >
      <Table.Td>
        <Group gap={4} wrap="nowrap">
          {!hasActiveNomination && (
            <Tooltip label="Nominate" withArrow>
              <ActionIcon
                variant="light"
                size={40}
                onClick={onNominate}
                aria-label="Nominate"
              >
                <UserRoundPlus size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Target" withArrow>
            <ActionIcon
              variant={tag === "target" ? "light" : "subtle"}
              color="green"
              size={40}
              onClick={() => onSetTag("target")}
              aria-label="Target"
            >
              <Crosshair size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Avoid" withArrow>
            <ActionIcon
              variant={tag === "avoid" ? "light" : "subtle"}
              color="red"
              size={40}
              onClick={() => onSetTag("avoid")}
              aria-label="Avoid"
            >
              <CircleSlash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
      <Table.Td>
        <Group gap={4} wrap="nowrap">
          {isNominated && (
            <Tooltip label="Currently up for bids" withArrow>
              <ThemeIcon size="sm" bg="yellow.6" c="dark.8">
                <Banknote size={ICON_SIZE} />
              </ThemeIcon>
            </Tooltip>
          )}
          {valueGap?.direction === "undervalued" ? (
            <Tooltip label="Undervalued" withArrow>
              <ThemeIcon size="sm" color="gold.9" c="gold.2">
                <HandCoins size={ICON_SIZE} />
              </ThemeIcon>
            </Tooltip>
          ) : valueGap?.direction === "breakout" ? (
            <Tooltip label="Breakout Player" withArrow>
              <ThemeIcon size="sm" color="grape.9" c="grape.2">
                <Rocket size={ICON_SIZE} />
              </ThemeIcon>
            </Tooltip>
          ) : valueGap?.direction === "falloff" ? (
            <Tooltip label="Falloff Player" withArrow>
              <ThemeIcon size="sm" color="red.9" c="red.2">
                <TrendingDown size={ICON_SIZE} />
              </ThemeIcon>
            </Tooltip>
          ) : (
            valueGap?.direction === "overvalued" && (
              <Tooltip label="Overvalued" withArrow>
                <ThemeIcon size="sm" color="red.9" c="red.2">
                  <BanknoteArrowDown size={ICON_SIZE} />
                </ThemeIcon>
              </Tooltip>
            )
          )}
          {consistency && ConsistencyIcon && (
            <Tooltip label={consistency} withArrow>
              <ThemeIcon
                size="sm"
                color={`${consistencyColor(consistency)}.9`}
                c={`${consistencyColor(consistency)}.2`}
              >
                <ConsistencyIcon size={ICON_SIZE} />
              </ThemeIcon>
            </Tooltip>
          )}
        </Group>
      </Table.Td>
      <Table.Td>
        <Group gap={6} wrap="nowrap">
          <Anchor
            component="button"
            type="button"
            size="sm"
            fw={500}
            onClick={() => onSelectPlayer(row.fpid)}
          >
            {row.name}
          </Anchor>
          {row.team && (
            <Text size="xs" c="dimmed">
              {row.team}
            </Text>
          )}
        </Group>
      </Table.Td>
      <Table.Td>
        <Badge size="sm" variant="light" color="gray">
          {row.tierLabel}
        </Badge>
      </Table.Td>
      <Table.Td>
        <Text size="sm" c={priceColor} fw={600}>
          ${Math.round(row.dollarValue)}
        </Text>
      </Table.Td>
      <Table.Td visibleFrom="sm">
        <Text size="sm" c="dimmed">
          {row.points.toFixed(1)}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}
