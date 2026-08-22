import {
  Anchor,
  Box,
  Button,
  Group,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import {
  BanknoteArrowDown,
  BatteryLow,
  CircleSlash,
  Crosshair,
  HandCoins,
  Rocket,
  ShieldCheck,
  TrendingDown,
  TrendingUpDown,
} from "lucide-react";
import { ICON_SIZE } from "../../../constants/playersLeft";
import {
  consistencyColor,
  type ConsistencyLabel,
} from "../../../lib/consistency";
import { POSITION_COLORS } from "../../../lib/positionColors";
import type { StandardValueRow } from "../../../lib/standardValues";
import type { DraftBoardRow, PlayerTag, ValueGap } from "../../../types";
import { RookieBadge } from "../../../components/RookieBadge";
import { useSwipeReveal } from "../../../hooks/useSwipeReveal";

// Same icon choices PlayerTableRow.tsx/PlayerBar.tsx use for the same
// consistency ratings - kept in sync there rather than imported, same
// duplication convention those already share.
const CONSISTENCY_ICON: Record<ConsistencyLabel, typeof ShieldCheck> = {
  Reliable: ShieldCheck,
  "Boom/Bust": TrendingUpDown,
  "Low Output": BatteryLow,
};

// Width of the Target/Avoid action strip a row reveals when swiped left -
// the row's own content slides left by exactly this much to expose it.
const ACTIONS_WIDTH = 132;

interface PlayerTableRowMobileProps {
  row: DraftBoardRow;
  tag: PlayerTag | undefined;
  standardValue: StandardValueRow | undefined;
  valueGap: ValueGap | undefined;
  consistency: ConsistencyLabel | undefined;
  isRookie: boolean;
  isNominated: boolean;
  // Only one row is ever swiped open at a time - PlayersLeftTab.tsx owns
  // that single fpid rather than each row tracking its own.
  isSwiped: boolean;
  onSwipeOpen: () => void;
  onSetTag: (tag: PlayerTag) => void;
  // Whatever tapping the row's own content (not the name, not the swiped-
  // open actions) should do - PlayersLeftTab.tsx swaps this between
  // "open player details" and "close whichever row is swiped open"
  // depending on whether anything currently is.
  onRowTap: () => void;
  onSelectPlayer: (fpid: number) => void;
}

// Mobile counterpart to PlayerTableRow.tsx - swipe-to-reveal Target/Avoid
// instead of tap-to-expand (there's no room for an inline actions row on a
// phone width), and no Nominate action here at all: MobileNomination.tsx's
// own FAB + search already owns nominating on mobile, so this is purely a
// browse/tag list. $/Market $/pos-rank/pts columns instead of Tier, to fit
// the numbers that matter most for a quick scan in less width.
export function PlayerTableRowMobile({
  row,
  tag,
  standardValue,
  valueGap,
  consistency,
  isRookie,
  isNominated,
  isSwiped,
  onSwipeOpen,
  onSetTag,
  onRowTap,
  onSelectPlayer,
}: PlayerTableRowMobileProps) {
  const ConsistencyIcon = consistency
    ? CONSISTENCY_ICON[consistency]
    : undefined;
  const swipeHandlers = useSwipeReveal(onSwipeOpen, onRowTap);

  return (
    <Box style={{ position: "relative", overflow: "hidden" }}>
      <Group
        gap={0}
        wrap="nowrap"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: ACTIONS_WIDTH,
        }}
      >
        <Button
          fullWidth
          radius={0}
          h="100%"
          color="green"
          leftSection={<Crosshair size={14} />}
          onClick={() => onSetTag("target")}
        >
          Target
        </Button>
        <Button
          fullWidth
          radius={0}
          h="100%"
          color="red"
          leftSection={<CircleSlash size={14} />}
          onClick={() => onSetTag("avoid")}
        >
          Avoid
        </Button>
      </Group>

      <Group
        gap={8}
        wrap="nowrap"
        onClick={onRowTap}
        {...swipeHandlers}
        style={{
          position: "relative",
          padding: "10px 6px",
          borderBottom: "1px solid var(--mantine-color-default-border)",
          borderLeft: `3px solid ${
            tag === "target"
              ? "var(--mantine-color-green-6)"
              : tag === "avoid"
                ? "var(--mantine-color-red-6)"
                : "transparent"
          }`,
          background: isNominated
            ? "var(--mantine-color-yellow-light)"
            : tag === "target"
              ? "var(--mantine-color-green-light)"
              : tag === "avoid"
                ? "var(--mantine-color-red-light)"
                : "var(--mantine-color-body)",
          transform: `translateX(${isSwiped ? -ACTIONS_WIDTH : 0}px)`,
          transition: "transform 150ms ease",
          touchAction: "pan-y",
        }}
      >
        <Text size="sm" fw={700} style={{ width: 36, flexShrink: 0 }}>
          ${Math.round(row.dollarValue)}
        </Text>
        <Text size="xs" c="dimmed" style={{ width: 36, flexShrink: 0 }}>
          {standardValue ? `$${Math.round(standardValue.auctionValue)}` : "—"}
        </Text>
        <Text
          size="xs"
          fw={700}
          style={{
            width: 40,
            flexShrink: 0,
            color: POSITION_COLORS[row.position],
          }}
        >
          {row.position}
          {row.positionRank}
        </Text>
        <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={4} wrap="nowrap">
            {valueGap?.direction === "undervalued" ? (
              <Tooltip label="Undervalued" withArrow>
                <ThemeIcon size="xs" color="gold" variant="light">
                  <HandCoins size={ICON_SIZE - 4} />
                </ThemeIcon>
              </Tooltip>
            ) : valueGap?.direction === "breakout" ? (
              <Tooltip label="Breakout Player" withArrow>
                <ThemeIcon size="xs" color="grape" variant="light">
                  <Rocket size={ICON_SIZE - 4} />
                </ThemeIcon>
              </Tooltip>
            ) : valueGap?.direction === "falloff" ? (
              <Tooltip label="Falloff Player" withArrow>
                <ThemeIcon size="xs" color="red" variant="light">
                  <TrendingDown size={ICON_SIZE - 4} />
                </ThemeIcon>
              </Tooltip>
            ) : (
              valueGap?.direction === "overvalued" && (
                <Tooltip label="Overvalued" withArrow>
                  <ThemeIcon size="xs" color="red" variant="light">
                    <BanknoteArrowDown size={ICON_SIZE - 4} />
                  </ThemeIcon>
                </Tooltip>
              )
            )}
            {consistency && ConsistencyIcon && (
              <Tooltip label={consistency} withArrow>
                <ThemeIcon
                  size="xs"
                  color={consistencyColor(consistency)}
                  variant="light"
                >
                  <ConsistencyIcon size={ICON_SIZE - 4} />
                </ThemeIcon>
              </Tooltip>
            )}
            <Anchor
              component="button"
              type="button"
              size="sm"
              truncate
              style={{ minWidth: 0 }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectPlayer(row.fpid);
              }}
            >
              {row.name}
            </Anchor>
            {isRookie && <RookieBadge />}
          </Group>
          {row.team && (
            <Text size="xs" c="dimmed" truncate>
              {row.team}
            </Text>
          )}
        </Stack>
        <Text
          size="xs"
          c="dimmed"
          style={{ width: 34, flexShrink: 0, textAlign: "right" }}
        >
          {row.points.toFixed(0)}
        </Text>
      </Group>
    </Box>
  );
}
