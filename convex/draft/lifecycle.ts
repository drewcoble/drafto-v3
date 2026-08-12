import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireDraftOwner } from "./auth";
import { syncDraftStatus } from "./status";

// The one deliberate "begin the live auction" action - previously the app
// had no such moment at all (drafts.status was purely derived from pick
// count, so adding a keeper pre-draft silently looked like the auction had
// started). Locks league configuration (see requireDraftNotStarted's
// callers) and unblocks nomination (requireDraftStarted's callers).
export const startDraft = mutation({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    const { season, draft } = await requireDraftOwner(ctx, args.seasonId);
    if (draft.startedAt !== undefined) {
      throw new Error("This draft has already started.");
    }
    const teams = await ctx.db
      .query("seasonTeams")
      .withIndex("by_season", (q) => q.eq("seasonId", season._id))
      .first();
    if (!teams) {
      throw new Error("Add at least one team before starting the draft.");
    }
    await ctx.db.patch(draft._id, { startedAt: Date.now() });
    await syncDraftStatus(ctx, draft._id);
    return null;
  },
});

// Reverses startDraft - only while nothing has actually been drafted yet
// (keepers don't count, since those are meant to be added pre-draft). Once
// a real pick exists, the auction has genuinely begun and there's no way
// back to "pre_draft" other than undoing picks first (undoLastPick).
export const reopenPreDraft = mutation({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    const { draft } = await requireDraftOwner(ctx, args.seasonId);
    if (draft.startedAt === undefined) {
      throw new Error("This draft hasn't been started.");
    }
    const picks = await ctx.db
      .query("draftPicks")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
      .collect();
    if (picks.some((pick) => !pick.isKeeper)) {
      throw new Error(
        "Players have already been drafted - undo those picks before reopening pre-draft.",
      );
    }
    await ctx.db.patch(draft._id, { startedAt: undefined });
    await syncDraftStatus(ctx, draft._id);
    return null;
  },
});
