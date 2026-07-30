import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireDraftOwner } from "./auth";
import { nextNominator } from "./nominationOrder";
import { invalidateDraftValues } from "../draftValues";

export const listDraftPicks = query({
  args: { draftSettingsId: v.id("draftSettings") },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);
    return await ctx.db
      .query("draftPicks")
      .withIndex("by_draft_sequence", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .collect();
  },
});

export const getActiveNomination = query({
  args: { draftSettingsId: v.id("draftSettings") },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);
    return await ctx.db
      .query("draftNominations")
      .withIndex("by_draft", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .first();
  },
});

export const nominate = mutation({
  args: {
    draftSettingsId: v.id("draftSettings"),
    fpid: v.number(),
    nominatingTeamId: v.id("draftTeams"),
    openingBid: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);

    const alreadyPicked = await ctx.db
      .query("draftPicks")
      .withIndex("by_draft_fpid", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId).eq("fpid", args.fpid),
      )
      .first();
    if (alreadyPicked) {
      throw new Error("This player has already been drafted.");
    }

    const activeNomination = await ctx.db
      .query("draftNominations")
      .withIndex("by_draft", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .first();
    if (activeNomination) {
      throw new Error(
        "Another player is already on the block - resolve or pass on it first.",
      );
    }

    const player = await ctx.db
      .query("players")
      .withIndex("by_fpid", (q) => q.eq("fpid", args.fpid))
      .first();
    if (!player) {
      throw new Error("Player not found.");
    }

    const nominationId = await ctx.db.insert("draftNominations", {
      draftSettingsId: args.draftSettingsId,
      fpid: args.fpid,
      position: player.position,
      nominatingTeamId: args.nominatingTeamId,
      currentBid: Math.max(args.openingBid ?? 1, 1),
      createdAt: Date.now(),
    });

    // Advance "whose turn is it" for next time, when an order is
    // configured and the host hasn't cleared it to manual (null) - see
    // convex/draft/nominationOrder.ts. This only ever updates the
    // suggestion the nominate UI defaults to next; it never blocks who was
    // just allowed to nominate here (nominatingTeamId above is whatever the
    // frontend sent, which may already differ from the suggestion).
    const draftSettings = await ctx.db.get(args.draftSettingsId);
    if (draftSettings?.nominationOrder && draftSettings.nominationOrderMode) {
      const turn = await ctx.db
        .query("draftNominationTurns")
        .withIndex("by_draft", (q) =>
          q.eq("draftSettingsId", args.draftSettingsId),
        )
        .first();
      if (turn && turn.currentTeamId !== null) {
        const next = nextNominator(
          draftSettings.nominationOrder,
          draftSettings.nominationOrderMode,
          turn.currentTeamId,
          turn.direction,
        );
        await ctx.db.patch(turn._id, {
          currentTeamId: next.teamId,
          direction: next.direction,
          updatedAt: Date.now(),
        });
      }
    }

    return nominationId;
  },
});

export const bumpNominationBid = mutation({
  args: { draftSettingsId: v.id("draftSettings"), delta: v.number() },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);
    const nomination = await ctx.db
      .query("draftNominations")
      .withIndex("by_draft", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .first();
    if (!nomination) {
      throw new Error("Nothing is currently on the block.");
    }
    const nextBid = Math.max(nomination.currentBid + args.delta, 1);
    await ctx.db.patch(nomination._id, { currentBid: nextBid });
    return nextBid;
  },
});

export const passNomination = mutation({
  args: { draftSettingsId: v.id("draftSettings") },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);
    const nomination = await ctx.db
      .query("draftNominations")
      .withIndex("by_draft", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .first();
    if (!nomination) {
      throw new Error("Nothing is currently on the block.");
    }
    await ctx.db.delete(nomination._id);
    return null;
  },
});

