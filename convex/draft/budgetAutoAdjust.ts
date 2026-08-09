import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { RosterSlotCounts, SlotDescriptor } from "./slots";
import { expandRosterSlots } from "./slots";

export type OverspendBehavior = "bench" | "spread" | "ask";

// Only "bench"/"spread" actually redistribute anything - "ask" (labeled
// "Handle manually" in the UI, see src/constants/budget.ts) is the
// explicit opt-out: nothing about the budget changes automatically, full
// stop. Kept as the historical "ask" value rather than renamed, so no
// schema/data migration is needed for leagues that already had it saved.
function shouldAutoAdjust(
  behavior: OverspendBehavior,
): behavior is "bench" | "spread" {
  return behavior === "bench" || behavior === "spread";
}

// Evenly nudges every slot in `targetSlots` by its share of `diff` (the
// total to add, if positive/underspent, or claw back, if
// negative/overspent), clamped so no slot drops below the $1 floor used
// everywhere else in the budget system (lib/budgetPresets.ts's
// generatePresetAmounts, etc.). Re-spreads in passes so one low-budget
// slot hitting its floor doesn't strand the rest of a clawback onto it
// alone. If the target slots collectively can't absorb a full clawback,
// whatever's left over just isn't redistributed anywhere - the team is
// genuinely over cap at that point, and the Budget tab's "$X over" badge
// is the honest signal for that, not something this should paper over by
// reaching into slots outside `targetSlots`.
function redistribute(
  targetSlots: readonly SlotDescriptor[],
  diff: number,
  currentAmounts: Record<string, number>,
): Record<string, number> {
  const changes: Record<string, number> = {};
  if (targetSlots.length === 0 || diff === 0) return changes;

  if (diff > 0) {
    const share = Math.floor(diff / targetSlots.length);
    let remainder = diff - share * targetSlots.length;
    for (const slot of targetSlots) {
      const bump = share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      if (bump !== 0) {
        changes[slot.key] = (currentAmounts[slot.key] ?? 0) + bump;
      }
    }
    return changes;
  }

  let remaining = -diff;
  const amounts: Record<string, number> = { ...currentAmounts };
  let room = targetSlots.filter((slot) => (amounts[slot.key] ?? 0) > 1);
  while (remaining > 0 && room.length > 0) {
    const share = Math.max(1, Math.floor(remaining / room.length));
    let tookAny = false;
    for (const slot of room) {
      if (remaining <= 0) break;
      const current = amounts[slot.key] ?? 0;
      const take = Math.min(current - 1, share, remaining);
      if (take > 0) {
        amounts[slot.key] = current - take;
        remaining -= take;
        tookAny = true;
      }
    }
    room = targetSlots.filter((slot) => (amounts[slot.key] ?? 0) > 1);
    if (!tookAny) break;
  }
  for (const slot of targetSlots) {
    const next = amounts[slot.key] ?? 0;
    if (next !== (currentAmounts[slot.key] ?? 0)) {
      changes[slot.key] = next;
    }
  }
  return changes;
}

// Called from resolvePick right after a self-team pick lands in a tracked
// plan slot - compares what was actually paid against that slot's current
// budgeted amount and, per `behavior`, redistributes the difference:
// "bench" only touches open bench slots (so starters keep their money
// either direction - over or under), "spread" touches every slot still
// open. Returns the full set of override patches to write, including the
// filled slot's own entry (set to the real price paid, not the stale
// plan amount) - that's what keeps the team's total budget conserved
// exactly when the target slots have enough room to absorb the diff; it
// falls short (visibly, via the unallocated badge) only when they don't.
// Returns null when there's nothing to do (manual mode, or price already
// matched the plan exactly).
export function computeAutoAdjustedOverrides({
  behavior,
  rosterSlots,
  filledSlotKey,
  price,
  currentAmounts,
  otherOpenSlotKeys,
}: {
  behavior: OverspendBehavior;
  rosterSlots: RosterSlotCounts;
  filledSlotKey: string;
  price: number;
  currentAmounts: Record<string, number>;
  otherOpenSlotKeys: ReadonlySet<string>;
}): Record<string, number> | null {
  if (!shouldAutoAdjust(behavior)) return null;

  const plannedAmount = currentAmounts[filledSlotKey] ?? 0;
  const diff = plannedAmount - price;
  if (diff === 0) return null;

  const openSlots = expandRosterSlots(rosterSlots).filter((slot) =>
    otherOpenSlotKeys.has(slot.key),
  );
  const targetSlots =
    behavior === "bench"
      ? openSlots.filter((slot) => slot.label.startsWith("BN"))
      : openSlots;

  const changes = redistribute(targetSlots, diff, currentAmounts);
  changes[filledSlotKey] = price;
  return changes;
}

// DB-aware wrapper resolvePick calls right after inserting a pick with a
// planSlotKey - loads whatever computeAutoAdjustedOverrides needs, then
// writes the result back onto draftLiveBudgetOverrides (creating the row
// if this is the first override of the draft). No-ops for anyone but the
// self team, since budget plans only ever exist for it.
export async function autoAdjustLiveBudgetForPick(
  ctx: MutationCtx,
  draftId: Id<"drafts">,
  seasonId: Id<"seasons">,
  teamId: Id<"seasonTeams">,
  planSlotKey: string,
  price: number,
): Promise<void> {
  const team = await ctx.db.get(teamId);
  if (!team?.isSelf) return;

  const season = await ctx.db.get(seasonId);
  if (!season) return;

  const [plan, liveOverride, picks] = await Promise.all([
    ctx.db
      .query("draftBudgetPlans")
      .withIndex("by_draft", (q) => q.eq("draftId", draftId))
      .first(),
    ctx.db
      .query("draftLiveBudgetOverrides")
      .withIndex("by_draft", (q) => q.eq("draftId", draftId))
      .first(),
    ctx.db
      .query("draftPicks")
      .withIndex("by_draft_sequence", (q) => q.eq("draftId", draftId))
      .collect(),
  ]);

  const behavior = liveOverride?.overspendBehavior ?? plan?.overspendBehavior ?? "bench";
  const currentAmounts = {
    ...(plan?.amounts ?? {}),
    ...(liveOverride?.overrides ?? {}),
  };

  const filledSlotKeys = new Set(
    picks
      .filter((pick) => pick.teamId === teamId)
      .map((pick) => pick.planSlotKey)
      .filter((key): key is string => !!key),
  );
  const otherOpenSlotKeys = new Set(
    expandRosterSlots(season.rosterSlots)
      .map((slot) => slot.key)
      .filter((key) => key !== planSlotKey && !filledSlotKeys.has(key)),
  );

  const changes = computeAutoAdjustedOverrides({
    behavior,
    rosterSlots: season.rosterSlots,
    filledSlotKey: planSlotKey,
    price,
    currentAmounts,
    otherOpenSlotKeys,
  });
  if (!changes) return;

  const nextOverrides = { ...(liveOverride?.overrides ?? {}), ...changes };
  if (liveOverride) {
    await ctx.db.patch(liveOverride._id, {
      overrides: nextOverrides,
      updatedAt: Date.now(),
    });
  } else {
    await ctx.db.insert("draftLiveBudgetOverrides", {
      draftId,
      overrides: nextOverrides,
      updatedAt: Date.now(),
    });
  }
}
