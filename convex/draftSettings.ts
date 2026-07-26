import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { positionValidator } from "./positions";
import { scoringValidator } from "./scoring";

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
    return await ctx.db.insert("draftSettings", {
      ...args,
      ownerId: userId,
      createdAt: Date.now(),
    });
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
    return await ctx.db.get(id);
  },
});