// Single write path for both "I won" and "someone else won" - the frontend
// just supplies which team the price is being logged against.
export const resolvePick = mutation({
  args: {
    draftSettingsId: v.id("draftSettings"),
    fpid: v.number(),
    teamId: v.id("draftTeams"),
    price: v.number(),
    planSlotKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);

    const nomination = await ctx.db
      .query("draftNominations")
      .withIndex("by_draft", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .first();
    if (!nomination || nomination.fpid !== args.fpid) {
      throw new Error("This player isn't currently on the block.");
    }

    const lastPick = await ctx.db
      .query("draftPicks")
      .withIndex("by_draft_sequence", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .order("desc")
      .first();
    const sequence = (lastPick?.sequence ?? 0) + 1;

    const pickId = await ctx.db.insert("draftPicks", {
      draftSettingsId: args.draftSettingsId,
      sequence,
      fpid: args.fpid,
      position: nomination.position,
      teamId: args.teamId,
      price: args.price,
      createdAt: Date.now(),
      ...(args.planSlotKey !== undefined
        ? { planSlotKey: args.planSlotKey }
        : {}),
    });
    await ctx.db.delete(nomination._id);
    return pickId;
  },
});

// Pre-draft equivalent of resolvePick - assigns a player straight to a team
// for a fixed price with no nomination to consume, so this can run any time
// before (or independent of) the live auction. Tagged isKeeper: true so the
// value engine (convex/draftValues.ts) and UI can tell it apart from a real
// auction result.
export const addKeeper = mutation({
  args: {
    draftSettingsId: v.id("draftSettings"),
    teamId: v.id("draftTeams"),
    fpid: v.number(),
    price: v.number(),
    planSlotKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);

    const team = await ctx.db.get(args.teamId);
    if (!team || team.draftSettingsId !== args.draftSettingsId) {
      throw new Error("Team not found in this draft.");
    }

    const alreadyPicked = await ctx.db
      .query("draftPicks")
      .withIndex("by_draft_fpid", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId).eq("fpid", args.fpid),
      )
      .first();
    if (alreadyPicked) {
      throw new Error("This player has already been drafted.");
    }

    const player = await ctx.db
      .query("players")
      .withIndex("by_fpid", (q) => q.eq("fpid", args.fpid))
      .first();
    if (!player) {
      throw new Error("Player not found.");
    }

    const lastPick = await ctx.db
      .query("draftPicks")
      .withIndex("by_draft_sequence", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .order("desc")
      .first();
    const sequence = (lastPick?.sequence ?? 0) + 1;

    const pickId = await ctx.db.insert("draftPicks", {
      draftSettingsId: args.draftSettingsId,
      sequence,
      fpid: args.fpid,
      position: player.position,
      teamId: args.teamId,
      price: args.price,
      isKeeper: true,
      createdAt: Date.now(),
      ...(args.planSlotKey !== undefined
        ? { planSlotKey: args.planSlotKey }
        : {}),
    });
    // Keepers shift getDraftValues' $ engine (excluded from the pool,
    // replacement demand reduced) - see convex/draftValues.ts.
    await invalidateDraftValues(ctx, args.draftSettingsId);
    return pickId;
  },
});

// Deletes a keeper specifically - throws on a normal auction pick so this
// can't be used to silently undo a live result out of sequence the way
// undoLastPick intentionally can.
export const removeKeeper = mutation({
  args: { pickId: v.id("draftPicks") },
  handler: async (ctx, args) => {
    const pick = await ctx.db.get(args.pickId);
    if (!pick) {
      throw new Error("Pick not found.");
    }
    await requireDraftOwner(ctx, pick.draftSettingsId);
    if (!pick.isKeeper) {
      throw new Error("This pick isn't a keeper.");
    }
    await ctx.db.delete(args.pickId);
    await invalidateDraftValues(ctx, pick.draftSettingsId);
    return null;
  },
});

// General-purpose removal for any single pick - keeper or live auction
// result, any team, regardless of sequence position. Unlike undoLastPick
// (LIFO-only) or removeKeeper (keeper-only), this is what the Draft Room's
// roster views (DraftTab's recent picks, MyTeamTab, LeagueTab's per-team
// breakdown) use to fix a mis-logged pick or drop a keeper without having to
// undo everything drafted after it.
export const removePick = mutation({
  args: { pickId: v.id("draftPicks") },
  handler: async (ctx, args) => {
    const pick = await ctx.db.get(args.pickId);
    if (!pick) {
      throw new Error("Pick not found.");
    }
    await requireDraftOwner(ctx, pick.draftSettingsId);
    await ctx.db.delete(args.pickId);
    // Dropping a keeper (this can remove any pick, keeper or not - see
    // comment above) shifts getDraftValues' $ engine the same way
    // removeKeeper's dedicated path does.
    if (pick.isKeeper) {
      await invalidateDraftValues(ctx, pick.draftSettingsId);
    }
    return pick;
  },
});

// Undo is a plain delete of the highest-sequence pick - nothing stores a
// running budget balance anywhere, so deleting the row is the entire refund.
export const undoLastPick = mutation({
  args: { draftSettingsId: v.id("draftSettings") },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);
    const lastPick = await ctx.db
      .query("draftPicks")
      .withIndex("by_draft_sequence", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .order("desc")
      .first();
    if (!lastPick) {
      throw new Error("No picks to undo.");
    }
    await ctx.db.delete(lastPick._id);
    // A keeper can be the most-recent pick (sequence is shared with regular
    // picks) during setup, before the live auction starts - see removePick's
    // comment.
    if (lastPick.isKeeper) {
      await invalidateDraftValues(ctx, args.draftSettingsId);
    }
    return lastPick;
  },
});
