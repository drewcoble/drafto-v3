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
  adpForScoring,
  scoringConfigValidator,
  scoringValidator,
  type ScoringConfig,
} from "../scoring";
import { getRealDraftValues } from "../draftValues";
import { computeTiers, RELEVANT_ADP_CEILING } from "../draft/tiers";
import { resolveDraftType, type DraftType } from "../draftType";
import { generateGeminiText, MODEL } from "./client";

type Position = (typeof POSITIONS)[number];

// Same "premier positions" list convex/valueGaps.ts's VALUE_GAP_POSITIONS
// already established for its own signal - K is never actionable strategy
// advice, and DST's value is too shallow/flat to generate a meaningful
// tier/rank signal either. Used below to keep every value/rank-based
// signal (tierGaps, positionAdpGaps, keeperScarcity) scoped to positions
// worth an insight about.
const PREMIER_POSITIONS: Position[] = ["QB", "RB", "WR", "TE"];

interface TierGap {
  position: Position;
  tier: number;
  avgDiff: number;
  playerCount: number;
}

// Snake/linear only - see gatherInsightsInputs. A whole-position rollup of
// the same per-player vs-ADP diff tierGaps groups by (position, tier) -
// tierGaps alone requires the model to notice a pattern repeating across
// several tier rows before it can say "this whole position," which isn't
// reliable; this hands it the aggregate directly.
interface PositionAdpGap {
  position: Position;
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
  format: DraftType;
  tierGaps: TierGap[];
  positionAdpGaps: PositionAdpGap[];
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
    | "draftType"
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
    // $-vs-market and ADP-vs-league-rank produce entirely different insight
    // content from the same underlying data - a post-creation format
    // correction (setDraftType) must invalidate any previously cached
    // insights, not just leave them looking merely "stale."
    draftType: season.draftType ?? "auction",
  });
}

interface StandardValueRow {
  rank: number;
  auctionValue: number;
}

