import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

export interface SelfTeamResult {
  teams: Doc<"draftTeams">[];
  selfTeam: Doc<"draftTeams"> | undefined;
}

// Shared by the Draft Room's layout route and every tab's leaf route, all of
// which need both the full team list and which one is "self".
export function useSelfTeam(
  draftSettingsId: Id<"draftSettings"> | undefined,
): SelfTeamResult | undefined {
  const teams = useQuery(
    api.draft.teams.listDraftTeams,
    draftSettingsId ? { draftSettingsId } : "skip",
  );
  if (!teams) return undefined;
  return { teams, selfTeam: teams.find((team) => team.isSelf) };
}
