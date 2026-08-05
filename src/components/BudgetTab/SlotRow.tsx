import { useMemo } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Group,
  Popover,
  Progress,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { CircleCheck, RotateCcw } from "lucide-react";
import type { SlotDescriptor } from "../../lib/rosterSlots";
import { categoryForSlot } from "../../lib/budgetCategories";
import { CATEGORY_COLORS } from "../../constants/budget";
import { POSITION_COLORS } from "../../lib/positionColors";
import type { DraftValueRow, Position } from "../../types";

// How many closest-priced players the popover shows - "3-5" was the ask;
// always showing the max of that range gives the fullest comparison.
const CLOSEST_PLAYERS_COUNT = 5;

// A slot's position filter, with an optional fallback tier - e.g. SFLEX
// prefers QB, but if there aren't enough QBs to fill the list, the popover
// tops it up with the league's regular FLEX-eligible positions instead of
// showing a half-empty list. Every other slot just has an empty fallback
// (see BudgetTab.tsx's eligiblePositionsForSlot).
export interface SlotPositionPreference {
  primary: readonly Position[];
  fallback: readonly Position[];
}

interface SlotRowProps {
  slot: SlotDescriptor;
  amount: number;
  maxAmount: number;
  onChange: (amount: number) => void;
  isOverridden?: boolean;
  onRevert?: () => void;
  // Whether this slot already has a player in it (a live pick or a keeper -
  // see BudgetTab's filledSlotKeys) - purely a visual cue that the amount
  // below is no longer a plan, it's what got spent. The controls stay live
  // either way, since correcting a filled slot's number is still valid.
  isFilled?: boolean;
  // Every still-available (not drafted, not kept) player across every
  // position - BudgetTab.tsx filters getDraftValues' output once and shares
  // this same array across every row rather than each row re-deriving it.
  availablePlayers: DraftValueRow[];
  // See BudgetTab.tsx's eligiblePositionsForSlot.
  eligiblePositions: SlotPositionPreference;
  onSelectPlayer: (fpid: number) => void;
}

export function SlotRow({
  slot,
  amount,
  maxAmount,
  onChange,
  isOverridden,
  onRevert,
  isFilled,
  availablePlayers,
  eligiblePositions,
  onSelectPlayer,
}: SlotRowProps) {
  const color = CATEGORY_COLORS[categoryForSlot(slot)];

  // Recomputed on every amount change (a lot cheaper than it looks - the
  // pool BudgetTab hands down is already drafted/kept-filtered, so this is
  // just a position filter + sort over what's usually a few dozen rows).
  // Primary-position matches always come first (closest-priced among
  // themselves); the fallback tier only fills in whatever's left over if
  // primary alone can't reach CLOSEST_PLAYERS_COUNT - see SFLEX's
  // preference (QB, falling back to FLEX-eligible positions) in
  // BudgetTab.tsx's eligiblePositionsForSlot.
  const closestPlayers = useMemo(() => {
    const byCloseness = (a: DraftValueRow, b: DraftValueRow) =>
      Math.abs(a.dollarValue - amount) - Math.abs(b.dollarValue - amount);

    const primaryPool = availablePlayers
      .filter((row) => eligiblePositions.primary.includes(row.position))
      .sort(byCloseness);

    if (
      primaryPool.length >= CLOSEST_PLAYERS_COUNT ||
      eligiblePositions.fallback.length === 0
    ) {
      return primaryPool.slice(0, CLOSEST_PLAYERS_COUNT);
    }

    const fallbackPool = availablePlayers
      .filter((row) => eligiblePositions.fallback.includes(row.position))
      .sort(byCloseness);

    return [...primaryPool, ...fallbackPool].slice(0, CLOSEST_PLAYERS_COUNT);
  }, [availablePlayers, eligiblePositions, amount]);

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      p={6}
      style={{
        borderRadius: "var(--mantine-radius-sm)",
        backgroundColor: isFilled
          ? "var(--mantine-color-green-light)"
          : undefined,
      }}
    >
      <Group gap={4} wrap="nowrap" w={70}>
        {isFilled && (
          <Tooltip label="Slot filled" withArrow>
            <CircleCheck
              size={14}
              color="var(--mantine-color-green-6)"
              aria-label="Slot filled"
            />
          </Tooltip>
        )}
        <Text size="sm" {...(isFilled ? { c: "dimmed" } : {})} truncate>
          {slot.label}
        </Text>
      </Group>
      <Popover withArrow shadow="md" width={260} position="bottom" withinPortal>
        <Popover.Target>
          <Progress
            value={maxAmount > 0 ? (amount / maxAmount) * 100 : 0}
            color={isFilled ? "green" : color}
            size="lg"
            flex={1}
            style={{ cursor: "pointer" }}
          />
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap={6}>
            <Text size="xs" fw={600} c="dimmed">
              Closest to ${amount}
            </Text>
            {closestPlayers.length === 0 ? (
              <Text size="xs" c="dimmed">
                No available players found.
              </Text>
            ) : (
              closestPlayers.map((player) => (
                <Group key={player.fpid} justify="space-between" wrap="nowrap" gap={8}>
                  <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    <Badge
                      size="xs"
                      variant="light"
                      color={POSITION_COLORS[player.position]}
                    >
                      {player.position}
                    </Badge>
                    <Anchor
                      component="button"
                      type="button"
                      size="xs"
                      truncate
                      style={{ flex: 1, minWidth: 0, textAlign: "left" }}
                      onClick={() => onSelectPlayer(player.fpid)}
                    >
                      {player.name}
                    </Anchor>
                  </Group>
                  <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                    {player.points.toFixed(1)} pts
                  </Text>
                  <Text size="xs" fw={600} style={{ whiteSpace: "nowrap" }}>
                    ${Math.round(player.dollarValue)}
                  </Text>
                </Group>
              ))
            )}
          </Stack>
        </Popover.Dropdown>
      </Popover>
      <Group gap={4} wrap="nowrap" justify="flex-end" w={148}>
        <ActionIcon
          variant="default"
          size={40}
          onClick={() => onChange(Math.max(amount - 1, 0))}
        >
          −
        </ActionIcon>
        <Text size="sm" w={36} ta="center">
          ${amount}
        </Text>
        <ActionIcon
          variant="default"
          size={40}
          onClick={() => onChange(amount + 1)}
        >
          +
        </ActionIcon>
      </Group>
      {onRevert && (
        <ActionIcon
          variant={isOverridden ? "light" : "subtle"}
          color={isOverridden ? "orange" : "gray"}
          size={40}
          disabled={!isOverridden}
          onClick={onRevert}
          title={
            isOverridden
              ? "Revert to pre-draft amount"
              : "Following pre-draft plan"
          }
        >
          <RotateCcw size={14} />
        </ActionIcon>
      )}
    </Group>
  );
}