// Mirrors src/lib/standardValues.ts's buildStandardValueByFpid (convex/
// never imports from src/ - see convex/draft/tiers.ts's comment on the same
// duplication convention). Returns both rank and auctionValue (the frontend
// version's full StandardValueRow shape) - auction's $-vs-market gap only
// needs auctionValue, but snake/linear's blended-ADP signal below needs
// ESPN's overall rank too, the same "second market-consensus source" role
// it plays for PlayersTable.tsx's ADP column (src/lib/valueRank.ts) and
// convex/valueGaps.ts's buildEspnRankByFpid.
async function buildStandardValueByFpid(
  ctx: QueryCtx,
  season: string,
  scoring: ScoringConfig["scoring"],
  isSuperflex: boolean,
): Promise<Map<number, StandardValueRow>> {
  const loadFormat = async (format: "standard" | "ppr" | "superflex") => {
    const rows = await ctx.db
      .query("standardValues")
      .withIndex("by_platform_format_season_fpid", (q) =>
        q.eq("platform", "espn").eq("format", format).eq("season", season),
      )
      .collect();
    return new Map(
      rows.map((row) => [
        row.fpid,
        { rank: row.rank, auctionValue: row.auctionValue },
      ]),
    );
  };

  if (isSuperflex) return loadFormat("superflex");
  if (scoring === "STD") return loadFormat("standard");
  if (scoring === "PPR") return loadFormat("ppr");

  const [std, ppr] = await Promise.all([
    loadFormat("standard"),
    loadFormat("ppr"),
  ]);
  const merged = new Map<number, StandardValueRow>();
  for (const fpid of new Set([...std.keys(), ...ppr.keys()])) {
    const a = std.get(fpid);
    const b = ppr.get(fpid);
    merged.set(
      fpid,
      a && b
        ? {
            rank: (a.rank + b.rank) / 2,
            auctionValue: (a.auctionValue + b.auctionValue) / 2,
          }
        : (a ?? b)!,
    );
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

    const format = resolveDraftType(season, draft);
    const isAuction = format === "auction";

    // The pool every value/rank-based signal below reasons over - premier
    // positions only (see PREMIER_POSITIONS), and only players with a real,
    // meaningfully-ranked market ADP (Sleeper, under RELEVANT_ADP_CEILING -
    // same cutoff computeTiers uses to keep deep-bench noise out of tier
    // clustering). Without this, a late-round/undrafted-in-practice player
    // with no real ADP (Sleeper's own "no real ADP" sentinel, far past any
    // realistic draft position) can still show up in `values` with some
    // small nonzero dollarValue, producing a wildly misleading vs-ADP or
    // vs-market gap that's not a real signal - just noise from comparing
    // against a number that was never a genuine market opinion.
    const relevantValues = values.filter((row) => {
      if (!PREMIER_POSITIONS.includes(row.position)) return false;
      const adpRow = adpByFpid.get(row.fpid);
      const sleeperAdp = adpRow
        ? adpForScoring(adpRow, args.scoringConfig.scoring)
        : undefined;
      return sleeperAdp !== undefined && sleeperAdp < RELEVANT_ADP_CEILING;
    });

    // Average diff per (position, tier) group, aggregated so the model
    // reasons at tier level, not per player. Auction: (our $ - market $),
    // the same per-player diff src/components/StandardValueLabel.tsx
    // already renders. Snake/linear: this league's own overall rank
    // (pooled across every position by dollarValue - see below) vs. a
    // blended market ADP, converted to rounds - $ value has no meaning to a
    // snake drafter, but "this tier goes about a round earlier/later than
    // ADP suggests" does. Same methodology (and, deliberately, the same
    // sign convention) as PlayersTable.tsx's "vs ADP" column
    // (src/lib/valueRank.ts/AdpValueLabel.tsx) - convex/ can't import from
    // src/ (see buildStandardValueByFpid's comment), so this mirrors it
    // rather than sharing code.
    const tierGroups = new Map<
      string,
      { position: Position; tier: number; diffs: number[] }
    >();
    const positionGroups = new Map<
      Position,
      { position: Position; diffs: number[] }
    >();
    if (isAuction) {
      const isSuperflex = season.rosterSlots.SUPERFLEX > 0;
      const standardValueByFpid = await buildStandardValueByFpid(
        ctx,
        season.year,
        args.scoringConfig.scoring,
        isSuperflex,
      );
      for (const row of relevantValues) {
        const tier = tiersByFpid.get(row.fpid);
        const market = standardValueByFpid.get(row.fpid)?.auctionValue;
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
    } else {
      const isSuperflex = season.rosterSlots.SUPERFLEX > 0;
      const standardValueByFpid = await buildStandardValueByFpid(
        ctx,
        season.year,
        args.scoringConfig.scoring,
        isSuperflex,
      );
      // Blended overall (cross-position) ADP: Sleeper ADP averaged with
      // ESPN's overall rank - both already overall numbers, not
      // position-relative, same blend PlayersTable.tsx's blendedAdpByFpid
      // builds. Superflex leagues use ESPN's superflex rank alone -
      // Sleeper's `rankings` table has no superflex-aware ADP field at all,
      // so blending it in would understate QBs relative to a real
      // superflex draft (same precedent buildStandardValueByFpid already
      // sets for auction's HALF-averaging). Sleeper's side is dropped for
      // any player past RELEVANT_ADP_CEILING (or missing a real ADP
      // entirely, Sleeper's own 999 sentinel) - unlike ESPN's data (which
      // simply has no row for a player it doesn't rank), a raw Sleeper ADP
      // value can't be trusted to mean "no real ADP" on its own.
      const blendedAdpByFpid = new Map<number, number>();
      for (const row of relevantValues) {
        const espnRank = standardValueByFpid.get(row.fpid)?.rank;
        if (isSuperflex) {
          if (espnRank !== undefined) blendedAdpByFpid.set(row.fpid, espnRank);
          continue;
        }
        const adpRow = adpByFpid.get(row.fpid);
        const rawSleeperAdp = adpRow
          ? adpForScoring(adpRow, args.scoringConfig.scoring)
          : undefined;
        const sleeperAdp =
          rawSleeperAdp !== undefined && rawSleeperAdp < RELEVANT_ADP_CEILING
            ? rawSleeperAdp
            : undefined;
        if (sleeperAdp !== undefined && espnRank !== undefined) {
          blendedAdpByFpid.set(row.fpid, (sleeperAdp + espnRank) / 2);
        } else if (sleeperAdp !== undefined) {
          blendedAdpByFpid.set(row.fpid, sleeperAdp);
        } else if (espnRank !== undefined) {
          blendedAdpByFpid.set(row.fpid, espnRank);
        }
      }

      // "Our rank": every active-position player pooled by dollarValue
      // descending - the one number that's already normalized VOR to be
      // comparable across positions (draftValues.ts's FALLOFF_EXPONENT
      // curve), reused here purely as a cross-position ranking key ($
      // itself is never surfaced to a snake/linear league). Mirrors
      // src/lib/valueRank.ts's sortValuesDescending/rankByDollarValue.
      const ourRankByFpid = new Map<number, number>();
      [...relevantValues]
        .sort((a, b) => b.dollarValue - a.dollarValue)
        .forEach((row, index) => ourRankByFpid.set(row.fpid, index + 1));

      for (const row of relevantValues) {
        const tier = tiersByFpid.get(row.fpid);
        const adp = blendedAdpByFpid.get(row.fpid);
        const ourRank = ourRankByFpid.get(row.fpid);
        if (!tier || adp === undefined || ourRank === undefined) continue;
        // Positive = ADP has this player going LATER than our own
        // cross-position rank says (a potential value if they last that
        // long); negative = ADP drafts them earlier than our math
        // justifies. Divided by team count to express the gap in rounds -
        // meaningful here specifically because both adp and ourRank are
        // already overall/cross-position numbers, exactly what a round
        // boundary (teamCount picks) spans.
        const diff = (adp - ourRank) / season.teamCount;

        const key = `${row.position}:${tier.tier}`;
        const tierGroup = tierGroups.get(key) ?? {
          position: row.position,
          tier: tier.tier,
          diffs: [],
        };
        tierGroup.diffs.push(diff);
        tierGroups.set(key, tierGroup);

        const positionGroup = positionGroups.get(row.position) ?? {
          position: row.position,
          diffs: [],
        };
        positionGroup.diffs.push(diff);
        positionGroups.set(row.position, positionGroup);
      }
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

    // Same diffs, rolled up to one row per position instead of split by
    // tier - see PositionAdpGap's comment on why this exists alongside
    // tierGaps rather than making the model infer it from several tier
    // rows. Empty for auction (positionGroups is never populated there).
    const positionAdpGaps: PositionAdpGap[] = Array.from(
      positionGroups.values(),
    )
      .filter((group) => group.diffs.length >= 2)
      .map((group) => ({
        position: group.position,
        avgDiff:
          Math.round(
            (group.diffs.reduce((sum, d) => sum + d, 0) / group.diffs.length) *
              10,
          ) / 10,
        playerCount: group.diffs.length,
      }))
      .sort((a, b) => a.position.localeCompare(b.position));

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
      .filter((position) => PREMIER_POSITIONS.includes(position))
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
      format,
      tierGaps,
      positionAdpGaps,
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

function formatRoundsSigned(rounds: number): string {
  const abs = Math.abs(rounds).toFixed(1);
  return rounds >= 0 ? `+${abs} rounds` : `-${abs} rounds`;
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
  const isAuction = inputs.format === "auction";

  const payload = {
    totalTeams: inputs.teamCount,
    ...(isAuction
      ? {
          dollarValueVsMarketByPositionTier: inputs.tierGaps.map((gap) => ({
            position: gap.position,
            tier: gap.tier,
            playersInTier: gap.playerCount,
            avgDiffVsMarketPerPlayer: formatSigned(gap.avgDiff),
          })),
        }
      : {
          adpVsThisLeagueRankByWholePosition: inputs.positionAdpGaps.map(
            (gap) => ({
              position: gap.position,
              playersConsidered: gap.playerCount,
              avgRoundsVsAdpPerPlayer: formatRoundsSigned(gap.avgDiff),
            }),
          ),
          adpVsThisLeagueRankByPositionTier: inputs.tierGaps.map((gap) => ({
            position: gap.position,
            tier: gap.tier,
            playersInTier: gap.playerCount,
            avgRoundsVsAdpPerPlayer: formatRoundsSigned(gap.avgDiff),
          })),
        }),
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

  const intro = isAuction
    ? "You are a fantasy football draft strategy assistant writing a short pre-draft briefing for one specific league, based on data comparing this league's own dollar-value engine (tuned to its exact roster/scoring settings) against the broader market, plus how many likely starting roster spots keepers have already taken off the board."
    : "You are a fantasy football draft strategy assistant writing a short pre-draft briefing for one specific snake/linear-draft league, based on data comparing this league's own player rankings (tuned to its exact roster/scoring settings) against typical draft ADP (average draft position), plus how many likely starting roster spots keepers have already taken off the board.";

  const tierSignalInstructions = isAuction
    ? "dollarValueVsMarketByPositionTier: avgDiffVsMarketPerPlayer is a PER-PLAYER AVERAGE (this league's own computed value MINUS the broader market's typical auction value, averaged across the playersInTier players in that position/tier) - it is NOT a total or a single player's price, and your wording must make that clear (e.g. 'about $X per player', 'on average'), never state it as a flat dollar figure that reads like one player's price or a lump sum. Cite playersInTier too when it fits without breaking the one-sentence limit (e.g. 'the 4 Tier 2 QBs'). A negative number means this league's math values that tier LOWER than the market typically pays - i.e. other drafters in a market-priced auction might overpay there, so there's a strategic opportunity to let that tier go and find value lower down. A positive number means the opposite - this league's settings make that tier worth MORE than a typical market price, i.e. a bargain if it's still available near market price."
    : "adpVsThisLeagueRankByWholePosition and adpVsThisLeagueRankByPositionTier both compare this league's own OVERALL rank (every drafted-relevant player pooled together by projected value, across every position) against a blended market ADP (Sleeper's ADP averaged with ESPN's own overall rank), converted to rounds by dividing by team count - byWholePosition rolls every player at a position into one number (playersConsidered), byPositionTier breaks the same comparison down by tier within a position (playersInTier) for a more specific callout when one tier stands out from the rest of its position. avgRoundsVsAdpPerPlayer in both is a PER-PLAYER AVERAGE, not one player's actual draft round - your wording must make that clear (e.g. 'about X rounds on average', 'roughly X rounds later'), never state it as a single exact round for one player. A positive number means this league's own math has that position/tier going EARLIER than typical ADP - other drafters may let them slide, so there's a value opportunity if they're still there a round or so after ADP. A negative number means the opposite - ADP drafts that position/tier earlier than this league's own math justifies (an overvalued-by-the-market signal - e.g. a whole position everyone reaches for too early), i.e. taking them right at ADP is a reach; you can likely wait. Prefer byWholePosition for a broad 'this whole position is overvalued/undervalued by ADP' takeaway (most useful when most of a position's players share the same sign) over byPositionTier's narrower per-tier framing, unless one specific tier clearly diverges from its own position's overall number.";

  const keeperSignalInstructions = isAuction
    ? "keeperScarcityByPosition: pctOfStartingSlotsAlreadyKept estimates how much of the league-wide starting need at a position has already been claimed by keepers before the draft even starts - a high percentage means that position's remaining pool is thin, so drafters may need to be more aggressive/pay a premium to lock in a starter there. Positions absent from this list have no notable keeper activity - don't invent a keeper angle for them."
    : "keeperScarcityByPosition: pctOfStartingSlotsAlreadyKept estimates how much of the league-wide starting need at a position has already been claimed by keepers before the draft even starts - a high percentage means that position's remaining pool is thin, so drafters may need to reach a round or two early to lock in a starter there. Positions absent from this list have no notable keeper activity - don't invent a keeper angle for them.";

  return [
    intro,
    "Use only the facts in the JSON data below - don't invent players, prices, or stats that aren't there, and don't name individual players by name (this data is aggregated by position/tier, not per-player).",
    "Respond with JSON matching the given schema: at most 3 insights (fewer is fine - only include the strongest signals), each a punchy headline (5 words or fewer) plus exactly one short sentence of plain, conversational body text a casual fantasy player would understand. Be terse - no throat-clearing, no restating the headline in the body, no hedging.",
    "",
    tierSignalInstructions,
    "valueGapSignal: counts of players per position flagged as undervalued/overvalued (ADP vs. actual track record + projection mismatch) or breakout/falloff (a track-record-vs-outlook mismatch) - higher counts mean more mispriced players at that position this year.",
    keeperSignalInstructions,
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
      console.error(
        "Gemini pre-draft insights returned invalid JSON",
        err,
        raw,
      );
      return;
    }
    if (!Array.isArray(parsed.insights)) {
      console.error(
        "Gemini pre-draft insights JSON missing expected fields",
        parsed,
      );
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
