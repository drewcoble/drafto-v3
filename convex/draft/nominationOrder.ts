import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireDraftOwner } from "./auth";

// Single, unchecked step - given the configured order/mode and who's
// currently up, computes who's up next with no regard for roster capacity.
// Kept separate from nextNominator so the capacity-skipping loop below can
// call it repeatedly without re-deriving the linear/snake math each time.
//
// Linear is a plain round-robin. Snake bounces at each end of the order
// instead of wrapping - when the next step would go out of range, the same
// team is returned again (unchanged) with direction flipped, so that team
// gets two consecutive turns before the order reverses. That's what makes a
// classic snake draft "snake"-shaped: e.g. with 4 teams the sequence is
// A,B,C,D,D,C,B,A,A,B,C,D,... - team D and team A each nominate twice in a
// row at the turns where the direction reverses.
function rawStep(
  order: readonly Id<"draftTeams">[],
  mode: "linear" | "snake",
  currentTeamId: Id<"draftTeams">,
  direction: 1 | -1,
): { teamId: Id<"draftTeams">; direction: 1 | -1 } {
  const index = order.indexOf(currentTeamId);
  if (index === -1) {
    // Current team fell out of the order (e.g. order was reconfigured) -
    // simplest safe recovery is to restart at the top.
    return { teamId: order[0]!, direction: 1 };
  }
  if (mode === "linear") {
    return { teamId: order[(index + 1) % order.length]!, direction: 1 };
  }
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= order.length) {
    return { teamId: order[index]!, direction: direction === 1 ? -1 : 1 };
  }
  return { teamId: order[nextIndex]!, direction };
}

// Given the configured order/mode and who's currently up, computes who's up
// next - skipping any team isTeamFull reports as having no open roster
// slots left, since a team with a full roster (bench included) has nothing
// left to nominate for. Exported (not just used internally by nominate())
// so it stays trivially testable/reasoned-about in isolation from the
// mutation's DB plumbing.
//
// Repeatedly applies rawStep rather than jumping straight to "the next
// non-full team in list order" so snake's bounce-at-the-boundary behavior
// (see rawStep) is preserved exactly - a full team sitting at the boundary
// just gets its would-be repeat turn skipped, without disturbing anyone
// else's place in the sequence.
export function nextNominator(
  order: readonly Id<"draftTeams">[],
  mode: "linear" | "snake",
  currentTeamId: Id<"draftTeams">,
  direction: 1 | -1,
  isTeamFull: (teamId: Id<"draftTeams">) => boolean,
): { teamId: Id<"draftTeams"> | null; direction: 1 | -1 } {
  if (order.length === 0) {
    throw new Error("Nomination order is empty.");
  }
  let candidate = rawStep(order, mode, currentTeamId, direction);
  // (teamId, direction) is a finite state space of order.length * 2 - if we
  // haven't found an open team within that many steps, every team is full
  // and we're just cycling, so stop and report "nobody left."
  const maxSteps = order.length * 2;
  for (let step = 0; step < maxSteps; step++) {
    if (!isTeamFull(candidate.teamId)) {
      return candidate;
    }
    candidate = rawStep(order, mode, candidate.teamId, candidate.direction);
  }
  return { teamId: null, direction: candidate.direction };
}

export const getCurrentNominator = query({
  args: { draftSettingsId: v.id("draftSettings") },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);
    return await ctx.db
      .query("draftNominationTurns")
      .withIndex("by_draft", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .first();
  },
});

// Configures (or reconfigures) the nomination order + mode. teamIds must be
// exactly the draft's current teams, each once - a partial or stale list
// would silently drop a team from the rotation, which is worse than just
// rejecting it. Starts the turn pointer at the order's first team only the
// very first time an order is set for this draft (a mid-draft edit to an
// already-running order shouldn't reset whose turn it is).
export const setNominationOrder = mutation({
  args: {
    draftSettingsId: v.id("draftSettings"),
    teamIds: v.array(v.id("draftTeams")),
    mode: v.union(v.literal("linear"), v.literal("snake")),
  },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);

    const teams = await ctx.db
      .query("draftTeams")
      .withIndex("by_draft", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .collect();
    const teamIdSet = new Set(teams.map((t) => t._id));
    const uniqueGiven = new Set(args.teamIds);
    if (
      teams.length === 0 ||
      args.teamIds.length !== teams.length ||
      uniqueGiven.size !== teams.length ||
      args.teamIds.some((id) => !teamIdSet.has(id))
    ) {
      throw new Error(
        "Nomination order must include every team in this draft exactly once.",
      );
    }

    await ctx.db.patch(args.draftSettingsId, {
      nominationOrder: args.teamIds,
      nominationOrderMode: args.mode,
    });

    const existingTurn = await ctx.db
      .query("draftNominationTurns")
      .withIndex("by_draft", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .first();
    if (!existingTurn) {
      await ctx.db.insert("draftNominationTurns", {
        draftSettingsId: args.draftSettingsId,
        currentTeamId: args.teamIds[0]!,
        direction: 1,
        updatedAt: Date.now(),
      });
    } else if (!uniqueGiven.has(existingTurn.currentTeamId as Id<"draftTeams">)) {
      // The team whose turn it was is no longer in the (re-saved) order -
      // clear to manual rather than silently pointing at a stale team.
      await ctx.db.patch(existingTurn._id, {
        currentTeamId: null,
        direction: 1,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

// Back to fully manual: no order, no suggested turn.
export const clearNominationOrder = mutation({
  args: { draftSettingsId: v.id("draftSettings") },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);
    await ctx.db.patch(args.draftSettingsId, {
      nominationOrder: undefined,
      nominationOrderMode: undefined,
    });
    const existingTurn = await ctx.db
      .query("draftNominationTurns")
      .withIndex("by_draft", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .first();
    if (existingTurn) {
      await ctx.db.delete(existingTurn._id);
    }
    return null;
  },
});

// Explicit host override - jump "whose turn" to any team, or to null (e.g.
// to run a pre-cycle top-X auction with no fixed nominator before the
// regular rotation starts/resumes). Always resets direction to 1: simplest
// predictable default for snake mode, and the host can nominate a couple
// times to nudge it back on track if that guess is wrong.
export const setCurrentNominator = mutation({
  args: {
    draftSettingsId: v.id("draftSettings"),
    teamId: v.union(v.id("draftTeams"), v.null()),
  },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);
    const existingTurn = await ctx.db
      .query("draftNominationTurns")
      .withIndex("by_draft", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .first();
    if (existingTurn) {
      await ctx.db.patch(existingTurn._id, {
        currentTeamId: args.teamId,
        direction: 1,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("draftNominationTurns", {
        draftSettingsId: args.draftSettingsId,
        currentTeamId: args.teamId,
        direction: 1,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});
