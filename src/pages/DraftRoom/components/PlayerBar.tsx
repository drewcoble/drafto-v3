import { Box, Group, HoverCard, Text, ThemeIcon } from "@mantine/core";
import {
  BanknoteArrowDown,
  Crosshair,
  Gavel,
  HandCoins,
  Rocket,
  ThumbsDown,
  TrendingDown,
} from "lucide-react";
import {
  BAR_HEIGHT,
  ICON_SIZE,
  MAX_BAR_WIDTH,
  MIN_BAR_WIDTH,
  PX_PER_DOLLAR,
} from "../../../constants/playersLeft";
import { type ConsistencyLabel } from "../../../lib/consistency";
import { barStyle } from "../../../lib/draftRecommendation";
import type { PlanSlotMatch } from "../../../lib/planRecommendation";
import type { DraftBoardRow, PlayerTag, ValueGap } from "../../../types";
import HoverInfo from "./HoverInfo";

interface PlayerBarProps {
  row: DraftBoardRow;
  budgetAmount: number | undefined;
  planMatch: PlanSlotMatch | undefined;
  tag: PlayerTag | undefined;
  valueGap: ValueGap | undefined;
  consistency: ConsistencyLabel | undefined;
  // True for the one player (across the whole board) currently up for bids -
  // called out with a gold glow + gavel icon so it doesn't get lost among
  // dozens of same-sized bars while the room's attention is on the auction.
  isNominated: boolean;
  onCycleTag: () => void;
  onSelectPlayer: (fpid: number) => void;
}

// Player identity is hidden by default - only the bar (width = projected
// cost) shows until hovered, when a HoverCard reveals who it actually is.
// Clicking the bar itself cycles it through no-opinion -> target -> avoid,
// so you can mark players you like/dislike right from the board - a
// HoverCard (rather than a Tooltip) is used here specifically because its
// dropdown content needs to be interactive (the player's name inside it is
// a separate click target that opens the detail modal) without either
// click bubbling into the other. Drafted players are filtered out before
// this ever renders (see rowsByPosition in PlayersLeftTab).
export function PlayerBar({
  row,
  budgetAmount,
  planMatch,
  tag,
  valueGap,
  consistency,
  isNominated,
  onCycleTag,
  onSelectPlayer,
}: PlayerBarProps) {
  const width = Math.max(
    Math.round(row.dollarValue * PX_PER_DOLLAR),
    MIN_BAR_WIDTH,
  );
  const fitsBudget =
    budgetAmount === undefined || row.dollarValue <= budgetAmount;
  const style = barStyle(consistency, tag, row.dollarValue, budgetAmount);
  return (
    <HoverCard withArrow shadow="md">
      <HoverCard.Dropdown>
        <HoverInfo
          row={row}
          handleClick={() => onSelectPlayer(row.fpid)}
          planMatch={planMatch}
          fitsBudget={fitsBudget}
          consistency={consistency}
          valueGap={valueGap}
          tag={tag}
        />
      </HoverCard.Dropdown>
      <HoverCard.Target>
        <Box
          h={BAR_HEIGHT}
          maw={MAX_BAR_WIDTH}
          w={width}
          onClick={onCycleTag}
          style={{
            overflow: "hidden",
            position: "relative",
            backgroundColor: style.backgroundColor,
            opacity: isNominated ? 1 : style.opacity,
            outline: style.outline,
            borderRadius: 4,
            outlineOffset: 1.5,
            cursor: "pointer",
            boxShadow: isNominated
              ? "0 0 0 2px var(--mantine-color-yellow-4), 0 0 10px 3px var(--mantine-color-yellow-6)"
              : undefined,
          }}
        >
          <Group
            pl={5}
            h="100%"
            justify="space-between"
            align="center"
            gap="xs"
            wrap="nowrap"
          >
            <Text truncate size="xs" w="auto">
              {row.name}
            </Text>
            <Group gap={0}>
              {isNominated && (
                <ThemeIcon bg="yellow.6" c="dark.8">
                  <Gavel size={ICON_SIZE} />
                </ThemeIcon>
              )}
              {valueGap && (
                <ThemeIcon w="content">
                  {valueGap.direction === "undervalued" ? (
                    <HandCoins
                      size={ICON_SIZE}
                      style={{
                        position: "relative",
                        color: "white",
                      }}
                    />
                  ) : valueGap.direction === "breakout" ? (
                    <Rocket
                      size={ICON_SIZE}
                      style={{
                        position: "relative",
                        color: "white",
                      }}
                    />
                  ) : valueGap.direction === "falloff" ? (
                    <TrendingDown
                      size={ICON_SIZE}
                      style={{
                        position: "relative",
                        color: "white",
                      }}
                    />
                  ) : (
                    <BanknoteArrowDown
                      size={ICON_SIZE}
                      style={{
                        position: "relative",
                        color: "white",
                      }}
                    />
                  )}
                </ThemeIcon>
              )}
              {tag && (
                <ThemeIcon
                  bg={tag === "target" ? "green.9" : "red.9"}
                  c={tag === "target" ? "green.3" : "red.3"}
                  opacity={0.85}
                >
                  {tag === "target" ? (
                    <Crosshair size={ICON_SIZE} />
                  ) : (
                    <ThumbsDown size={ICON_SIZE} />
                  )}
                </ThemeIcon>
              )}
            </Group>
          </Group>
        </Box>
      </HoverCard.Target>
    </HoverCard>
  );
}
