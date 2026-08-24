import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireDraftNotStarted, requireDraftOwner } from "./auth";
import { resolveTeamPositionInRound } from "./pickOrder";

// Traded/forfeited draft-slot ownership (SNAKE_DRAFT.md §9) - see
// schema.ts's draftPickSlots comment for the full data-model reasoning.
// Deliberately does NOT try to make turn-advancement (stepPickOrder)
// auto-skip a forfeited slot mid-rotation - that would require the
// stepping algorithm to track which round it's in through an arbitrary
// chain of skips, which is a lot of machinery for something expected to be
// rare. Instead, forfeits/trades are used for (a) correct round/pickInRound
// numbering (findNextOpenSlot below) and (b) isDraftComplete's completion
// accounting - the host just picks with the correct next team when they
// hit a forfeited slot, same trust model draftPick already uses for
// everything else.
//
// A real wrinkle round-based keepers (SNAKE_DRAFT.md §8) introduced: a
// keeper claims a specific round *out of natural draft order* (a team's
// round-7 keeper exists before any round-1 live pick happens), so
// round/pickInRound for a *new* live pick can no longer be derived from a
// running pick count alone (that assumes rounds fill in strict sequence).
// findNextOpenSlot below instead scans round-by-round, position-by-
// position, for the first slot that's neither already filled (by a keeper
// or an earlier live pick) nor forfeited - correct regardless of what
// order rounds actually get filled in.

// Every touched slot for a draft, keyed by round - a league with zero
// trades/forfeits/round-keepers never has rows here at all.
async function listTouchedSlots(ctx: QueryCtx, draftId: Id<"drafts">) {
  return await ctx.db
    .query("draftPickSlots")
    .withIndex("by_draft", (q) => q.eq("draftId", draftId))
    .collect();
}

// How many of this round's teamCount slots are forfeited - the only thing
// round/pickInRound numbering needs to know about slot ownership (a trade
// changes *who* picks a slot, not whether it exists, so trades don't
// affect this count).
export async function countForfeitedByRound(
  ctx: QueryCtx,
  draftId: Id<"drafts">,
): Promise<Map<number, number>> {
  const rows = await listTouchedSlots(ctx, draftId);
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (row.currentTeamId === null) {
      counts.set(row.round, (counts.get(row.round) ?? 0) + 1);
    }
  }
  return counts;
}

// "round:pickInRound" key shared by the filled/forfeited sets below - a
// plain string key is simplest for a Set given both fields are just
// numbers, no risk of collision.
function slotKey(round: number, pickInRound: number): string {
  return `${round}:${pickInRound}`;
}

// Position-keyed (not team-keyed) forfeited slots for this draft - the
// position a forfeited row's originalTeamId occupies in its round, per
// resolveTeamPositionInRound, since findNextOpenSlot below scans by
// position, not by team.
export async function forfeitedPositions(
  ctx: QueryCtx,
  draftId: Id<"drafts">,
  draftOrder: readonly Id<"seasonTeams">[],
  mode: "linear" | "snake",
  reversalRounds: readonly number[],
): Promise<Set<string>> {
  const rows = await listTouchedSlots(ctx, draftId);
  const positions = new Set<string>();
  for (const row of rows) {
    if (row.currentTeamId !== null) continue;
    const position = resolveTeamPositionInRound(
      draftOrder,
      mode,
      reversalRounds,
      row.round,
      row.originalTeamId,
    );
    if (position !== null) positions.add(slotKey(row.round, position));
  }
  return positions;
}

// Position-keyed slots already filled by an existing draftPicks row
// (keeper or live pick) - both count identically here, since either way
// the slot is spoken for and a new live pick shouldn't land on it.
export function filledPositions(
  picks: readonly Pick<Doc<"draftPicks">, "round" | "pickInRound">[],
): Set<string> {
  const positions = new Set<string>();
  for (const pick of picks) {
    if (pick.round !== undefined && pick.pickInRound !== undefined) {
      positions.add(slotKey(pick.round, pick.pickInRound));
    }
  }
  return positions;
}

// The first (round, pickInRound) that's neither already filled nor
// forfeited, scanning round-by-round then position-by-position within
// each round. This is what a *new* live pick claims - correct regardless
// of what order rounds happen to fill in (a round-7 keeper doesn't
// prevent round 1-6 live picks from resolving correctly, since each round
// is checked independently).
export function findNextOpenSlot(
  teamCount: number,
  filled: ReadonlySet<string>,
  forfeited: ReadonlySet<string>,
): { round: number; pickInRound: number } {
  let round = 1;
  // Safety bound - a real draft never has anywhere close to this many
  // rounds; guards against a runaway loop if teamCount is somehow 0.
  while (round < 100_000) {
    for (let position = 1; position <= teamCount; position++) {
      const key = slotKey(round, position);
      if (!filled.has(key) && !forfeited.has(key)) {
        return { round, pickInRound: position };
      }
    }
    round += 1;
  }
  throw new Error("Could not find an open draft slot.");
}

