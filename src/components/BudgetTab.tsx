import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Badge, Button, Group, Stack, Text } from "@mantine/core";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { OverspendBehavior } from "../types";
import { expandRosterSlots } from "../lib/rosterSlots";
import {
  DEFAULT_OVERSPEND_BEHAVIOR,
  generatePresetAmounts,
  type BudgetPreset,
} from "../lib/budgetPresets";
import { categoryForSlot } from "../lib/budgetCategories";
import { resolveTeamSalaryCap } from "../lib/teamBudget";
import { CATEGORY_ORDER } from "../constants/budget";
import { SlotRow } from "./BudgetTab/SlotRow";
import { CategoryBreakdown } from "./BudgetTab/CategoryBreakdown";
import { BudgetSidePanel } from "./BudgetTab/BudgetSidePanel";

// "predraft" edits draftBudgetPlans directly (the Setup app's Budget tab -
// the baseline, editable anytime, carried forward by cloneDraftSettings).
// "live" edits draftLiveBudgetOverrides (the Draft Room's Budget tab) - only
// the slots actually touched here get saved; everything else keeps
// mirroring whatever the pre-draft plan currently says, live, for the rest
// of the draft.
interface BudgetTabProps {
  draftSettingsId: Id<"draftSettings">;
  mode: "predraft" | "live";
}

