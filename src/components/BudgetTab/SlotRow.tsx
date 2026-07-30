import { ActionIcon, Group, Progress, Text } from "@mantine/core";
import { RotateCcw } from "lucide-react";
import type { SlotDescriptor } from "../../lib/rosterSlots";
import { categoryForSlot } from "../../lib/budgetCategories";
import { CATEGORY_COLORS } from "../../constants/budget";

interface SlotRowProps {
  slot: SlotDescriptor;
  amount: number;
  maxAmount: number;
  onChange: (amount: number) => void;
  isOverridden?: boolean;
  onRevert?: () => void;
}

export function SlotRow({
  slot,
  amount,
  maxAmount,
  onChange,
  isOverridden,
  onRevert,
}: SlotRowProps) {
  const color = CATEGORY_COLORS[categoryForSlot(slot)];
  return (
    <Group gap="xs" wrap="nowrap">
      <Text size="sm" w={54}>
        {slot.label}
      </Text>
      <Progress
        value={maxAmount > 0 ? (amount / maxAmount) * 100 : 0}
        color={color}
        size="lg"
        flex={1}
      />
      <Group gap={4} wrap="nowrap" justify="flex-end" w={110}>
        <ActionIcon
          variant="default"
          size="sm"
          onClick={() => onChange(Math.max(amount - 1, 0))}
        >
          −
        </ActionIcon>
        <Text size="sm" w={36} ta="center">
          ${amount}
        </Text>
        <ActionIcon
          variant="default"
          size="sm"
          onClick={() => onChange(amount + 1)}
        >
          +
        </ActionIcon>
      </Group>
      {onRevert && (
        <ActionIcon
          variant={isOverridden ? "light" : "subtle"}
          color={isOverridden ? "orange" : "gray"}
          size="sm"
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
