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
      // New targets append to the end of the Shortlist tab's order - read
      // every tag for this draft (same bounded per-draft read listPlayerTags
      // already does) just to find the current max order among targets.
      const allTags = await ctx.db
        .query("draftPlayerTags")
        .withIndex("by_draft", (q) =>
          q.eq("draftSettingsId", args.draftSettingsId),
        )
        .collect();
      const maxOrder = allTags
        .filter((tag) => tag.tag === "target")
        .reduce((max, tag) => Math.max(max, tag.order ?? -1), -1);
      return await ctx.db.insert("draftPlayerTags", {
        draftSettingsId: args.draftSettingsId,
        fpid: args.fpid,
        tag: "target",
        order: maxOrder + 1,
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

// Direct one-step removal (any tag -> no-opinion) - used by the Shortlist
// tab's "Remove" action, where stepping through cyclePlayerTag's
// target -> avoid -> gone sequence would leave a target briefly (and
// confusingly) marked avoid instead of just disappearing from the list.
export const clearPlayerTag = mutation({
  args: { draftSettingsId: v.id("draftSettings"), fpid: v.number() },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);
    const existing = await ctx.db
      .query("draftPlayerTags")
      .withIndex("by_draft_fpid", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId).eq("fpid", args.fpid),
      )
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

// Rewrites the shortlist's display order to match `fpids` - the full,
// reordered list of every currently-"target"-tagged player's fpid, sent as
// one array from the Shortlist tab's up/down controls rather than a
// single-item move, since order is a dense 0..n-1 sequence over the whole
// list, not a per-row property that can be nudged in isolation. Rows whose
// order is already correct are left untouched, so a one-step swap only ever
// writes the two rows that actually moved.
export const reorderShortlist = mutation({
  args: {
    draftSettingsId: v.id("draftSettings"),
    fpids: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);
    for (let i = 0; i < args.fpids.length; i++) {
      const tag = await ctx.db
        .query("draftPlayerTags")
        .withIndex("by_draft_fpid", (q) =>
          q
            .eq("draftSettingsId", args.draftSettingsId)
            .eq("fpid", args.fpids[i]!),
        )
        .first();
      if (tag && tag.tag === "target" && tag.order !== i) {
        await ctx.db.patch(tag._id, { order: i, updatedAt: Date.now() });
      }
    }
    return null;
  },
});
