import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  requireDraftOwner,
  requireDraftNotStarted,
  requireDraftStarted,
  requireSeasonOwner,
} from "./auth";
import { nextNominator } from "./nominationOrder";
import { expandRosterSlots, isEligibleForSlot } from "./slots";
import { getPreviousSeason } from "./history";
import { invalidateDraftValues } from "../draftValues";
import { syncDraftStatus } from "./status";
import { autoAdjustLiveBudgetForPick } from "./budgetAutoAdjust";

export const listDraftPicks = query({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    const { draft } = await requireDraftOwner(ctx, args.seasonId);
    return await ctx.db
      .query("draftPicks")
      .withIndex("by_draft_sequence", (q) => q.eq("draftId", draft._id))
      .collect();
  },
});

export const getActiveNomination = query({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    const { draft } = await requireDraftOwner(ctx, args.seasonId);
    return await ctx.db
      .query("draftNominations")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
      .first();
  },
});

export const nominate = mutation({
  args: {
    seasonId: v.id("seasons"),
    fpid: v.number(),
    nominatingTeamId: v.optional(v.id("seasonTeams")),
    openingBid: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { season, draft } = await requireDraftStarted(ctx, args.seasonId);

    const alreadyPicked = await ctx.db
      .query("draftPicks")
      .withIndex("by_draft_fpid", (q) =>
        q.eq("draftId", draft._id).eq("fpid", args.fpid),
      )
      .first();
    if (alreadyPicked) {
      throw new Error("This player has already been drafted.");
    }

    const activeNomination = await ctx.db
      .query("draftNominations")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
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
      draftId: draft._id,
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
    if (draft.nominationOrder && draft.nominationOrderMode) {
      const turn = await ctx.db
        .query("draftNominationTurns")
        .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
        .first();
      if (turn && turn.currentTeamId !== null) {
        // A team with no open roster slots (bench included) has nothing
        // left to nominate for, so the rotation should skip straight past
        // it - see nextNominator's isTeamFull param.
        const allPicks = await ctx.db
          .query("draftPicks")
          .withIndex("by_draft_sequence", (q) => q.eq("draftId", draft._id))
          .collect();
        const picksCountByTeam = new Map<string, number>();
        for (const pick of allPicks) {
          picksCountByTeam.set(
            pick.teamId,
            (picksCountByTeam.get(pick.teamId) ?? 0) + 1,
          );
        }
        const totalSlots = expandRosterSlots(season.rosterSlots).length;
        const next = nextNominator(
          draft.nominationOrder,
          draft.nominationOrderMode,
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
  args: { seasonId: v.id("seasons"), delta: v.number() },
  handler: async (ctx, args) => {
    const { draft } = await requireDraftStarted(ctx, args.seasonId);
    const nomination = await ctx.db
      .query("draftNominations")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
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
  args: { seasonId: v.id("seasons"), amount: v.number() },
  handler: async (ctx, args) => {
    const { draft } = await requireDraftStarted(ctx, args.seasonId);
    const nomination = await ctx.db
      .query("draftNominations")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
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
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    const { draft } = await requireDraftStarted(ctx, args.seasonId);
    const nomination = await ctx.db
      .query("draftNominations")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
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
    seasonId: v.id("seasons"),
    fpid: v.number(),
    teamId: v.id("seasonTeams"),
    price: v.number(),
    planSlotKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { draft } = await requireDraftStarted(ctx, args.seasonId);

    const nomination = await ctx.db
      .query("draftNominations")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
      .first();
    if (!nomination || nomination.fpid !== args.fpid) {
      throw new Error("This player isn't currently on the block.");
    }

    const lastPick = await ctx.db
      .query("draftPicks")
      .withIndex("by_draft_sequence", (q) => q.eq("draftId", draft._id))
      .order("desc")
      .first();
    const sequence = (lastPick?.sequence ?? 0) + 1;

    const pickId = await ctx.db.insert("draftPicks", {
      draftId: draft._id,
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
    await syncDraftStatus(ctx, draft._id);

    // Auto-adjust the live budget for whatever this pick's actual price
    // did to its plan slot's budgeted amount - see budgetAutoAdjust.ts.
    // No-ops entirely for a manual/no-slot pick, or for anyone but the
    // self team.
    if (args.planSlotKey !== undefined) {
      await autoAdjustLiveBudgetForPick(
        ctx,
        draft._id,
        args.seasonId,
        args.teamId,
        args.planSlotKey,
        args.price,
      );
    }

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
    const draft = await ctx.db.get(pick.draftId);
    if (!draft) {
      throw new Error("Draft not found.");
    }
    await requireSeasonOwner(ctx, draft.seasonId);

    if (args.slotKey === null) {
      await ctx.db.patch(args.pickId, { planSlotKey: undefined });
      return null;
    }

    const season = await ctx.db.get(draft.seasonId);
    if (!season) {
      throw new Error("Season not found.");
    }
    const slot = expandRosterSlots(season.rosterSlots).find(
      (s) => s.key === args.slotKey,
    );
    if (!slot) {
      throw new Error("Not a valid roster slot for this league.");
    }
    if (
      !isEligibleForSlot(
        pick.position,
        slot,
        season.flexPositions,
        season.superflexPositions,
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
      .withIndex("by_draft", (q) => q.eq("draftId", pick.draftId))
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

// Consecutive-seasons-kept count for a keeper about to be added: 1 for a
// first-time keeper (or when this league has no prior season yet), or
// (prior season's value + 1) when the immediately-prior season already had
// this same fpid tagged as a keeper, regardless of which team held it either
// season (a trade doesn't break the streak). Only checks one season back,
// since a gap season (not kept at all) breaks the streak rather than
// pausing it. Just the starting suggestion - always user-editable afterward
// via setKeeperStreak below.
async function computeKeeperStreak(
  ctx: MutationCtx,
  season: Doc<"seasons">,
  fpid: number,
): Promise<number> {
  const previousSeason = await getPreviousSeason(ctx, season);
  if (!previousSeason) return 1;
  const previousDraft = await ctx.db
    .query("drafts")
    .withIndex("by_season_kind", (q) =>
      q.eq("seasonId", previousSeason._id).eq("kind", "real"),
    )
    .first();
  if (!previousDraft) return 1;
  const parentPick = await ctx.db
    .query("draftPicks")
    .withIndex("by_draft_fpid", (q) =>
      q.eq("draftId", previousDraft._id).eq("fpid", fpid),
    )
    .first();
  if (!parentPick?.isKeeper) return 1;
  return (parentPick.keeperStreak ?? 1) + 1;
}

// Pre-draft equivalent of resolvePick - assigns a player straight to a team
// for a fixed price with no nomination to consume, so this can run any time
// before (or independent of) the live auction. Tagged isKeeper: true so the
// value engine (convex/draftValues.ts) and UI can tell it apart from a real
// auction result.
export const addKeeper = mutation({
  args: {
    seasonId: v.id("seasons"),
    teamId: v.id("seasonTeams"),
    fpid: v.number(),
    price: v.number(),
    planSlotKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { season, draft } = await requireDraftNotStarted(ctx, args.seasonId);

    const team = await ctx.db.get(args.teamId);
    if (!team || team.seasonId !== args.seasonId) {
      throw new Error("Team not found in this draft.");
    }

    const alreadyPicked = await ctx.db
      .query("draftPicks")
      .withIndex("by_draft_fpid", (q) =>
        q.eq("draftId", draft._id).eq("fpid", args.fpid),
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
      .withIndex("by_draft_sequence", (q) => q.eq("draftId", draft._id))
      .order("desc")
      .first();
    const sequence = (lastPick?.sequence ?? 0) + 1;
    const keeperStreak = await computeKeeperStreak(ctx, season, args.fpid);

    const keeperRules = season.keeperRules;
    if (keeperRules?.maxConsecutiveYears !== undefined) {
      if (keeperStreak > keeperRules.maxConsecutiveYears) {
        throw new Error(
          `This player has already been kept ${keeperRules.maxConsecutiveYears} consecutive season(s) - the league max.`,
        );
      }
    }
    if (keeperRules?.maxKeepersPerTeam !== undefined) {
      const teamPicks = await ctx.db
        .query("draftPicks")
        .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
        .collect();
      const teamKeeperCount = teamPicks.filter(
        (p) => p.isKeeper && p.teamId === args.teamId,
      ).length;
      if (teamKeeperCount >= keeperRules.maxKeepersPerTeam) {
        throw new Error(
          `This team already has the maximum of ${keeperRules.maxKeepersPerTeam} keeper(s).`,
        );
      }
    }

    const pickId = await ctx.db.insert("draftPicks", {
      draftId: draft._id,
      sequence,
      fpid: args.fpid,
      position: player.position,
      teamId: args.teamId,
      price: args.price,
      isKeeper: true,
      keeperStreak,
      createdAt: Date.now(),
      ...(args.planSlotKey !== undefined
        ? { planSlotKey: args.planSlotKey }
        : {}),
    });
    // Keepers shift getDraftValues' $ engine (excluded from the pool,
    // replacement demand reduced) - see convex/draftValues.ts.
    await invalidateDraftValues(ctx, draft._id);
    await syncDraftStatus(ctx, draft._id);
    return pickId;
  },
});

async function requireSeasonForPick(ctx: MutationCtx, pick: Doc<"draftPicks">) {
  const draft = await ctx.db.get(pick.draftId);
  if (!draft) {
    throw new Error("Draft not found.");
  }
  await requireSeasonOwner(ctx, draft.seasonId);
  return draft;
}

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
    const draft = await requireSeasonForPick(ctx, pick);
    if (!pick.isKeeper) {
      throw new Error("This pick isn't a keeper.");
    }
    if (draft.startedAt !== undefined) {
      throw new Error(
        "This draft has already started - reopen setup to change league settings.",
      );
    }
    await ctx.db.delete(args.pickId);
    await invalidateDraftValues(ctx, pick.draftId);
    await syncDraftStatus(ctx, pick.draftId);
    return null;
  },
});

// Manual override for computeKeeperStreak's suggestion above - e.g.
// correcting the very first season's default of 1 to reflect real-world
// keeper history that predates this app. Whatever value is set here is
// exactly what next season's computeKeeperStreak chains off of (+1), so
// this is the single point of truth going forward. Doesn't touch
// draftValues - streak doesn't feed the $ value engine.
export const setKeeperStreak = mutation({
  args: { pickId: v.id("draftPicks"), streak: v.number() },
  handler: async (ctx, args) => {
    const pick = await ctx.db.get(args.pickId);
    if (!pick) {
      throw new Error("Pick not found.");
    }
    const draft = await requireSeasonForPick(ctx, pick);
    if (!pick.isKeeper) {
      throw new Error("This pick isn't a keeper.");
    }
    if (draft.startedAt !== undefined) {
      throw new Error(
        "This draft has already started - reopen setup to change league settings.",
      );
    }
    await ctx.db.patch(args.pickId, {
      keeperStreak: Math.max(Math.round(args.streak), 1),
    });
    return null;
  },
});

// Manual correction for a keeper's price after the fact - e.g. a typo while
// adding it, or a Recommended Keepers quick-add (KeepersTab.tsx) whose
// suggested cost needs adjusting. Feeds the same $ value engine addKeeper's
// price does (see convex/draftValues.ts's keptDollars), so this invalidates
// that cache the same way adding/removing a keeper does.
export const setKeeperPrice = mutation({
  args: { pickId: v.id("draftPicks"), price: v.number() },
  handler: async (ctx, args) => {
    const pick = await ctx.db.get(args.pickId);
    if (!pick) {
      throw new Error("Pick not found.");
    }
    const draft = await requireSeasonForPick(ctx, pick);
    if (!pick.isKeeper) {
      throw new Error("This pick isn't a keeper.");
    }
    if (draft.startedAt !== undefined) {
      throw new Error(
        "This draft has already started - reopen setup to change league settings.",
      );
    }
    await ctx.db.patch(args.pickId, { price: args.price });
    await invalidateDraftValues(ctx, pick.draftId);
    return null;
  },
});

// Manual correction for which team holds a keeper - e.g. Recommended
// Keepers' team-name guess (see convex/draft/history.ts's
// getPlayerPriceHistory) was wrong, or the host just fat-fingered the
// picker while adding it. Same maxKeepersPerTeam check addKeeper runs,
// against the destination team. Clears any roster-slot assignment rather
// than carrying it to the new team - planSlotKey occupancy (setPickSlot) is
// scoped per team, so keeping it risks silently colliding with whatever the
// new team already has in that slot.
export const setKeeperTeam = mutation({
  args: { pickId: v.id("draftPicks"), teamId: v.id("seasonTeams") },
  handler: async (ctx, args) => {
    const pick = await ctx.db.get(args.pickId);
    if (!pick) {
      throw new Error("Pick not found.");
    }
    const draft = await requireSeasonForPick(ctx, pick);
    if (!pick.isKeeper) {
      throw new Error("This pick isn't a keeper.");
    }
    if (draft.startedAt !== undefined) {
      throw new Error(
        "This draft has already started - reopen setup to change league settings.",
      );
    }
    if (args.teamId === pick.teamId) return null;

    const team = await ctx.db.get(args.teamId);
    if (!team || team.seasonId !== draft.seasonId) {
      throw new Error("Team not found in this draft.");
    }

    const season = await ctx.db.get(draft.seasonId);
    if (!season) {
      throw new Error("Season not found.");
    }
    if (season.keeperRules?.maxKeepersPerTeam !== undefined) {
      const teamPicks = await ctx.db
        .query("draftPicks")
        .withIndex("by_draft", (q) => q.eq("draftId", pick.draftId))
        .collect();
      const teamKeeperCount = teamPicks.filter(
        (p) => p.isKeeper && p.teamId === args.teamId,
      ).length;
      if (teamKeeperCount >= season.keeperRules.maxKeepersPerTeam) {
        throw new Error(
          `This team already has the maximum of ${season.keeperRules.maxKeepersPerTeam} keeper(s).`,
        );
      }
    }

    await ctx.db.patch(args.pickId, {
      teamId: args.teamId,
      planSlotKey: undefined,
    });
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
    const draft = await requireSeasonForPick(ctx, pick);
    // Only keepers are locked once the draft starts - this is the one path
    // (besides removeKeeper) that can delete a keeper row, and without this
    // check it would silently bypass that lock. A real auction pick can
    // still be removed any time (that's this mutation's whole purpose for
    // the Draft Room's roster-correction views).
    if (pick.isKeeper && draft.startedAt !== undefined) {
      throw new Error(
        "This draft has already started - reopen setup to change league settings.",
      );
    }
    await ctx.db.delete(args.pickId);
    // Dropping a keeper (this can remove any pick, keeper or not - see
    // comment above) shifts getDraftValues' $ engine the same way
    // removeKeeper's dedicated path does.
    if (pick.isKeeper) {
      await invalidateDraftValues(ctx, pick.draftId);
    }
    await syncDraftStatus(ctx, pick.draftId);
    return pick;
  },
});

// Undo is a plain delete of the highest-sequence pick - nothing stores a
// running budget balance anywhere, so deleting the row is the entire refund.
export const undoLastPick = mutation({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    const { draft } = await requireDraftOwner(ctx, args.seasonId);
    const lastPick = await ctx.db
      .query("draftPicks")
      .withIndex("by_draft_sequence", (q) => q.eq("draftId", draft._id))
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
      await invalidateDraftValues(ctx, draft._id);
    }
    await syncDraftStatus(ctx, draft._id);
    return lastPick;
  },
});
