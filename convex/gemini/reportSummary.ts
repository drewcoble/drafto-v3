import { v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { scoringValidator, scoringConfigValidator } from "../scoring";
import { generateGeminiText, MODEL } from "./client";

type ReportSummaryData = NonNullable<
  FunctionReturnType<typeof internal.draft.reportCard.getReportCardDataForSummary>
>;

function formatSigned(amount: number): string {
  return amount >= 0
    ? `+$${Math.round(amount)}`
    : `-$${Math.round(Math.abs(amount))}`;
}

// Forces Gemini's response into { leagueRecap, teamSummaries } instead of
// free-form prose - see https://ai.google.dev/gemini-api/docs/structured-output.
// `id` is echoed back per team so the response can be matched to a team
// without relying on (possibly duplicate) name strings.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    leagueRecap: { type: "STRING" },
    teamSummaries: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          summary: { type: "STRING" },
        },
        required: ["id", "summary"],
      },
    },
  },
  required: ["leagueRecap", "teamSummaries"],
};

// Trims computeReportCardData's full output (which includes every pick,
// full price/value detail, per-position breakdowns, etc.) down to the
// handful of fields buildLeagueSummary/buildTeamSummary already treat as
// headline-worthy (src/lib/reportCardSummary.ts) - keeps the prompt (and
// therefore the token bill) small, and gives Gemini less surface area to
// hallucinate extra "facts" from.
function buildSummaryPrompt(data: ReportSummaryData): string {
  const teams = data.teams.map((team) => ({
    id: team.teamId,
    name: team.teamName,
    grade: team.letter,
    valueSurplus: formatSigned(team.surplusTotal),
    pointsAboveReplacement: Math.round(team.vorTotal),
    startersRank: team.startersRank,
    benchRank: team.benchRank,
    // 1-indexed league rank per starter category (1 = best) - e.g. a team
    // dead last at RB is good, specific material for a friendly jab.
    positionalRanks: team.positionalRanks.map(
      (p) => `${p.category}: ${p.rank}/${data.teams.length}`,
    ),
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
    totalTeams: data.teams.length,
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
    "You are writing content for a fantasy football auction draft's Report Card page, for a private league.",
    "Use only the facts in the JSON data below - don't invent players, prices, or stats that aren't there.",
    "Respond with JSON matching the given schema: a leagueRecap paragraph, plus one teamSummaries entry per team in the data (matched back by `id`, echoed verbatim).",
    "",
    "leagueRecap: 150-250 words of plain prose (no markdown headers, no bullet lists), calling out 2-3 standout teams or picks by name. Tone: witty and a little playful, like a league commissioner's newsletter.",
    "",
    "teamSummaries: one entry per team, 1-3 sentences each (roughly 25-45 words). These sit side by side on individual team cards, so make each one sound like it was written by a different corner of the commissioner's brain, not a filled-in template - vary the opening, the sentence structure, and which stat leads. Don't reuse the same phrase or sentence pattern across teams.",
    "If a team is genuinely bad at something (worst or near-worst grade, worst-ranked starters/bench, a near-last rank in positionalRanks, or a big reach), you can throw in a little light, good-natured trash talk about that specific weakness - teasing, not cruel, the kind of ribbing a friend would post in the league group chat. Don't force it onto every team; a team with no clear weak spot just gets a normal, upbeat blurb.",
    "Never invent a weakness that isn't in the data, and never make it personal (about the person, not the roster).",
    `Each team's startersRank/benchRank/positionalRanks are 1-indexed league ranks out of totalTeams (1 = best) comparing roster strength, not in-season lineup decisions - a draft doesn't set an actual lineup, so don't call this "lineup efficiency" or talk about points "left on the bench".`,
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
    teamSummaries: v.array(
      v.object({ teamId: v.id("seasonTeams"), summary: v.string() }),
    ),
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
      teamSummaries: args.teamSummaries,
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
    scoringConfig: scoringConfigValidator,
  },
  handler: async (ctx, args) => {
    // draftReportSummaries stays keyed on base scoring only (see its schema
    // comment) - deliberately not widened to the full ScoringConfig.
    const scoring = args.scoringConfig.scoring;

    // Guards against a flapping syncDraftStatus (complete -> in_progress ->
    // complete, e.g. a commissioner correction) scheduling a second paid
    // call for a draft that's already got a cached recap.
    const alreadyGenerated: boolean = await ctx.runQuery(
      internal.gemini.reportSummary.hasCachedSummary,
      { draftId: args.draftId, week: args.week, scoring },
    );
    if (alreadyGenerated) return;

    // Ensures (idempotently) that the frozen numbers snapshot this recap
    // will be written against already exists - convex/draft/status.ts also
    // schedules snapshotReportCard directly, but scheduling order between
    // two same-tick jobs isn't guaranteed, and this recap must be built
    // from the exact same snapshot getDraftReportCardPublic will later read, not
    // a separate live computation of its own (see draftReportCardSnapshots'
    // schema comment on why those two can drift).
    await ctx.runMutation(internal.draft.reportCard.snapshotReportCard, args);

    const data = await ctx.runQuery(
      internal.draft.reportCard.getReportCardDataForSummary,
      args,
    );
    if (!data) return; // not Pro, draft not complete, or a mock draft

    let raw: string;
    try {
      raw = await generateGeminiText(buildSummaryPrompt(data), {
        // One paragraph plus a 1-3 sentence blurb per team, as JSON - a
        // dozen-team league easily clears the original 600-token budget for
        // the single-paragraph recap. Sized well above that estimate
        // because client.ts can't zero out gemini-3.6-flash's thinking
        // budget for a structured-output request (see its comment), so
        // unmetered thinking tokens draw from this same pool before the
        // visible answer does.
        maxOutputTokens: 6000,
        responseSchema: RESPONSE_SCHEMA,
      });
    } catch (err) {
      console.error("Gemini report summary generation failed", err);
      return;
    }

    let parsed: { leagueRecap: string; teamSummaries: Array<{ id: string; summary: string }> };
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("Gemini report summary returned invalid JSON", err, raw);
      return;
    }
    if (typeof parsed.leagueRecap !== "string" || !Array.isArray(parsed.teamSummaries)) {
      console.error("Gemini report summary JSON missing expected fields", parsed);
      return;
    }

    // Drop any entry Gemini hallucinated an unrecognized id for, or
    // returned malformed - the team's card just falls back to the
    // templated summary in that case (see getDraftReportCardPublic).
    const knownTeamIds = new Set(data.teams.map((t) => t.teamId as string));
    const teamSummaries = parsed.teamSummaries
      .filter(
        (t) =>
          typeof t?.id === "string" &&
          typeof t?.summary === "string" &&
          knownTeamIds.has(t.id),
      )
      .map((t) => ({ teamId: t.id as Id<"seasonTeams">, summary: t.summary }));

    await ctx.runMutation(internal.gemini.reportSummary.saveSummary, {
      draftId: args.draftId,
      week: args.week,
      scoring,
      summary: parsed.leagueRecap,
      teamSummaries,
      model: MODEL,
    });
  },
});
