import { type ReactNode } from "react";
import {
  Card,
  Button,
  Collapse,
  Group,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { OverspendBehavior } from "../../types";
import { BUDGET_PRESETS, type BudgetPreset } from "../../lib/budgetPresets";
import { OVERSPEND_OPTIONS } from "../../constants/budget";

interface BudgetSidePanelProps {
  // "Starter Budgets" only makes sense pre-draft (mode: "predraft") -
  // applying a preset mid-draft (mode: "live") would blow away whatever
  // in-draft reallocations the live plan already reflects, so BudgetTab.tsx
  // only sets this true in predraft mode.
  showPresets: boolean;
  // "Superflex heavy" is meaningless without a SUPERFLEX slot to spend on -
  // dropped from the list entirely for leagues without one.
  hasSuperflex: boolean;
  onApplyPreset: (preset: BudgetPreset) => void;
  perStarter: number;
  perRosterSpot: number;
  topThreePct: number;
  everySlotHasADollar: boolean;
  overspendBehavior: OverspendBehavior;
  onOverspendChange: (behavior: OverspendBehavior) => void;
}

// "Starter Budgets" and "When I overspend" collapse (default closed) so
// they don't eat vertical space once a preset/overspend choice is already
// made - "Sanity checks" stays always-expanded (it's read-only feedback,
// not a one-time setup choice you'd want to tuck away). Grid row alignment
// is "start" below so those two collapsed cards don't get stretched tall to
// match Sanity checks' full height on the same row.
function CollapsibleCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [opened, { toggle }] = useDisclosure(false);
  return (
    <Card withBorder padding="md">
      <Stack gap={8}>
        <UnstyledButton onClick={toggle} aria-expanded={opened}>
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm" fw={500} tt="uppercase" c="dimmed">
              {title}
            </Text>
            {opened ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </Group>
        </UnstyledButton>
        <Collapse in={opened}>
          <Stack gap={8}>{children}</Stack>
        </Collapse>
      </Stack>
    </Card>
  );
}

export function BudgetSidePanel({
  showPresets,
  hasSuperflex,
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
  const presets = BUDGET_PRESETS.filter(
    (preset) => hasSuperflex || preset.value !== "superflexHeavy",
  );

  return (
    <SimpleGrid
      cols={{ base: 1, sm: showPresets ? 3 : 2 }}
      spacing="md"
      style={{ alignItems: "start" }}
    >
      {showPresets && (
        <CollapsibleCard title="Starter Budgets">
          {presets.map((preset) => (
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
        </CollapsibleCard>
      )}

      <CollapsibleCard title="When I overspend">
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
      </CollapsibleCard>

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
    </SimpleGrid>
  );
}
