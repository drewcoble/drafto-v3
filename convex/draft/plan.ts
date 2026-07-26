import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireDraftOwner } from "./auth";

export const getBudgetPlan = query({
  args: { draftSettingsId: v.id("draftSettings") },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);
    return await ctx.db
      .query("draftBudgetPlans")
      .withIndex("by_draft", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .first();
  },
});

// Preset formulas (Stars & Scrubs, Balanced, Zero RB, Superflex Heavy) are
// pure client-side functions that populate the Budget tab's form before
// Save - this is the only write path, called once the user confirms
// whatever amounts are showing.
export const upsertBudgetPlan = mutation({
  args: {
    draftSettingsId: v.id("draftSettings"),
    amounts: v.record(v.string(), v.number()),
    overspendBehavior: v.union(
      v.literal("bench"),
      v.literal("spread"),
      v.literal("ask"),
    ),
  },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);
    const existing = await ctx.db
      .query("draftBudgetPlans")
      .withIndex("by_draft", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .first();
    const fields = {
      amounts: args.amounts,
      overspendBehavior: args.overspendBehavior,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("draftBudgetPlans", {
      draftSettingsId: args.draftSettingsId,
      ...fields,
    });
  },
});
