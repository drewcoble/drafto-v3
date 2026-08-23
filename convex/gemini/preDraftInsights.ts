import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { POSITIONS } from "../positions";
import {
  scoringConfigValidator,
  scoringValidator,
  type ScoringConfig,
} from "../scoring";
import { getRealDraftValues } from "../draftValues";
import { computeTiers } from "../draft/tiers";
import { generateGeminiText, MODEL } from "./client";

type Position = (typeof POSITIONS)[number];

interface TierGap {
  position: Position;
  tier: number;
  avgDiff: number;
  playerCount: number;
}

interface ValueGapCount {
  position: Position;
  direction: string;
  count: number;
}

interface KeeperScarcity {
  position: Position;
  keptCount: number;
  starterDemand: number;
  pctFilled: number;
}

interface InsightsInputs {
  teamCount: number;
  tierGaps: TierGap[];
  valueGapCounts: ValueGapCount[];
  keeperScarcity: KeeperScarcity[];
  inputsFingerprint: string;
}

// User-controlled inputs only (scoring/roster/keeper-rules settings + which
// fpids are currently kept) - deliberately excludes the daily-refreshed
// projections/ADP/$ data that everything else here is built from, since that
// churns constantly and would make every cached row "stale" within a day.
// Shared between generatePreDraftInsights (stores this at generation time)
// and convex/draft/insights.ts's getPreDraftInsights (recomputes it on every
// read and flags a mismatch) - see preDraftInsights' schema comment.
export function buildInputsFingerprint(
  season: Pick<
    Doc<"seasons">,
    | "scoring"
    | "teScoring"
    | "sixPointPassTds"
    | "teamCount"
    | "rosterSlots"
    | "flexPositions"
    | "superflexPositions"
    | "keeperRules"
  >,
  keeperFpids: number[],
): string {
  return JSON.stringify({
    scoring: season.scoring,
    teScoring: season.teScoring ?? "NONE",
    sixPointPassTds: season.sixPointPassTds ?? false,
    teamCount: season.teamCount,
    rosterSlots: season.rosterSlots,
    flexPositions: season.flexPositions,
    superflexPositions: season.superflexPositions,
    keeperRules: season.keeperRules ?? null,
    keeperFpids: [...keeperFpids].sort((a, b) => a - b),
  });
}

// Mirrors src/lib/standardValues.ts's buildStandardValueByFpid (convex/
// never imports from src/ - see convex/draft/tiers.ts's comment on the same
// duplication convention). auctionValue instead of rank, since this feeds
// the $-vs-market gap rather than valueGaps.ts's rank-blend signal.
async function buildStandardValueByFpid(
  ctx: QueryCtx,
  season: string,
  scoring: ScoringConfig["scoring"],
  isSuperflex: boolean,
): Promise<Map<number, number>> {
  const loadFormat = async (format: "standard" | "ppr" | "superflex") => {
    const rows = await ctx.db
      .query("standardValues")
      .withIndex("by_platform_format_season_fpid", (q) =>
        q.eq("platform", "espn").eq("format", format).eq("season", season),
      )
      .collect();
    return new Map(rows.map((row) => [row.fpid, row.auctionValue]));
  };

  if (isSuperflex) return loadFormat("superflex");
  if (scoring === "STD") return loadFormat("standard");
  if (scoring === "PPR") return loadFormat("ppr");

  const [std, ppr] = await Promise.all([
    loadFormat("standard"),
    loadFormat("ppr"),
  ]);
  const merged = new Map<number, number>();
  for (const fpid of new Set([...std.keys(), ...ppr.keys()])) {
    const a = std.get(fpid);
    const b = ppr.get(fpid);
    merged.set(fpid, a !== undefined && b !== undefined ? (a + b) / 2 : (a ?? b)!);
  }
  return merged;
}

