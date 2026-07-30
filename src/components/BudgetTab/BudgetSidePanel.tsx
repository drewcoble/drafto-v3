import { Button, Card, Group, Stack, Text } from "@mantine/core";
import type { OverspendBehavior } from "../../types";
import { BUDGET_PRESETS, type BudgetPreset } from "../../lib/budgetPresets";
import { OVERSPEND_OPTIONS } from "../../constants/budget";

interface BudgetSidePanelProps {
  onApplyPreset: (preset: BudgetPreset) => void;
  perStarter: number;
  perRosterSpot: number;
  topThreePct: number;
  everySlotHasADollar: boolean;
  overspendBehavior: OverspendBehavior;
  onOverspendChange: (behavior: OverspendBehavior) => void;
}

export function BudgetSidePanel({
  onApplyPreset,
  perStarter,
  perRosterSpot,
  topThreePct,
  everySlotHasADollar,
  overspendBehavior,
  onOverspendChange,
}: BudgetSidePanelProps) {
  const selectedOverspend = OVERSPEND_OPTIONS.find(
    (option) => option.value === overspendBehavior,
  );

  return (
    <Stack gap="md" w={280}>
      <Card withBorder padding="md">
        <Stack gap={8}>
          <Text size="sm" fw={500} tt="uppercase" c="dimmed">
            Start from a shape
          </Text>
          {BUDGET_PRESETS.map((preset) => (
            <Button
              key={preset.value}
              variant="default"
              fullWidth
              onClick={() => onApplyPreset(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
          <Text size="xs" c="dimmed">
            A preset lands as numbers you then tune.
          </Text>
        </Stack>
      </Card>

      <Card withBorder padding="md">
        <Stack gap={6}>
          <Text size="sm" fw={500} tt="uppercase" c="dimmed">
            Sanity checks
          </Text>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              $ per starter
            </Text>
            <Text size="sm">${perStarter.toFixed(1)}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              $ per roster spot
            </Text>
            <Text size="sm">${perRosterSpot.toFixed(1)}</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Top three slots
            </Text>
            <Text size="sm">{topThreePct}% of cap</Text>
          </Group>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              $1 available for every slot
            </Text>
            <Text size="sm">{everySlotHasADollar ? "yes" : "no"}</Text>
          </Group>
        </Stack>
      </Card>

      <Card withBorder padding="md">
        <Stack gap={8}>
          <Text size="sm" fw={500} tt="uppercase" c="dimmed">
            When I overspend
          </Text>
          {OVERSPEND_OPTIONS.map((option) => (
            <Button
              key={option.value}
              variant={option.value === overspendBehavior ? "light" : "default"}
              fullWidth
              onClick={() => onOverspendChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
          {selectedOverspend && (
            <Text size="xs" c="dimmed">
              {selectedOverspend.caption}
            </Text>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
