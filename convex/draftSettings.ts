import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { positionValidator } from "./positions";
import { scoringValidator } from "./scoring";

const rosterSlotsValidator = v.object({
  QB: v.number(),
  RB: v.number(),
  WR: v.number(),
  TE: v.number(),
  DST: v.number(),
  FLEX: v.number(),
  BENCH: v.number(),
});

export const listDraftSettings = query({
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
    replacementFallbackPct: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("draftSettings", {
      ...args,
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
    replacementFallbackPct: v.number(),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, fields);
    return await ctx.db.get(id);
  },
});
