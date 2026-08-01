import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { positionValidator } from "./positions";
import { scoringValidator } from "./scoring";
import { invalidateDraftValues, refreshDraftValuesForLeague } from "./draftValues";
import { ensureValueGapsCached } from "./valueGaps";

// Mirrors src/constants/general.ts's WEEK - the single season-long
// draft-prep dataset every Draft Room query reads (not a real NFL week). See
// convex/draft/tiers.ts for why convex/ duplicates rather than imports
// frontend constants.
const DRAFT_PREP_WEEK = "0";

const rosterSlotsValidator = v.object({
  QB: v.number(),
  RB: v.number(),
  WR: v.number(),
  TE: v.number(),
  DST: v.number(),
  K: v.number(),
  FLEX: v.number(),
  SUPERFLEX: v.number(),
  BENCH: v.number(),
});

// Leagues are single-owner - each user only ever sees/edits their own.
export const listDraftSettings = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("You must be signed in.");
    }
    return await ctx.db
      .query("draftSettings")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect();
  },
});

// Every league across every owner, no auth scoping - only for
// fetchAllData's daily draftValues cache refresh (convex/fetchAllData.ts),
// which runs as a super-admin action with no signed-in "owner" of its own.
export const listAllDraftSettings = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("draftSettings").collect();
  },
});

export const createDraftSettings = mutation({
  args: {
    name: v.string(),
    teamCount: v.number(),
    salaryCap: v.number(),
    scoring: scoringValidator,
    rosterSlots: rosterSlotsValidator,
    flexPositions: v.array(positionValidator),
    superflexPositions: v.array(positionValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("You must be signed in.");
    }
    const id = await ctx.db.insert("draftSettings", {
      ...args,
      ownerId: userId,
      createdAt: Date.now(),
    });

    // Seed this league's draftValues cache (and valueGaps, if this scoring
    // format hasn't been seeded by another league yet) immediately, rather
    // than leaving it empty until the next daily cron run - an empty cache
    // forces every Draft Room subscription onto the expensive live-compute
    // path (see convex/draftValues.ts / convex/valueGaps.ts cache comments).
    // A league created directly (not cloned) has no `season` set yet, so
    // mirror the same current-year fallback the frontend uses (see
    // DraftTab.tsx's `thisSeason`).
    const thisSeason = String(new Date().getFullYear());
    await refreshDraftValuesForLeague(ctx, {
      draftSettingsId: id,
      week: DRAFT_PREP_WEEK,
      scoring: args.scoring,
    });
    await ensureValueGapsCached(ctx, {
      week: DRAFT_PREP_WEEK,
      scoring: args.scoring,
      lastSeason: String(Number(thisSeason) - 1),
    });

    return id;
  },
});

export const updateDraftSettings = mutation({
  args: {
    id: v.id("draftSettings"),
    name: v.string(),
    teamCount: v.number(),
    salaryCap: v.number(),
    scoring: scoringValidator,
    rosterSlots: rosterSlotsValidator,
    flexPositions: v.array(positionValidator),
    superflexPositions: v.array(positionValidator),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("You must be signed in.");
    }
    const { id, ...fields } = args;
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("League not found.");
    }
    if (existing.ownerId !== userId) {
      throw new Error("Not authorized to edit this league.");
    }
    await ctx.db.patch(id, fields);
    // Every field here (teamCount, salaryCap, scoring, rosterSlots,
    // flex/superflexPositions) feeds getDraftValues' $ engine - see
    // convex/draftValues.ts.
    await invalidateDraftValues(ctx, id);
    return await ctx.db.get(id);
  },
});
