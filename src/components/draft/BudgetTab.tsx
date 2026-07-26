import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Progress,
  Stack,
  Text,
} from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { OverspendBehavior } from "../../types";
import { expandRosterSlots, type SlotDescriptor } from "../../lib/rosterSlots";
import {
  BUDGET_PRESETS,
  DEFAULT_OVERSPEND_BEHAVIOR,
  generatePresetAmounts,
  type BudgetPreset,
} from "../../lib/budgetPresets";

interface BudgetTabProps {
  draftSettingsId: Id<"draftSettings">;
}

const OVERSPEND_OPTIONS: Array<{
  value: OverspendBehavior;
  label: string;
  caption: string;
}> = [
  {
    value: "bench",
    label: "Take from the bench pool",
    caption:
      "Overages come out of the bench pool first, so starters keep their money.",
  },
  {
    value: "spread",
    label: "Spread across open slots",
    caption: "Overages are spread evenly across every slot still open.",
  },
  {
    value: "ask",
    label: "Ask me each time",
    caption: "You'll be prompted to decide each time you go over plan.",
  },
];

// Coarse grouping for the top summary bar - QB/RB/WR/TE stand alone since
// they're the slots you actually compare across, everything else (FLEX/
// SUPERFLEX/DST/K/bench) is lumped into one bucket.
const CATEGORY_ORDER = ["QB", "RB", "WR", "TE", "Other"] as const;
const CATEGORY_LABELS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  Other: "FLEX + bench",
};
const CATEGORY_COLORS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  QB: "blue",
  RB: "green",
  WR: "orange",
  TE: "grape",
  Other: "gray",
};

function categoryForSlot(slot: SlotDescriptor): (typeof CATEGORY_ORDER)[number] {
  if (
    slot.position === "QB" ||
    slot.position === "RB" ||
    slot.position === "WR" ||
    slot.position === "TE"
  ) {
    return slot.position;
  }
  return "Other";
}

interface SlotRowProps {
  slot: SlotDescriptor;
  amount: number;
  maxAmount: number;
  onChange: (amount: number) => void;
}

function SlotRow({ slot, amount, maxAmount, onChange }: SlotRowProps) {
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
        <ActionIcon variant="default" size="sm" onClick={() => onChange(amount + 1)}>
          +
        </ActionIcon>
      </Group>
    </Group>
  );
}

export function BudgetTab({ draftSettingsId }: BudgetTabProps) {
  const settingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const plan = useQuery(api.draft.plan.getBudgetPlan, { draftSettingsId });
  const upsertBudgetPlan = useMutation(api.draft.plan.upsertBudgetPlan);

  const settings = settingsList?.find((s) => s._id === draftSettingsId);

  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [overspendBehavior, setOverspendBehavior] =
    useState<OverspendBehavior>(DEFAULT_OVERSPEND_BEHAVIOR);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the form once, either from a saved plan or a Balanced preset -
  // after that, further plan refetches (e.g. from another tab) shouldn't
  // clobber whatever the user is actively editing.
  useEffect(() => {
    if (isInitialized || !settings || plan === undefined) return;
    if (plan) {
      setAmounts({ ...plan.amounts });
      setOverspendBehavior(plan.overspendBehavior);
    } else {
      setAmounts(
        generatePresetAmounts(
          "balanced",
          settings.rosterSlots,
          settings.salaryCap,
        ),
      );
    }
    setIsInitialized(true);
  }, [isInitialized, settings, plan]);

  const slots = useMemo(
    () => (settings ? expandRosterSlots(settings.rosterSlots) : []),
    [settings],
  );

  if (!settings || !isInitialized) {
    return null;
  }

  const totalAllocated = slots.reduce(
    (sum, slot) => sum + (amounts[slot.key] ?? 0),
    0,
  );
  const unallocated = settings.salaryCap - totalAllocated;
  const maxAmount = Math.max(1, ...slots.map((slot) => amounts[slot.key] ?? 0));
  const starterSlots = slots.filter((slot) => !slot.label.startsWith("BN"));
  const perStarter = starterSlots.length
    ? starterSlots.reduce((sum, slot) => sum + (amounts[slot.key] ?? 0), 0) /
      starterSlots.length
    : 0;
  const perRosterSpot = slots.length ? settings.salaryCap / slots.length : 0;
  const topThreeTotal = [...slots]
    .map((slot) => amounts[slot.key] ?? 0)
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((sum, v) => sum + v, 0);
  const topThreePct = settings.salaryCap
    ? Math.round((topThreeTotal / settings.salaryCap) * 100)
    : 0;
  const everySlotHasADollar = slots.every(
    (slot) => (amounts[slot.key] ?? 0) >= 1,
  );

  const categoryTotals = CATEGORY_ORDER.map((category) => ({
    category,
    total: slots
      .filter((slot) => categoryForSlot(slot) === category)
      .reduce((sum, slot) => sum + (amounts[slot.key] ?? 0), 0),
  }));

  const applyPreset = (preset: BudgetPreset) => {
    setAmounts(
      generatePresetAmounts(preset, settings.rosterSlots, settings.salaryCap),
    );
  };

  const setSlotAmount = (key: string, amount: number) => {
    setAmounts((current) => ({ ...current, [key]: amount }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await upsertBudgetPlan({ draftSettingsId, amounts, overspendBehavior });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save plan.");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedOverspend = OVERSPEND_OPTIONS.find(
    (option) => option.value === overspendBehavior,
  );

  return (
    <Stack gap="md" py="sm">
      <Group justify="space-between" align="center">
        <Text fw={700} size="lg">
          Allocate the cap
        </Text>
        <Badge
          variant="light"
          color={unallocated === 0 ? "green" : "yellow"}
          size="lg"
        >
          ${unallocated} unallocated
        </Badge>
      </Group>

      <Stack gap={6}>
        <Box style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden" }}>
          {categoryTotals.map(({ category, total }) =>
            total > 0 ? (
              <Box
                key={category}
                style={{
                  width: `${(total / settings.salaryCap) * 100}%`,
                  backgroundColor: `var(--mantine-color-${CATEGORY_COLORS[category]}-6)`,
                }}
              />
            ) : null,
          )}
        </Box>
        <Group gap="md">
          {categoryTotals.map(({ category, total }) => (
            <Text key={category} size="xs" c="dimmed">
              {CATEGORY_LABELS[category]} ${total}
            </Text>
          ))}
        </Group>
      </Stack>

      <Group align="flex-start" gap="xl" wrap="wrap">
        <Stack gap={6} flex={2} miw={320}>
          {slots.map((slot) => (
            <SlotRow
              key={slot.key}
              slot={slot}
              amount={amounts[slot.key] ?? 0}
              maxAmount={maxAmount}
              onChange={(amount) => setSlotAmount(slot.key, amount)}
            />
          ))}
        </Stack>

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
                  onClick={() => applyPreset(preset.value)}
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
                  onClick={() => setOverspendBehavior(option.value)}
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
      </Group>

      {error && (
        <Text c="red" size="sm">
          {error}
        </Text>
      )}
      <Button onClick={handleSave} loading={isSaving} w="fit-content">
        Save plan
      </Button>
    </Stack>
  );
}
