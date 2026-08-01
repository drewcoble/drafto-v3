import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireDraftOwner } from "./auth";
import { nextNominator } from "./nominationOrder";
import { expandRosterSlots, isEligibleForSlot } from "./slots";
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
    nominatingTeamId: v.optional(v.id("draftTeams")),
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
      ...(args.nominatingTeamId
        ? { nominatingTeamId: args.nominatingTeamId }
        : {}),
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
        // A team with no open roster slots (bench included) has nothing
        // left to nominate for, so the rotation should skip straight past
        // it - see nextNominator's isTeamFull param.
        const allPicks = await ctx.db
          .query("draftPicks")
          .withIndex("by_draft_sequence", (q) =>
            q.eq("draftSettingsId", args.draftSettingsId),
          )
          .collect();
        const picksCountByTeam = new Map<string, number>();
        for (const pick of allPicks) {
          picksCountByTeam.set(
            pick.teamId,
            (picksCountByTeam.get(pick.teamId) ?? 0) + 1,
          );
        }
        const totalSlots = expandRosterSlots(
          draftSettings.rosterSlots,
        ).length;
        const next = nextNominator(
          draftSettings.nominationOrder,
          draftSettings.nominationOrderMode,
          turn.currentTeamId,
          turn.direction,
          (teamId) => (picksCountByTeam.get(teamId) ?? 0) >= totalSlots,
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

// Absolute-value counterpart to bumpNominationBid - lets the host type the
// final winning price directly (e.g. "$45") instead of clicking the +/-
// stepper up one dollar at a time from wherever the bid last sat.
export const setNominationBid = mutation({
  args: { draftSettingsId: v.id("draftSettings"), amount: v.number() },
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
    const amount = Math.max(Math.round(args.amount), 1);
    await ctx.db.patch(nomination._id, { currentBid: amount });
    return amount;
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

// Manually (re)assigns which roster slot a completed pick fills - e.g.
// bumping a flex-caliber RB down from RB2 to FLEX to free up RB2's budget
// for a different player. Works for any team's picks, not just self, since
// the League tab's per-team roster view (unlike DraftBoard's read-only TV
// board) lets the host correct/override any team's slotting. `slotKey: null`
// clears the assignment back to "unassigned", which falls back to
// assignSlotForPick's greedy auto-placement on the client.
export const setPickSlot = mutation({
  args: {
    pickId: v.id("draftPicks"),
    slotKey: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const pick = await ctx.db.get(args.pickId);
    if (!pick) {
      throw new Error("Pick not found.");
    }
    await requireDraftOwner(ctx, pick.draftSettingsId);

    if (args.slotKey === null) {
      await ctx.db.patch(args.pickId, { planSlotKey: undefined });
      return null;
    }

    const draftSettings = await ctx.db.get(pick.draftSettingsId);
    if (!draftSettings) {
      throw new Error("Draft not found.");
    }
    const slot = expandRosterSlots(draftSettings.rosterSlots).find(
      (s) => s.key === args.slotKey,
    );
    if (!slot) {
      throw new Error("Not a valid roster slot for this league.");
    }
    if (
      !isEligibleForSlot(
        pick.position,
        slot,
        draftSettings.flexPositions,
        draftSettings.superflexPositions,
      )
    ) {
      throw new Error(`${pick.position} isn't eligible for ${slot.label}.`);
    }

    // If another pick on the same team already sits in the target slot,
    // swap the two rather than rejecting - that's exactly the "make room"
    // move this mutation exists for (e.g. bumping the current FLEX starter
    // to bench to make room for the player being moved into FLEX).
    const teamPicks = await ctx.db
      .query("draftPicks")
      .withIndex("by_draft", (q) =>
        q.eq("draftSettingsId", pick.draftSettingsId),
      )
      .collect();
    const occupant = teamPicks.find(
      (p) =>
        p._id !== pick._id &&
        p.teamId === pick.teamId &&
        p.planSlotKey === args.slotKey,
    );
    if (occupant) {
      await ctx.db.patch(occupant._id, { planSlotKey: pick.planSlotKey });
    }
    await ctx.db.patch(args.pickId, { planSlotKey: args.slotKey });
    return null;
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
