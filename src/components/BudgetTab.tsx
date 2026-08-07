import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Badge, Button, Card, Group, Stack, Text } from "@mantine/core";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { POSITIONS, type OverspendBehavior, type Position } from "../types";
import { expandRosterSlots, type SlotDescriptor } from "../lib/rosterSlots";
import {
  DEFAULT_OVERSPEND_BEHAVIOR,
  generatePresetAmounts,
  type BudgetPreset,
} from "../lib/budgetPresets";
import { categoryForSlot } from "../lib/budgetCategories";
import { resolveTeamSalaryCap } from "../lib/teamBudget";
import { CATEGORY_ORDER } from "../constants/budget";
import { WEEK } from "../constants/general";
import { PlayerDetailModal } from "./PlayerDetailModal";
import { SlotRow, type SlotPositionPreference } from "./BudgetTab/SlotRow";
import { CategoryBreakdown } from "./BudgetTab/CategoryBreakdown";
import { BudgetSidePanel } from "./BudgetTab/BudgetSidePanel";

// Bench spots are almost never used to stash a kicker or defense - excluded
// here so BENCH's "closest priced players" popover only ever suggests
// skill-position players.
const BENCH_POSITIONS: readonly Position[] = POSITIONS.filter(
  (pos) => pos !== "DST" && pos !== "K",
);

const NO_FALLBACK: readonly Position[] = [];

// Which positions a slot's "closest priced players" popover (see SlotRow)
// should draw from - an exact position for a dedicated slot, the league's
// FLEX/SUPERFLEX eligibility lists for those, or BENCH_POSITIONS (everyone
// except DST/K) for BENCH. Mirrors the position-matching rules in
// src/lib/slotAssignment.ts's eligibleSlotsForPosition, just inverted
// (slot -> positions instead of position -> slots).
//
// SFLEX is the one slot with a real fallback tier: superflex exists mainly
// for QB scarcity, so it prefers QB, but falls back to the league's regular
// FLEX-eligible positions (RB/WR/TE) if there aren't enough QBs near the
// budgeted amount to fill the list - see SlotRow's closestPlayers.
function eligiblePositionsForSlot(
  slot: SlotDescriptor,
  flexPositions: readonly Position[],
  superflexPositions: readonly Position[],
): SlotPositionPreference {
  if (slot.position) return { primary: [slot.position], fallback: NO_FALLBACK };
  if (slot.label.startsWith("SFLEX")) {
    return superflexPositions.includes("QB")
      ? { primary: ["QB"], fallback: flexPositions }
      : { primary: superflexPositions, fallback: NO_FALLBACK };
  }
  if (slot.label.startsWith("FLEX")) {
    return { primary: flexPositions, fallback: NO_FALLBACK };
  }
  return { primary: BENCH_POSITIONS, fallback: NO_FALLBACK };
}

// "predraft" edits draftBudgetPlans directly (the Setup app's Budget tab -
// the baseline, editable anytime, carried forward by cloneDraftSettings).
// "live" edits draftLiveBudgetOverrides (the Draft Room's Budget tab) - only
// the slots actually touched here get saved; everything else keeps
// mirroring whatever the pre-draft plan currently says, live, for the rest
// of the draft.
interface BudgetTabProps {
  seasonId: Id<"seasons">;
  mode: "predraft" | "live";
}

