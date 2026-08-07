import { v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { scoringValidator } from "../scoring";
import { generateGeminiText, MODEL } from "./client";

type ReportSummaryData = NonNullable<
  FunctionReturnType<typeof internal.draft.reportCard.getReportCardDataForSummary>
>;

function formatSigned(amount: number): string {
  return amount >= 0
    ? `+$${Math.round(amount)}`
    : `-$${Math.round(Math.abs(amount))}`;
}

// Trims computeReportCardData's full output (which includes every pick,
// full price/value detail, per-position breakdowns, etc.) down to the
// handful of fields buildLeagueSummary/buildTeamSummary already treat as
// headline-worthy (src/lib/reportCardSummary.ts) - keeps the prompt (and
// therefore the token bill) small, and gives Gemini less surface area to
// hallucinate extra "facts" from.
function buildSummaryPrompt(data: ReportSummaryData): string {
  const teams = data.teams.map((team) => ({
    name: team.teamName,
    grade: team.letter,
    valueSurplus: formatSigned(team.surplusTotal),
    pointsAboveReplacement: Math.round(team.vorTotal),
    lineupEfficiencyPct: Math.round(team.lineup.efficiencyPct * 100),
    bestPick: team.bestPick
      ? `${team.bestPick.name} ($${team.bestPick.price}, ${formatSigned(team.bestPick.surplus ?? 0)})`
      : null,
    worstPick: team.worstPick
      ? `${team.worstPick.name} ($${team.worstPick.price}, ${formatSigned(team.worstPick.surplus ?? 0)})`
      : null,
    bestKeeper: team.bestKeeper
      ? `${team.bestKeeper.name} ($${team.bestKeeper.price}, ${formatSigned(team.bestKeeper.keeperSurplus ?? 0)})`
      : null,
    reliablePlayers: team.reliableCount,
    boomBustPlayers: team.boomBustCount,
  }));

  const payload = {
    teams,
    biggestSteal: data.leagueSteals[0]
      ? `${data.leagueSteals[0].name} for $${data.leagueSteals[0].price} (${formatSigned(data.leagueSteals[0].surplus ?? 0)})`
      : null,
    biggestReach: data.leagueReaches[0]
      ? `${data.leagueReaches[0].name} for $${data.leagueReaches[0].price} (${formatSigned(data.leagueReaches[0].surplus ?? 0)})`
      : null,
    mostReliableRoster: data.mostReliableRoster
      ? `${data.mostReliableRoster.teamName} (${data.mostReliableRoster.count} reliable players)`
      : null,
    mostVolatileRoster: data.mostVolatileRoster
      ? `${data.mostVolatileRoster.teamName} (${data.mostVolatileRoster.count} boom/bust players)`
      : null,
  };

  return [
    "You are writing a short, fun recap of a fantasy football auction draft for a private league.",
    "Use only the facts in the JSON data below - don't invent players, prices, or stats that aren't there.",
    "Write 150-250 words of plain prose (no markdown headers, no bullet lists), calling out 2-3 standout teams or picks by name.",
    "Tone: witty and a little playful, like a league commissioner's newsletter - not corporate, not mean-spirited.",
    "",
    JSON.stringify(payload),
  ].join("\n");
}

export const hasCachedSummary = internalQuery({
  args: {
    draftId: v.id("drafts"),
    week: v.string(),
    scoring: scoringValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("draftReportSummaries")
      .withIndex("by_draft_week_scoring", (q) =>
        q
          .eq("draftId", args.draftId)
          .eq("week", args.week)
          .eq("scoring", args.scoring),
      )
      .unique();
    return existing !== null;
  },
});

export const saveSummary = internalMutation({
  args: {
    draftId: v.id("drafts"),
    week: v.string(),
    scoring: scoringValidator,
    summary: v.string(),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("draftReportSummaries")
      .withIndex("by_draft_week_scoring", (q) =>
        q
          .eq("draftId", args.draftId)
          .eq("week", args.week)
          .eq("scoring", args.scoring),
      )
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    await ctx.db.insert("draftReportSummaries", {
      draftId: args.draftId,
      week: args.week,
      scoring: args.scoring,
      summary: args.summary,
      model: args.model,
      generatedAt: Date.now(),
    });
  },
});

// Scheduled once by convex/draft/status.ts's syncDraftStatus, right when a
// real draft first transitions into status "complete". Best-effort: any
// failure (missing API key, Gemini error, safety block) is caught and
// logged rather than thrown - nothing is waiting synchronously on this,
// and the Report Card's free templated recap
// (src/lib/reportCardSummary.ts) is always there as a fallback.
export const generateReportSummary = internalAction({
  args: {
    draftId: v.id("drafts"),
    week: v.string(),
    scoring: scoringValidator,
  },
  handler: async (ctx, args) => {
    // Guards against a flapping syncDraftStatus (complete -> in_progress ->
    // complete, e.g. a commissioner correction) scheduling a second paid
    // call for a draft that's already got a cached recap.
    const alreadyGenerated: boolean = await ctx.runQuery(
      internal.gemini.reportSummary.hasCachedSummary,
      args,
    );
    if (alreadyGenerated) return;

    const data = await ctx.runQuery(
      internal.draft.reportCard.getReportCardDataForSummary,
      args,
    );
    if (!data) return; // not Pro, draft not complete, or a mock draft

    let text: string;
    try {
      text = await generateGeminiText(buildSummaryPrompt(data));
    } catch (err) {
      console.error("Gemini report summary generation failed", err);
      return;
    }

    await ctx.runMutation(internal.gemini.reportSummary.saveSummary, {
      draftId: args.draftId,
      week: args.week,
      scoring: args.scoring,
      summary: text,
      model: MODEL,
    });
  },
});
