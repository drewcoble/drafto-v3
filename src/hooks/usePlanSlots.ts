import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Position } from "../types";
import { expandRosterSlots, type SlotDescriptor } from "../lib/rosterSlots";

export interface PlanSlots {
  openSlots: SlotDescriptor[];
  amounts: Record<string, number>;
  flexPositions: readonly Position[];
  superflexPositions: readonly Position[];
}

// Raw ingredients for matchPlanSlot (lib/planRecommendation.ts) - split out
// from useTeamBudget so per-row consumers (PlayersLeftTab renders one row
// per remaining player) can call matchPlanSlot in a plain loop instead of a
// hook per row. Only ever resolves for the self team, since only self has a
// saved budget plan to match against.
export function usePlanSlots(
  draftSettingsId: Id<"draftSettings"> | undefined,
  teamId: Id<"draftTeams"> | undefined,
): PlanSlots | undefined {
  const settingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const picks = useQuery(
    api.draft.picks.listDraftPicks,
    draftSettingsId ? { draftSettingsId } : "skip",
  );
  const teams = useQuery(
    api.draft.teams.listDraftTeams,
    draftSettingsId ? { draftSettingsId } : "skip",
  );
  const plan = useQuery(
    api.draft.plan.getLiveBudgetPlan,
    draftSettingsId ? { draftSettingsId } : "skip",
  );

  const settings = settingsList?.find((s) => s._id === draftSettingsId);
  if (!settings || !picks || !teams || !plan || !teamId) return undefined;

  const team = teams.find((t) => t._id === teamId);
  if (!team?.isSelf) return undefined;

  const filledSlotKeys = new Set(
    picks
      .filter((pick) => pick.teamId === teamId)
      .map((pick) => pick.planSlotKey)
      .filter((key): key is string => !!key),
  );
  const openSlots = expandRosterSlots(settings.rosterSlots).filter(
    (slot) => !filledSlotKeys.has(slot.key),
  );

  return {
    openSlots,
    amounts: plan.amounts,
    flexPositions: settings.flexPositions,
    superflexPositions: settings.superflexPositions,
  };
}