// Assembles the compact, position/tier-level aggregate this feature reasons
// over - never a raw player list, same "trim before prompting" philosophy as
// convex/gemini/reportSummary.ts's buildSummaryPrompt. Returns null when
// there's not enough data yet (no real draft, or no draftValues for it) -
// the caller treats that as "not ready", not an error.
export const gatherInsightsInputs = internalQuery({
  args: {
    seasonId: v.id("seasons"),
    week: v.string(),
    scoringConfig: scoringConfigValidator,
  },
  handler: async (ctx, args): Promise<InsightsInputs | null> => {
    const season = await ctx.db.get(args.seasonId);
    if (!season) return null;

    const draft = await ctx.db
      .query("drafts")
      .withIndex("by_season_kind", (q) =>
        q.eq("seasonId", args.seasonId).eq("kind", "real"),
      )
      .first();
    if (!draft) return null;

    const values = await getRealDraftValues(ctx, {
      draftId: draft._id,
      week: args.week,
      scoringConfig: args.scoringConfig,
    });
    if (values.length === 0) return null;

    const activePositions = Array.from(
      new Set(values.map((row) => row.position)),
    );

    // Same ADP source computeTiers' other callers use (draft/board.ts) -
    // ADP doesn't vary by keeper/roster settings, only by week/scoring.
    const adpByFpid = new Map<
      number,
      { adpStd: number; adpHalf: number; adpPpr: number }
    >();
    for (const position of activePositions) {
      const rankings = await ctx.db
        .query("rankings")
        .withIndex("by_position_week", (q) =>
          q.eq("position", position).eq("week", args.week),
        )
        .collect();
      for (const ranking of rankings) adpByFpid.set(ranking.fpid, ranking);
    }
    const tiersByFpid = computeTiers(
      values,
      adpByFpid,
      args.scoringConfig.scoring,
    );

    const isSuperflex = season.rosterSlots.SUPERFLEX > 0;
    const standardValueByFpid = await buildStandardValueByFpid(
      ctx,
      season.year,
      args.scoringConfig.scoring,
      isSuperflex,
    );

    // Average (our $ - market $) per (position, tier) group - the same
    // per-player diff src/components/StandardValueLabel.tsx already renders,
    // aggregated so the model reasons at tier level, not per player.
    const tierGroups = new Map<
      string,
      { position: Position; tier: number; diffs: number[] }
    >();
    for (const row of values) {
      const tier = tiersByFpid.get(row.fpid);
      const market = standardValueByFpid.get(row.fpid);
      if (!tier || market === undefined) continue;
      const key = `${row.position}:${tier.tier}`;
      const group = tierGroups.get(key) ?? {
        position: row.position,
        tier: tier.tier,
        diffs: [],
      };
      group.diffs.push(row.dollarValue - market);
      tierGroups.set(key, group);
    }
    // Single-player groups are too noisy to generalize into a tier-level
    // takeaway - require at least 2 comparable players.
    const tierGaps: TierGap[] = Array.from(tierGroups.values())
      .filter((group) => group.diffs.length >= 2)
      .map((group) => ({
        position: group.position,
        tier: group.tier,
        avgDiff:
          Math.round(
            (group.diffs.reduce((sum, d) => sum + d, 0) / group.diffs.length) *
              10,
          ) / 10,
        playerCount: group.diffs.length,
      }))
      .sort((a, b) => a.position.localeCompare(b.position) || a.tier - b.tier);

    const lastSeason = String(Number(season.year) - 1);
    const valueGaps = await ctx.runQuery(api.valueGaps.getAllValueGaps, {
      week: args.week,
      scoringConfig: args.scoringConfig,
      lastSeason,
    });
    const gapCountByKey = new Map<string, number>();
    for (const gap of valueGaps) {
      const key = `${gap.position}:${gap.direction}`;
      gapCountByKey.set(key, (gapCountByKey.get(key) ?? 0) + 1);
    }
    const valueGapCounts: ValueGapCount[] = Array.from(
      gapCountByKey.entries(),
    ).map(([key, count]) => {
      const [position, direction] = key.split(":") as [Position, string];
      return { position, direction, count };
    });

    // Kept players' positions come straight off draftPicks (no join needed -
    // see convex/schema.ts's draftPicks.position) - same by_draft_keeper
    // index draftValues.ts already reads to exclude keepers from the pool.
    const keepers = await ctx.db
      .query("draftPicks")
      .withIndex("by_draft_keeper", (q) =>
        q.eq("draftId", draft._id).eq("isKeeper", true),
      )
      .collect();
    const keptCountByPos = new Map<Position, number>();
    for (const keeper of keepers) {
      keptCountByPos.set(
        keeper.position,
        (keptCountByPos.get(keeper.position) ?? 0) + 1,
      );
    }
    // Rough starter-demand estimate: dedicated slots plus an even share of
    // FLEX/SUPERFLEX spread across their eligible positions - a simpler
    // approximation than draftValues.ts's exact nonFlexDemand/flex-winner
    // math, which is precise enough for a per-player $ engine but overkill
    // for a directional "how thin is this position" read.
    const flexShare =
      season.rosterSlots.FLEX > 0 && season.flexPositions.length > 0
        ? season.rosterSlots.FLEX / season.flexPositions.length
        : 0;
    const superflexShare =
      season.rosterSlots.SUPERFLEX > 0 && season.superflexPositions.length > 0
        ? season.rosterSlots.SUPERFLEX / season.superflexPositions.length
        : 0;
    const keeperScarcity: KeeperScarcity[] = activePositions
      .map((position) => {
        const dedicated = season.rosterSlots[position] ?? 0;
        const flexBonus = season.flexPositions.includes(position)
          ? flexShare
          : 0;
        const superflexBonus = season.superflexPositions.includes(position)
          ? superflexShare
          : 0;
        const starterDemand =
          season.teamCount * (dedicated + flexBonus + superflexBonus);
        const keptCount = keptCountByPos.get(position) ?? 0;
        return {
          position,
          keptCount,
          starterDemand: Math.round(starterDemand * 10) / 10,
          pctFilled:
            starterDemand > 0
              ? Math.round((keptCount / starterDemand) * 1000) / 10
              : 0,
        };
      })
      // Only surface positions keepers have actually touched - keeps the
      // prompt small and avoids a wall of "0 kept" rows.
      .filter((row) => row.keptCount > 0);

    return {
      teamCount: season.teamCount,
      tierGaps,
      valueGapCounts,
      keeperScarcity,
      inputsFingerprint: buildInputsFingerprint(
        season,
        keepers.map((k) => k.fpid),
      ),
    };
  },
});