// Total real (non-forfeited) slots across every round up to and including
// `throughRound` - used by isDraftComplete to know how many picks a
// forfeit-affected draft actually needs.
export function countRealSlotsThroughRound(
  throughRound: number,
  teamCount: number,
  forfeitedByRound: ReadonlyMap<number, number>,
): number {
  let total = 0;
  for (let round = 1; round <= throughRound; round++) {
    total += Math.max(teamCount - (forfeitedByRound.get(round) ?? 0), 0);
  }
  return total;
}

async function upsertSlot(
  ctx: MutationCtx,
  draftId: Id<"drafts">,
  round: number,
  originalTeamId: Id<"seasonTeams">,
  patch: { currentTeamId: Id<"seasonTeams"> | null; note?: string },
) {
  const existing = await ctx.db
    .query("draftPickSlots")
    .withIndex("by_draft_round", (q) =>
      q.eq("draftId", draftId).eq("round", round),
    )
    .filter((q) => q.eq(q.field("originalTeamId"), originalTeamId))
    .first();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { ...patch, updatedAt: now });
  } else {
    await ctx.db.insert("draftPickSlots", {
      draftId,
      round,
      originalTeamId,
      ...patch,
      updatedAt: now,
    });
  }
}

// Every explicitly-touched slot for a season's real draft - the untouched
// majority (still owned by whichever team drafts.draftOrder says) simply
// has no row and isn't returned here; a caller building a full round x
// team grid should treat any (round, team) combination absent from this
// list as "owned by originalTeamId, open."
export const listPickSlots = query({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    const { draft } = await requireDraftOwner(ctx, args.seasonId);
    return await listTouchedSlots(ctx, draft._id);
  },
});

// Reassigns one team's slot in `round` to a different team (a trade).
// Locked to pre-draft, same as setDraftOrder - reassigning a slot after
// picks have started would retroactively change who "should" have picked
// already-recorded rounds.
export const tradePickSlot = mutation({
  args: {
    seasonId: v.id("seasons"),
    round: v.number(),
    originalTeamId: v.id("seasonTeams"),
    newTeamId: v.id("seasonTeams"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { draft } = await requireDraftNotStarted(ctx, args.seasonId);
    if (!draft.draftOrder?.includes(args.originalTeamId)) {
      throw new Error("That team isn't part of this draft's order.");
    }
    if (!draft.draftOrder.includes(args.newTeamId)) {
      throw new Error("The receiving team isn't part of this draft's order.");
    }
    await upsertSlot(ctx, draft._id, args.round, args.originalTeamId, {
      currentTeamId: args.newTeamId,
      ...(args.note !== undefined ? { note: args.note } : {}),
    });
    return null;
  },
});

// Marks one team's slot in `round` as forfeited - no one picks there.
export const forfeitPickSlot = mutation({
  args: {
    seasonId: v.id("seasons"),
    round: v.number(),
    originalTeamId: v.id("seasonTeams"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { draft } = await requireDraftNotStarted(ctx, args.seasonId);
    if (!draft.draftOrder?.includes(args.originalTeamId)) {
      throw new Error("That team isn't part of this draft's order.");
    }
    await upsertSlot(ctx, draft._id, args.round, args.originalTeamId, {
      currentTeamId: null,
      ...(args.note !== undefined ? { note: args.note } : {}),
    });
    return null;
  },
});

// Reverts a slot back to "untouched" (owned by originalTeamId, open) -
// deletes the override row rather than resetting its fields, so it goes
// back to costing nothing to read (same convention as clearDraftOrder).
export const restorePickSlot = mutation({
  args: {
    seasonId: v.id("seasons"),
    round: v.number(),
    originalTeamId: v.id("seasonTeams"),
  },
  handler: async (ctx, args) => {
    const { draft } = await requireDraftNotStarted(ctx, args.seasonId);
    const existing = await ctx.db
      .query("draftPickSlots")
      .withIndex("by_draft_round", (q) =>
        q.eq("draftId", draft._id).eq("round", args.round),
      )
      .filter((q) => q.eq(q.field("originalTeamId"), args.originalTeamId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});
