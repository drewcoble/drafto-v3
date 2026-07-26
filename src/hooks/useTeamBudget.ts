import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Position } from "../types";
import {
  computeTeamBudgetStats,
  type TeamBudgetStats,
} from "../lib/teamBudget";
import { expandRosterSlots } from "../lib/rosterSlots";
import { assignSlotForPick } from "../lib/slotAssignment";

// Reused by the Draft Room's top bar, the Draft tab's price rail, and (in a
// later phase) the League tab's per-opponent stats - each just supplies a
// different teamId. PLAN-SAFE only ever resolves for the self team, since
// that's the only budget plan we have.
//
// `targetPosition` is the position of whichever player is currently on the
// block (if any). PLAN-SAFE means two different things depending on whether
// one is supplied:
// - With a targetPosition: the most you could bid on *this* player while
//   still being able to afford your plan for every other still-open slot -
//   this excludes the one slot this player would fill from the "reserve for
//   everything else" sum. Without that exclusion, the reserve would include
//   this pick's own budgeted amount, making PLAN-SAFE collapse to ~$0
//   whenever you're roughly on pace (the reserve would eat its own slot's
//   money before you ever got to spend it).
// - Without one: the overall surplus/deficit vs. plan (remaining minus every
//   still-open slot's budgeted amount) - a "am I on pace" indicator.
export function useTeamBudget(
  draftSettingsId: Id<"draftSettings"> | undefined,
  teamId: Id<"draftTeams"> | undefined,
  targetPosition?: Position,
): TeamBudgetStats | undefined {
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
    api.draft.plan.getBudgetPlan,
    draftSettingsId ? { draftSettingsId } : "skip",
  );

  const settings = settingsList?.find((s) => s._id === draftSettingsId);
  if (!settings || !picks || !teams || !teamId) return undefined;

  const team = teams.find((t) => t._id === teamId);
  const teamPicks = picks.filter((pick) => pick.teamId === teamId);
  const spent = teamPicks.reduce((sum, pick) => sum + pick.price, 0);

  let unfilledPlanTotal: number | undefined;
  if (team?.isSelf && plan) {
    const filledSlotKeys = new Set(
      teamPicks
        .map((pick) => pick.planSlotKey)
        .filter((key): key is string => !!key),
    );
    const targetSlotKey = targetPosition
      ? assignSlotForPick(
          targetPosition,
          settings.rosterSlots,
          filledSlotKeys,
          settings.flexPositions,
          settings.superflexPositions,
        )
      : undefined;
    unfilledPlanTotal = expandRosterSlots(settings.rosterSlots)
      .filter((slot) => !filledSlotKeys.has(slot.key) && slot.key !== targetSlotKey)
      .reduce((sum, slot) => sum + (plan.amounts[slot.key] ?? 0), 0);
  }

  return computeTeamBudgetStats(
    settings.salaryCap,
    settings.rosterSlots,
    teamPicks.length,
    spent,
    unfilledPlanTotal,
  );
}
