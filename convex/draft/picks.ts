import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  requireDraftOwner,
  requireDraftNotStarted,
  requireDraftStarted,
  requireSeasonOwner,
  requireRealDraft,
} from "./auth";
import { nextNominator } from "./nominationOrder";
import { stepPickOrder } from "./pickOrder";
import { expandRosterSlots } from "./slots";
import { getPreviousSeason } from "./history";
import { invalidateDraftValues } from "../draftValues";
import { syncDraftStatus } from "./status";
import { autoAdjustLiveBudgetForPick } from "./budgetAutoAdjust";
import { resolveDraftType } from "../draftType";

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

// Read-only, no-ownership-check counterparts to listDraftPicks and
// getActiveNomination for the TV board (src/pages/DraftBoard/DraftBoard.tsx)
// - meant to be viewable by anyone with the link, not just the league's
// owner (see convex/leagues.ts's getSeasonPublic for the same reasoning).
export const listDraftPicksPublic = query({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    const draft = await requireRealDraft(ctx, args.seasonId);
    return await ctx.db
      .query("draftPicks")
      .withIndex("by_draft_sequence", (q) => q.eq("draftId", draft._id))
      .collect();
  },
});

export const getActiveNominationPublic = query({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    const draft = await requireRealDraft(ctx, args.seasonId);
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

// Cancels a mistaken nomination with no pick recorded, and - unlike
// passNomination, which leaves "whose turn" wherever nominate() already
// advanced it to - restores the turn pointer back to whoever made this
// nomination, so they're up again instead of the rotation having moved on.
// Doesn't attempt to restore snake mode's exact pre-nomination direction
// (not derivable from what's stored); resets to 1, same tradeoff
// setCurrentNominator's manual override already makes.
export const undoNomination = mutation({
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

    if (nomination.nominatingTeamId) {
      const turn = await ctx.db
        .query("draftNominationTurns")
        .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
        .first();
      if (turn) {
        await ctx.db.patch(turn._id, {
          currentTeamId: nomination.nominatingTeamId,
          direction: 1,
          updatedAt: Date.now(),
        });
      }
    }
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

// Snake/linear counterpart to resolvePick - one direct action instead of
// nominate->bid->resolve, since there's no bidding to do (SNAKE_DRAFT.md
// §3.1/§5.2). Takes teamId directly rather than reading it off an active
// nomination (there isn't one) - trusts whatever team the host (the single
// signed-in operator entering results for every team, same model the
// auction flow already assumes) says is picking, same as resolvePick trusts
// args.teamId over independently re-deriving "whose turn" itself.
export const draftPick = mutation({
  args: {
    seasonId: v.id("seasons"),
    fpid: v.number(),
    teamId: v.id("seasonTeams"),
  },
  handler: async (ctx, args) => {
    const { season, draft } = await requireDraftStarted(ctx, args.seasonId);

    const draftType = resolveDraftType(season, draft);
    if (draftType === "auction") {
      throw new Error(
        "This is an auction draft - nominate a player and resolve the bid instead.",
      );
    }
    if (!draft.draftOrder || draft.draftOrder.length === 0) {
      throw new Error("Set the draft order before picking.");
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

    const team = await ctx.db.get(args.teamId);
    if (!team || team.seasonId !== args.seasonId) {
      throw new Error("Team not found in this draft.");
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

    // overallPick === sequence in phase 1 - picks always happen one at a
    // time, in order, with no trading/forfeiting a slot (SNAKE_DRAFT.md §9,
    // phase 2) to make the two diverge. round/pickInRound are purely
    // positional (which slot within the round) regardless of "snake" vs.
    // "linear" - only *which team* occupies that slot in an even round
    // differs between the two, and that's already decided by whatever
    // teamId the host passed in, not derived here.
    const teamCount = draft.draftOrder.length;
    const overallPick = sequence;
    const round = Math.ceil(overallPick / teamCount);
    const pickInRound = ((overallPick - 1) % teamCount) + 1;

    const pickId = await ctx.db.insert("draftPicks", {
      draftId: draft._id,
      sequence,
      fpid: args.fpid,
      position: player.position,
      teamId: args.teamId,
      round,
      pickInRound,
      overallPick,
      createdAt: Date.now(),
    });

    // Advance "whose turn" for next time - unlike nominate() (which always
    // steps from the existing suggestion, since that suggestion is barely
    // related to who actually won the bid), this steps from args.teamId
    // itself: in a snake/linear draft "on the clock" is meant to track who
    // actually just picked, so an out-of-order correction still leaves the
    // rotation pointed at the right next team instead of continuing from a
    // now-stale suggestion.
    const turn = await ctx.db
      .query("draftNominationTurns")
      .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
      .first();
    if (turn) {
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
      const next = stepPickOrder(
        draft.draftOrder,
        draftType,
        args.teamId,
        turn.direction,
        (teamId) => (picksCountByTeam.get(teamId) ?? 0) >= totalSlots,
      );
      await ctx.db.patch(turn._id, {
        currentTeamId: next.teamId,
        direction: next.direction,
        updatedAt: Date.now(),
      });
    }

    await syncDraftStatus(ctx, draft._id);
    return pickId;
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
        "This draft has already started - reopen pre-draft to change league settings.",
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
        "This draft has already started - reopen pre-draft to change league settings.",
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
        "This draft has already started - reopen pre-draft to change league settings.",
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
// against the destination team. Clears any budget-plan slot assignment
// rather than carrying it to the new team - planSlotKey occupancy is scoped
// per team's budget plan, so keeping it risks silently colliding with
// whatever the new team already has tagged for that slot.
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
        "This draft has already started - reopen pre-draft to change league settings.",
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
        "This draft has already started - reopen pre-draft to change league settings.",
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

// Sleeper-sync counterpart to resolvePick - batch-writes picks discovered by
// polling a linked live Sleeper draft (see convex/sleeper/draftSync.ts's
// applySleeperSyncTick, the only caller, which has already resolved each
// pick's fpid/teamId/price before calling here). No nomination to consume
// and no auto-adjust-budget hook (that's specific to the self team's live
// in-app bidding flow via resolvePick) - just the same draftPicks row shape
// resolvePick produces, applied in Sleeper's pick_no order so `sequence`
// matches real pick order even when one poll discovers several new picks at
// once. Silently no-ops (not a caller error) for an fpid already in
// draftPicks - a poll always returns the full pick list so far, and this is
// the same re-poll idempotency every hop of the sync loop depends on.
export const applySleeperSyncedPicks = internalMutation({
  args: {
    draftId: v.id("drafts"),
    picks: v.array(
      v.object({
        fpid: v.number(),
        teamId: v.id("seasonTeams"),
        price: v.number(),
        pickNo: v.number(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<{ applied: number; skipped: number }> => {
    const lastPick = await ctx.db
      .query("draftPicks")
      .withIndex("by_draft_sequence", (q) => q.eq("draftId", args.draftId))
      .order("desc")
      .first();
    let sequence = lastPick?.sequence ?? 0;
    let applied = 0;
    let skipped = 0;

    for (const pick of [...args.picks].sort((a, b) => a.pickNo - b.pickNo)) {
      const existing = await ctx.db
        .query("draftPicks")
        .withIndex("by_draft_fpid", (q) =>
          q.eq("draftId", args.draftId).eq("fpid", pick.fpid),
        )
        .first();
      if (existing) continue;

      const player = await ctx.db
        .query("players")
        .withIndex("by_fpid", (q) => q.eq("fpid", pick.fpid))
        .first();
      if (!player) {
        // Shouldn't normally happen (Sleeper's own player pool backs fpid
        // resolution), but a mid-season player-pool gap shouldn't crash the
        // whole batch - skip it and let the caller surface the count.
        skipped += 1;
        continue;
      }

      sequence += 1;
      await ctx.db.insert("draftPicks", {
        draftId: args.draftId,
        sequence,
        fpid: pick.fpid,
        position: player.position,
        teamId: pick.teamId,
        price: pick.price,
        createdAt: Date.now(),
      });
      applied += 1;
    }

    if (applied > 0) {
      await syncDraftStatus(ctx, args.draftId);
    }
    return { applied, skipped };
  },
});
