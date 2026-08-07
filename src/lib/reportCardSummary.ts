import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";

type ReportCardResult = FunctionReturnType<
  typeof api.draft.reportCard.getDraftReportCard
>;
// The "ok" branch's payload - the only branch with real data to summarize.
// "not_ready"/"requires_upgrade" are handled by DraftReportCard.tsx before
// either summary builder below is ever called.
export type ReportCard = Extract<ReportCardResult, { status: "ok" }>["data"];
export type TeamCard = ReportCard["teams"][number];
export type PickRow = TeamCard["picks"][number];
export type RosterAward = NonNullable<ReportCard["mostReliableRoster"]>;

function formatSigned(amount: number): string {
  return amount >= 0 ? `+$${amount.toFixed(0)}` : `-$${Math.abs(amount).toFixed(0)}`;
}

function gradeDescriptor(letter: string): string {
  if (letter.startsWith("A")) return "elite drafting";
  if (letter.startsWith("B")) return "a solid, well-balanced effort";
  if (letter.startsWith("C")) return "a middle-of-the-pack showing";
  return "a rough night - plenty to learn from before next year";
}

// Templated (not AI-generated) recap, built entirely from fields
// getDraftReportCard already computes - free and instant, unlike the AI
// option discussed for a future iteration. Reads like a few sentences of
// prose rather than a stat block, but every number in it traces back to a
// field already rendered elsewhere on the card.
export function buildTeamSummary(team: TeamCard): string {
  const sentences: string[] = [
    `${team.teamName} earns a ${team.letter} - ${gradeDescriptor(team.letter)}.`,
  ];

  if (team.surplusTotal >= 1 && team.bestPick) {
    sentences.push(
      `They beat the market by ${formatSigned(team.surplusTotal)} across the draft, headlined by ${team.bestPick.name} at $${team.bestPick.price} (${formatSigned(team.bestPick.surplus ?? 0)} value).`,
    );
  } else if (team.surplusTotal <= -1 && team.worstPick) {
    sentences.push(
      `They paid a premium overall (${formatSigned(team.surplusTotal)}), most notably reaching on ${team.worstPick.name} for $${team.worstPick.price} (${formatSigned(team.worstPick.surplus ?? 0)}).`,
    );
  }

  if (team.lineup.delta >= 5) {
    sentences.push(
      `Roughly ${team.lineup.delta.toFixed(0)} points were left on the bench by suboptimal lineup choices.`,
    );
  } else if (team.lineup.efficiencyPct >= 0.98) {
    sentences.push("They also started a near-perfect lineup.");
  }

  if (team.bestKeeper && (team.bestKeeper.keeperSurplus ?? 0) >= 5) {
    sentences.push(
      `Their sharpest move was keeping ${team.bestKeeper.name} for $${team.bestKeeper.price} - a bargain worth ${formatSigned(team.bestKeeper.keeperSurplus ?? 0)}.`,
    );
  }

  const notableConsistencyCount = Math.max(
    team.reliableCount,
    team.boomBustCount,
  );
  if (notableConsistencyCount >= 3) {
    if (team.reliableCount >= team.boomBustCount) {
      sentences.push(
        `Behind the scenes, ${team.reliableCount} of their players were Reliable performers last season.`,
      );
    } else {
      sentences.push(
        `They're leaning on ${team.boomBustCount} boom/bust players from last season - highest ceiling, highest risk.`,
      );
    }
  }

  return sentences.join(" ");
}

// League-wide recap paragraph for the top of the report card page - same
// "templated, not AI" approach as buildTeamSummary above.
export function buildLeagueSummary(report: ReportCard): string {
  const sentences: string[] = [];
  const teamNameById = new Map(report.teams.map((t) => [t.teamId, t.teamName]));

  const champion = [...report.teams].sort(
    (a, b) => b.gradeScore - a.gradeScore,
  )[0];
  if (champion) {
    sentences.push(
      `${champion.teamName} takes the top grade of the draft with a ${champion.letter}.`,
    );
  }

  const steal = report.leagueSteals[0];
  if (steal && (steal.surplus ?? 0) >= 1) {
    const stealTeam = teamNameById.get(steal.teamId) ?? "One team";
    sentences.push(
      `The steal of the draft: ${stealTeam} landed ${steal.name} for just $${steal.price}, ${formatSigned(steal.surplus ?? 0)} under market value.`,
    );
  }

  const reach = report.leagueReaches[0];
  if (reach && (reach.surplus ?? 0) <= -1) {
    const reachTeam = teamNameById.get(reach.teamId) ?? "One team";
    sentences.push(
      `The biggest reach: ${reachTeam} paid $${reach.price} for ${reach.name}, ${formatSigned(reach.surplus ?? 0)} over market value.`,
    );
  }

  if (report.mostReliableRoster) {
    sentences.push(
      `${report.mostReliableRoster.teamName} built the most reliable roster, with ${report.mostReliableRoster.count} steady performers from last season.`,
    );
  }
  if (report.mostVolatileRoster) {
    sentences.push(
      `${report.mostVolatileRoster.teamName} is rostering the most boom/bust talent in the league (${report.mostVolatileRoster.count} players).`,
    );
  }

  return sentences.join(" ");
}
