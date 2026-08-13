import { Fragment } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
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
  ChevronDown,
  ChevronUp,
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
import { playerTagStyle } from "../../../lib/playerTagStyle";
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
  isExpanded: boolean;
  onSetTag: (tag: PlayerTag) => void;
  onNominate: () => void;
  onSelectPlayer: (fpid: number) => void;
  onToggleExpand: () => void;
}

// Player, Tier, $, Pts, status-icon flags, chevron - kept in sync with the
// header column count in PlayersLeftTab.tsx so the expanded actions row's
// colSpan always spans the full table width.
const COLUMN_COUNT = 6;

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
  isExpanded,
  onSetTag,
  onNominate,
  onSelectPlayer,
  onToggleExpand,
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
    <Fragment>
      <Table.Tr
        onClick={onToggleExpand}
        style={{
          cursor: "pointer",
          ...(isNominated
            ? {
                boxShadow: "inset 0 0 0 2px var(--mantine-color-yellow-6)",
                backgroundColor: "var(--mantine-color-yellow-light)",
              }
            : undefined),
        }}
      >
        <Table.Td>
          <Group gap={4} wrap="nowrap">
            {isNominated && (
              <Tooltip label="Currently up for bids" withArrow>
                <ThemeIcon size="sm" color="yellow" variant="light">
                  <Banknote size={ICON_SIZE} />
                </ThemeIcon>
              </Tooltip>
            )}
            {valueGap?.direction === "undervalued" ? (
              <Tooltip label="Undervalued" withArrow>
                <ThemeIcon size="sm" color="gold" variant="light">
                  <HandCoins size={ICON_SIZE} />
                </ThemeIcon>
              </Tooltip>
            ) : valueGap?.direction === "breakout" ? (
              <Tooltip label="Breakout Player" withArrow>
                <ThemeIcon size="sm" color="grape" variant="light">
                  <Rocket size={ICON_SIZE} />
                </ThemeIcon>
              </Tooltip>
            ) : valueGap?.direction === "falloff" ? (
              <Tooltip label="Falloff Player" withArrow>
                <ThemeIcon size="sm" color="red" variant="light">
                  <TrendingDown size={ICON_SIZE} />
                </ThemeIcon>
              </Tooltip>
            ) : (
              valueGap?.direction === "overvalued" && (
                <Tooltip label="Overvalued" withArrow>
                  <ThemeIcon size="sm" color="red" variant="light">
                    <BanknoteArrowDown size={ICON_SIZE} />
                  </ThemeIcon>
                </Tooltip>
              )
            )}
            {consistency && ConsistencyIcon && (
              <Tooltip label={consistency} withArrow>
                <ThemeIcon
                  size="sm"
                  color={consistencyColor(consistency)}
                  variant="light"
                >
                  <ConsistencyIcon size={ICON_SIZE} />
                </ThemeIcon>
              </Tooltip>
            )}
          </Group>
        </Table.Td>
        <Table.Td>
          {/* mih matches a two-line wrapped name (e.g. "Jacory
              Croskey-Merritt") so every row - wrapped or not - shares
              that same height instead of single-line names producing a
              visibly shorter, inconsistent row. */}
          <Group gap={6} wrap="nowrap" mih={44} align="center">
            <Anchor
              component="button"
              type="button"
              size="sm"
              fw={500}
              onClick={(event) => {
                event.stopPropagation();
                onSelectPlayer(row.fpid);
              }}
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
          {/* Bare tier number rather than the "Tier N" label used
              elsewhere (e.g. bar-view section headers) - keeps this
              column narrow enough that the trailing chevron stays on
              screen on mobile without horizontal scrolling. */}
          <Tooltip label={row.tierLabel} withArrow>
            <Badge size="sm" variant="light" color="gray" circle>
              {row.tier}
            </Badge>
          </Tooltip>
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
        <Table.Td>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={isExpanded ? "Hide actions" : "Show actions"}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </ActionIcon>
        </Table.Td>
      </Table.Tr>
      {isExpanded && (
        <Table.Tr>
          <Table.Td colSpan={COLUMN_COUNT}>
            <Group gap={6} wrap="wrap" py={4}>
              {!hasActiveNomination && (
                <Button
                  variant="light"
                  size="xs"
                  leftSection={<UserRoundPlus size={14} />}
                  onClick={onNominate}
                >
                  Nominate
                </Button>
              )}
              <Button
                {...(tag === "target"
                  ? playerTagStyle("target")
                  : { variant: "default" })}
                size="xs"
                leftSection={<Crosshair size={14} />}
                onClick={() => onSetTag("target")}
              >
                Target
              </Button>
              <Button
                {...(tag === "avoid"
                  ? playerTagStyle("avoid")
                  : { variant: "default" })}
                size="xs"
                leftSection={<CircleSlash size={14} />}
                onClick={() => onSetTag("avoid")}
              >
                Avoid
              </Button>
            </Group>
          </Table.Td>
        </Table.Tr>
      )}
    </Fragment>
  );
}
