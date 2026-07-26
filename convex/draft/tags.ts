import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireDraftOwner } from "./auth";

export const listPlayerTags = query({
  args: { draftSettingsId: v.id("draftSettings") },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);
    return await ctx.db
      .query("draftPlayerTags")
      .withIndex("by_draft", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .collect();
  },
});

// Single write path for the bar-click interaction: cycles a player through
// no-opinion -> target -> avoid -> no-opinion, so the frontend never has to
// know the current state to decide what to write next.
export const cyclePlayerTag = mutation({
  args: { draftSettingsId: v.id("draftSettings"), fpid: v.number() },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);
    const existing = await ctx.db
      .query("draftPlayerTags")
      .withIndex("by_draft_fpid", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId).eq("fpid", args.fpid),
      )
      .first();

    if (!existing) {
      return await ctx.db.insert("draftPlayerTags", {
        draftSettingsId: args.draftSettingsId,
        fpid: args.fpid,
        tag: "target",
        updatedAt: Date.now(),
      });
    }
    if (existing.tag === "target") {
      await ctx.db.patch(existing._id, { tag: "avoid", updatedAt: Date.now() });
      return existing._id;
    }
    await ctx.db.delete(existing._id);
    return null;
  },
});