function formatSigned(amount: number): string {
  return amount >= 0
    ? `+$${Math.round(amount)}`
    : `-$${Math.round(Math.abs(amount))}`;
}

// Forces Gemini's response into { insights: [{ headline, body }] } - see
// convex/gemini/reportSummary.ts's RESPONSE_SCHEMA for the same pattern.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    insights: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          headline: { type: "STRING" },
          body: { type: "STRING" },
        },
        required: ["headline", "body"],
      },
    },
  },
  required: ["insights"],
};

function buildInsightsPrompt(inputs: InsightsInputs): string {
  const payload = {
    totalTeams: inputs.teamCount,
    dollarValueVsMarketByPositionTier: inputs.tierGaps.map((gap) => ({
      position: gap.position,
      tier: gap.tier,
      players: gap.playerCount,
      avgDiffVsMarket: formatSigned(gap.avgDiff),
    })),
    valueGapSignal: inputs.valueGapCounts.map(
      (gap) => `${gap.position} ${gap.direction}: ${gap.count}`,
    ),
    keeperScarcityByPosition: inputs.keeperScarcity.map((row) => ({
      position: row.position,
      keptCount: row.keptCount,
      estimatedStartingSlotsLeagueWide: row.starterDemand,
      pctOfStartingSlotsAlreadyKept: `${row.pctFilled}%`,
    })),
  };

  return [
    "You are a fantasy football draft strategy assistant writing a short pre-draft briefing for one specific league, based on data comparing this league's own dollar-value engine (tuned to its exact roster/scoring settings) against the broader market, plus how many likely starting roster spots keepers have already taken off the board.",
    "Use only the facts in the JSON data below - don't invent players, prices, or stats that aren't there, and don't name individual players by name (this data is aggregated by position/tier, not per-player).",
    "Respond with JSON matching the given schema: 3-5 insights, each a short headline plus a 1-2 sentence body in plain, conversational language a casual fantasy player would understand.",
    "",
    "dollarValueVsMarketByPositionTier: avgDiffVsMarket is this league's own computed value MINUS the broader market's typical auction value, averaged across the players in that position/tier. A negative number means this league's math values that tier LOWER than the market typically pays - i.e. other drafters in a market-priced auction might overpay there, so there's a strategic opportunity to let that tier go and find value lower down. A positive number means the opposite - this league's settings make that tier worth MORE than a typical market price, i.e. a bargain if it's still available near market price.",
    "valueGapSignal: counts of players per position flagged as undervalued/overvalued (ADP vs. actual track record + projection mismatch) or breakout/falloff (a track-record-vs-outlook mismatch) - higher counts mean more mispriced players at that position this year.",
    "keeperScarcityByPosition: pctOfStartingSlotsAlreadyKept estimates how much of the league-wide starting need at a position has already been claimed by keepers before the draft even starts - a high percentage means that position's remaining pool is thin, so drafters may need to be more aggressive/pay a premium to lock in a starter there. Positions absent from this list have no notable keeper activity - don't invent a keeper angle for them.",
    "Ground every insight in these specific numbers - reference the position and tier or the percentage when relevant, don't give generic advice that could apply to any league. If a data section is empty, don't write an insight about it.",
    "",
    JSON.stringify(payload),
  ].join("\n");
}