export function BudgetTab({ draftSettingsId, mode }: BudgetTabProps) {
  const settingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const teams = useQuery(api.draft.teams.listDraftTeams, { draftSettingsId });
  const predraftPlan = useQuery(api.draft.plan.getBudgetPlan, {
    draftSettingsId,
  });
  const livePlan = useQuery(
    api.draft.plan.getLiveBudgetPlan,
    mode === "live" ? { draftSettingsId } : "skip",
  );
  const upsertBudgetPlan = useMutation(api.draft.plan.upsertBudgetPlan);
  const upsertLiveBudgetOverrides = useMutation(
    api.draft.plan.upsertLiveBudgetOverrides,
  );
  const resetLiveBudgetPlan = useMutation(api.draft.plan.resetLiveBudgetPlan);

  const settings = settingsList?.find((s) => s._id === draftSettingsId);
  const selfTeam = teams?.find((t) => t.isSelf);

  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [overspendBehavior, setOverspendBehavior] = useState<OverspendBehavior>(
    DEFAULT_OVERSPEND_BEHAVIOR,
  );
  // Only meaningful in live mode - the slot keys the user has explicitly
  // reallocated this draft. Everything else keeps reading from
  // predraftPlan.amounts, live, so a pre-draft edit made mid-draft still
  // flows through for any slot nobody has touched yet.
  const [touchedKeys, setTouchedKeys] = useState<Set<string>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the form once, after which further refetches (e.g. from another
  // tab, or a live-mirrored pre-draft edit) shouldn't clobber whatever the
  // user is actively editing - "Reset to pre-draft plan" is the explicit,
  // deliberate way back to the current baseline instead.
  useEffect(() => {
    if (isInitialized || !settings || !teams) return;
    const effectiveSalaryCap = resolveTeamSalaryCap(
      selfTeam,
      settings.salaryCap,
    );
    if (mode === "predraft") {
      if (predraftPlan === undefined) return;
      if (predraftPlan) {
        setAmounts({ ...predraftPlan.amounts });
        setOverspendBehavior(predraftPlan.overspendBehavior);
      } else {
        setAmounts(
          generatePresetAmounts(
            "balanced",
            settings.rosterSlots,
            effectiveSalaryCap,
          ),
        );
      }
    } else {
      if (livePlan === undefined) return;
      if (livePlan) {
        setAmounts({ ...livePlan.amounts });
        setOverspendBehavior(livePlan.overspendBehavior);
        setTouchedKeys(new Set(livePlan.overriddenKeys));
      } else {
        // No pre-draft plan and no live overrides exist yet - nothing to
        // mirror, so every slot the balanced preset lands on has to be
        // saved explicitly rather than treated as "following pre-draft".
        const preset = generatePresetAmounts(
          "balanced",
          settings.rosterSlots,
          effectiveSalaryCap,
        );
        setAmounts(preset);
        setTouchedKeys(new Set(Object.keys(preset)));
      }
    }
    setIsInitialized(true);
  }, [isInitialized, settings, teams, selfTeam, mode, predraftPlan, livePlan]);

  const slots = useMemo(
    () => (settings ? expandRosterSlots(settings.rosterSlots) : []),
    [settings],
  );

  if (!settings || !teams || !isInitialized) {
    return null;
  }

  const effectiveSalaryCap = resolveTeamSalaryCap(selfTeam, settings.salaryCap);

  const totalAllocated = slots.reduce(
    (sum, slot) => sum + (amounts[slot.key] ?? 0),
    0,
  );
  const unallocated = effectiveSalaryCap - totalAllocated;
  const maxAmount = Math.max(1, ...slots.map((slot) => amounts[slot.key] ?? 0));
  const starterSlots = slots.filter((slot) => !slot.label.startsWith("BN"));
  const perStarter = starterSlots.length
    ? starterSlots.reduce((sum, slot) => sum + (amounts[slot.key] ?? 0), 0) /
      starterSlots.length
    : 0;
  const perRosterSpot = slots.length ? effectiveSalaryCap / slots.length : 0;
  const topThreeTotal = [...slots]
    .map((slot) => amounts[slot.key] ?? 0)
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((sum, v) => sum + v, 0);
  const topThreePct = effectiveSalaryCap
    ? Math.round((topThreeTotal / effectiveSalaryCap) * 100)
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
    const next = generatePresetAmounts(
      preset,
      settings.rosterSlots,
      effectiveSalaryCap,
    );
    setAmounts(next);
    if (mode === "live") {
      setTouchedKeys(new Set(Object.keys(next)));
    }
  };

  const setSlotAmount = (key: string, amount: number) => {
    setAmounts((current) => ({ ...current, [key]: amount }));
    if (mode === "live") {
      setTouchedKeys((current) => new Set(current).add(key));
    }
  };

  const revertSlot = (key: string) => {
    setAmounts((current) => ({
      ...current,
      [key]: predraftPlan?.amounts[key] ?? 0,
    }));
    setTouchedKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      if (mode === "predraft") {
        await upsertBudgetPlan({ draftSettingsId, amounts, overspendBehavior });
      } else {
        const overrides = Object.fromEntries(
          [...touchedKeys].map((key) => [key, amounts[key] ?? 0]),
        );
        await upsertLiveBudgetOverrides({
          draftSettingsId,
          overrides,
          overspendBehavior,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save plan.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (
      !window.confirm(
        "Reset the live budget to your pre-draft plan? Any in-draft reallocations will be lost.",
      )
    ) {
      return;
    }
    setIsResetting(true);
    setError(null);
    try {
      await resetLiveBudgetPlan({ draftSettingsId });
      setAmounts({ ...(predraftPlan?.amounts ?? {}) });
      setOverspendBehavior(
        predraftPlan?.overspendBehavior ?? DEFAULT_OVERSPEND_BEHAVIOR,
      );
      setTouchedKeys(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset plan.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Stack gap="md" py="sm">
      <Group justify="space-between" align="center">
        <Stack gap={2}>
          <Text fw={700} size="lg">
            {mode === "live" ? "Live Budget" : "Allocate the cap"}
          </Text>
          {mode === "live" && (
            <Text size="xs" c="dimmed">
              Slots you haven't touched keep following your pre-draft plan.
              Only the ones you adjust here get saved as overrides.
            </Text>
          )}
        </Stack>
        <Badge
          variant="light"
          color={unallocated === 0 ? "green" : "yellow"}
          size="lg"
        >
          ${unallocated} unallocated
        </Badge>
      </Group>

      <CategoryBreakdown
        categoryTotals={categoryTotals}
        salaryCap={effectiveSalaryCap}
      />

      <Group align="flex-start" gap="xl" wrap="wrap">
        <Stack gap={6} flex={2} miw={320}>
          {slots.map((slot) => (
            <SlotRow
              key={slot.key}
              slot={slot}
              amount={amounts[slot.key] ?? 0}
              maxAmount={maxAmount}
              onChange={(amount) => setSlotAmount(slot.key, amount)}
              {...(mode === "live"
                ? {
                    isOverridden: touchedKeys.has(slot.key),
                    onRevert: () => revertSlot(slot.key),
                  }
                : {})}
            />
          ))}
        </Stack>

        <BudgetSidePanel
          onApplyPreset={applyPreset}
          perStarter={perStarter}
          perRosterSpot={perRosterSpot}
          topThreePct={topThreePct}
          everySlotHasADollar={everySlotHasADollar}
          overspendBehavior={overspendBehavior}
          onOverspendChange={setOverspendBehavior}
        />
      </Group>

      {error && (
        <Text c="red" size="sm">
          {error}
        </Text>
      )}
      <Group>
        <Button onClick={handleSave} loading={isSaving} w="fit-content">
          {mode === "live" ? "Save live plan" : "Save pre-draft plan"}
        </Button>
        {mode === "live" && (
          <Button
            variant="default"
            color="orange"
            onClick={handleReset}
            loading={isResetting}
            w="fit-content"
          >
            Reset to pre-draft plan
          </Button>
        )}
      </Group>
    </Stack>
  );
}