export function BudgetTab({ seasonId, mode }: BudgetTabProps) {
  const settingsList = useQuery(api.leagues.listSeasons, {});
  const teams = useQuery(api.draft.teams.listSeasonTeams, { seasonId });
  // Keepers are draftPicks rows too (see convex/draft/picks.ts's addKeeper),
  // so this is populated even in "predraft" mode, before the live draft
  // starts - a self-team keeper already spoken for a slot, and that's worth
  // surfacing on the pre-draft plan same as an in-draft pick.
  const picks = useQuery(api.draft.picks.listDraftPicks, { seasonId });
  const predraftPlan = useQuery(api.draft.plan.getBudgetPlan, {
    seasonId,
  });
  const livePlan = useQuery(
    api.draft.plan.getLiveBudgetPlan,
    mode === "live" ? { seasonId } : "skip",
  );
  const upsertBudgetPlan = useMutation(api.draft.plan.upsertBudgetPlan);
  const upsertLiveBudgetOverrides = useMutation(
    api.draft.plan.upsertLiveBudgetOverrides,
  );
  const resetLiveBudgetPlan = useMutation(api.draft.plan.resetLiveBudgetPlan);

  const settings = settingsList?.find((s) => s._id === seasonId);
  const selfTeam = teams?.find((t) => t.isSelf);
  // Feeds each SlotRow's "closest priced players" popover - same $ value
  // engine the rest of the app uses, which already excludes keepers (see
  // convex/draftValues.ts) from its output entirely.
  const draftValues = useQuery(
    api.draftValues.getDraftValues,
    settings
      ? { seasonId, week: WEEK, scoring: settings.scoring }
      : "skip",
  )?.values;

  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [selectedFpid, setSelectedFpid] = useState<number | null>(null);
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
  // The last-persisted amounts/behavior, so the Save button's dirty state
  // can be judged against "what the server actually has" rather than just
  // "has this been touched since mount" - null means nothing's been saved
  // for this plan yet, which is always dirty.
  const [savedSnapshot, setSavedSnapshot] = useState<{
    amounts: Record<string, number>;
    overspendBehavior: OverspendBehavior;
  } | null>(null);

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
        setSavedSnapshot({
          amounts: { ...predraftPlan.amounts },
          overspendBehavior: predraftPlan.overspendBehavior,
        });
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
        setSavedSnapshot({
          amounts: { ...livePlan.amounts },
          overspendBehavior: livePlan.overspendBehavior,
        });
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

  // Which of the self team's roster slots already have a player in them
  // (live pick or keeper) - see SlotRow's isFilled styling.
  const filledSlotKeys = useMemo(() => {
    if (!selfTeam) return new Set<string>();
    return new Set(
      (picks ?? [])
        .filter((pick) => pick.teamId === selfTeam._id)
        .map((pick) => pick.planSlotKey)
        .filter((key): key is string => !!key),
    );
  }, [picks, selfTeam]);

  // Every drafted-value row not already off the board - keepers are already
  // excluded by getDraftValues itself (see the query comment above), so this
  // only needs to additionally drop live auction picks.
  const draftedFpids = useMemo(
    () => new Set((picks ?? []).map((pick) => pick.fpid)),
    [picks],
  );
  const availablePlayers = useMemo(
    () => (draftValues ?? []).filter((row) => !draftedFpids.has(row.fpid)),
    [draftValues, draftedFpids],
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

  // Compares by value rather than key insertion order, since amounts read
  // back from the database won't necessarily list keys in the same order
  // they were written in.
  const amountsEqual = (a: Record<string, number>, b: Record<string, number>) => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if ((a[key] ?? 0) !== (b[key] ?? 0)) return false;
    }
    return true;
  };
  const isDirty =
    !savedSnapshot ||
    !amountsEqual(amounts, savedSnapshot.amounts) ||
    overspendBehavior !== savedSnapshot.overspendBehavior;

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
        await upsertBudgetPlan({ seasonId, amounts, overspendBehavior });
      } else {
        const overrides = Object.fromEntries(
          [...touchedKeys].map((key) => [key, amounts[key] ?? 0]),
        );
        await upsertLiveBudgetOverrides({
          seasonId,
          overrides,
          overspendBehavior,
        });
      }
      setSavedSnapshot({ amounts: { ...amounts }, overspendBehavior });
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
      await resetLiveBudgetPlan({ seasonId });
      const resetAmounts = { ...(predraftPlan?.amounts ?? {}) };
      const resetOverspendBehavior =
        predraftPlan?.overspendBehavior ?? DEFAULT_OVERSPEND_BEHAVIOR;
      setAmounts(resetAmounts);
      setOverspendBehavior(resetOverspendBehavior);
      setTouchedKeys(new Set());
      setSavedSnapshot(null);
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

      <BudgetSidePanel
        showPresets={mode === "predraft"}
        onApplyPreset={applyPreset}
        perStarter={perStarter}
        perRosterSpot={perRosterSpot}
        topThreePct={topThreePct}
        everySlotHasADollar={everySlotHasADollar}
        overspendBehavior={overspendBehavior}
        onOverspendChange={setOverspendBehavior}
      />

      {error && (
        <Text c="red" size="sm">
          {error}
        </Text>
      )}
      {/* Stacked full-width below "sm", inline fit-content buttons above it -
          same responsive split used elsewhere (e.g. KeeperSearchForm.tsx). */}
      <Stack gap="xs" hiddenFrom="sm">
        <Button onClick={handleSave} loading={isSaving} disabled={!isDirty} fullWidth>
          {mode === "live" ? "Save live plan" : "Save pre-draft plan"}
        </Button>
        {mode === "live" && (
          <Button
            variant="default"
            color="orange"
            onClick={handleReset}
            loading={isResetting}
            fullWidth
          >
            Reset to pre-draft plan
          </Button>
        )}
        <Badge variant="light" color={isDirty ? "yellow" : "teal"}>
          {isDirty ? "Unsaved changes" : "All changes saved"}
        </Badge>
      </Stack>
      <Group gap="xs" visibleFrom="sm">
        <Button
          onClick={handleSave}
          loading={isSaving}
          disabled={!isDirty}
          w="fit-content"
        >
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
        <Badge variant="light" color={isDirty ? "yellow" : "teal"}>
          {isDirty ? "Unsaved changes" : "All changes saved"}
        </Badge>
      </Group>

      <Card withBorder padding="md">
        <Stack gap="md">
          <CategoryBreakdown
            categoryTotals={categoryTotals}
            salaryCap={effectiveSalaryCap}
          />
          <Stack gap={6}>
            {slots.map((slot) => (
              <SlotRow
                key={slot.key}
                slot={slot}
                amount={amounts[slot.key] ?? 0}
                maxAmount={maxAmount}
                onChange={(amount) => setSlotAmount(slot.key, amount)}
                isFilled={filledSlotKeys.has(slot.key)}
                availablePlayers={availablePlayers}
                eligiblePositions={eligiblePositionsForSlot(
                  slot,
                  settings.flexPositions,
                  settings.superflexPositions,
                )}
                onSelectPlayer={setSelectedFpid}
                {...(mode === "live"
                  ? {
                      isOverridden: touchedKeys.has(slot.key),
                      onRevert: () => revertSlot(slot.key),
                    }
                  : {})}
              />
            ))}
          </Stack>
        </Stack>
      </Card>

      <PlayerDetailModal
        fpid={selectedFpid}
        onClose={() => setSelectedFpid(null)}
        week={WEEK}
        scoring={settings.scoring}
        season={settings.year}
        seasonId={seasonId}
      />
    </Stack>
  );
}