export const hasCachedInsights = internalQuery({
  args: {
    seasonId: v.id("seasons"),
    week: v.string(),
    scoring: scoringValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("preDraftInsights")
      .withIndex("by_season_week_scoring", (q) =>
        q
          .eq("seasonId", args.seasonId)
          .eq("week", args.week)
          .eq("scoring", args.scoring),
      )
      .unique();
    return existing !== null;
  },
});

export const saveInsights = internalMutation({
  args: {
    seasonId: v.id("seasons"),
    week: v.string(),
    scoring: scoringValidator,
    insights: v.array(v.object({ headline: v.string(), body: v.string() })),
    inputsFingerprint: v.string(),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("preDraftInsights")
      .withIndex("by_season_week_scoring", (q) =>
        q
          .eq("seasonId", args.seasonId)
          .eq("week", args.week)
          .eq("scoring", args.scoring),
      )
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    await ctx.db.insert("preDraftInsights", {
      seasonId: args.seasonId,
      week: args.week,
      scoring: args.scoring,
      insights: args.insights,
      inputsFingerprint: args.inputsFingerprint,
      model: args.model,
      generatedAt: Date.now(),
    });
  },
});

// Scheduled by convex/draft/insights.ts's ensureInsightsGenerated/
// regenerateInsights - best-effort, same resilience posture as
// convex/gemini/reportSummary.ts's generateReportSummary: any failure
// (missing API key, Gemini error, bad JSON) is caught and logged rather than
// thrown, since nothing is waiting synchronously on this and the frontend
// just keeps showing "not generated yet" until the next attempt.
export const generatePreDraftInsights = internalAction({
  args: {
    seasonId: v.id("seasons"),
    week: v.string(),
    scoringConfig: scoringConfigValidator,
  },
  handler: async (ctx, args) => {
    const scoring = args.scoringConfig.scoring;

    const alreadyGenerated: boolean = await ctx.runQuery(
      internal.gemini.preDraftInsights.hasCachedInsights,
      { seasonId: args.seasonId, week: args.week, scoring },
    );
    if (alreadyGenerated) return;

    const inputs = await ctx.runQuery(
      internal.gemini.preDraftInsights.gatherInsightsInputs,
      args,
    );
    if (!inputs) return;

    let raw: string;
    try {
      raw = await generateGeminiText(buildInsightsPrompt(inputs), {
        maxOutputTokens: 2000,
        responseSchema: RESPONSE_SCHEMA,
      });
    } catch (err) {
      console.error("Gemini pre-draft insights generation failed", err);
      return;
    }

    let parsed: { insights: Array<{ headline: string; body: string }> };
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("Gemini pre-draft insights returned invalid JSON", err, raw);
      return;
    }
    if (!Array.isArray(parsed.insights)) {
      console.error("Gemini pre-draft insights JSON missing expected fields", parsed);
      return;
    }
    const insights = parsed.insights.filter(
      (i) => typeof i?.headline === "string" && typeof i?.body === "string",
    );
    if (insights.length === 0) return;

    await ctx.runMutation(internal.gemini.preDraftInsights.saveInsights, {
      seasonId: args.seasonId,
      week: args.week,
      scoring,
      insights,
      inputsFingerprint: inputs.inputsFingerprint,
      model: MODEL,
    });
  },
});
