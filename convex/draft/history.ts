import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { requireDraftOwner } from "./auth";

const MAX_LINEAGE_WALK = 25;

// Every linked season for this draft's league, oldest first, including the
// argument's own row. clonedFromId is write-once at insert time (see
// schema.ts) and cloneDraftSettings enforces at most one forward clone per
// row, so this walk can never cycle or branch - the iteration bound is
// belt-and-suspenders, not load-bearing.
export const listSeasonLineage = query({
  args: { draftSettingsId: v.id("draftSettings") },
  handler: async (ctx, args) => {
    const current = await requireDraftOwner(ctx, args.draftSettingsId);
    const seasons: Doc<"draftSettings">[] = [current];

    let cursor = current;
    for (let i = 0; i < MAX_LINEAGE_WALK && cursor.clonedFromId; i++) {
      const parent = await ctx.db.get(cursor.clonedFromId);
      if (!parent) break;
      seasons.push(parent);
      cursor = parent;
    }

    cursor = current;
    for (let i = 0; i < MAX_LINEAGE_WALK; i++) {
      const child = await ctx.db
        .query("draftSettings")
        .withIndex("by_cloned_from", (q) => q.eq("clonedFromId", cursor._id))
        .first();
      if (!child) break;
      seasons.push(child);
      cursor = child;
    }

    seasons.sort((a, b) => a.createdAt - b.createdAt);
    return seasons;
  },
});

// For every player, their price from the most recent PRIOR season in this
// lineage (excluding the current row) - a keeper cost reference. Walks
// ancestors most-recent-first and never overwrites an fpid a more-recent
// season already set. draftPicks.by_draft_fpid already guarantees at most
// one pick per fpid within a single season (nominate/resolvePick/addKeeper
// all check it), so there's never ambiguity about which pick to use for any
// one season - only across seasons, which the walk order handles.
export const getPlayerPriceHistory = query({
  args: { draftSettingsId: v.id("draftSettings") },
  handler: async (ctx, args) => {
    const current = await requireDraftOwner(ctx, args.draftSettingsId);

    const ancestors: Doc<"draftSettings">[] = [];
    let cursor = current;
    for (let i = 0; i < MAX_LINEAGE_WALK && cursor.clonedFromId; i++) {
      const parent = await ctx.db.get(cursor.clonedFromId);
      if (!parent) break;
      ancestors.push(parent);
      cursor = parent;
    }

    const priceByFpid: Record<
      number,
      { price: number; season: string | undefined }
    > = {};
    for (const season of ancestors) {
      const picks = await ctx.db
        .query("draftPicks")
        .withIndex("by_draft", (q) => q.eq("draftSettingsId", season._id))
        .collect();
      for (const pick of picks) {
        if (priceByFpid[pick.fpid] !== undefined) continue;
        priceByFpid[pick.fpid] = { price: pick.price, season: season.season };
      }
    }
    return priceByFpid;
  },
});

// Starts a new season for this league: copies durable config (roster
// shape, scoring, cap), teams, and the budget plan forward, but not
// draftPicks/draftNominations/draftPlayerTags - those are season-specific
// live-draft state. Throws if this season has already been advanced, so a
// double-click/retry can't silently create two sibling seasons (one of
// which would become permanently invisible to the lineage walk above).
export const cloneDraftSettings = mutation({
  args: {
    id: v.id("draftSettings"),
    season: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const source = await requireDraftOwner(ctx, args.id);

    const existingChild = await ctx.db
      .query("draftSettings")
      .withIndex("by_cloned_from", (q) => q.eq("clonedFromId", args.id))
      .first();
    if (existingChild) {
      throw new Error(
        `This season has already been advanced to "${existingChild.name}".`,
      );
    }

    const now = Date.now();
    const newId = await ctx.db.insert("draftSettings", {
      ownerId: source.ownerId,
      name: args.name,
      teamCount: source.teamCount,
      salaryCap: source.salaryCap,
      scoring: source.scoring,
      rosterSlots: source.rosterSlots,
      flexPositions: source.flexPositions,
      superflexPositions: source.superflexPositions,
      createdAt: now,
      season: args.season,
      clonedFromId: args.id,
    });

    const sourceTeams = await ctx.db
      .query("draftTeams")
      .withIndex("by_draft", (q) => q.eq("draftSettingsId", args.id))
      .collect();
    for (const team of sourceTeams) {
      await ctx.db.insert("draftTeams", {
        draftSettingsId: newId,
        name: team.name,
        isSelf: team.isSelf,
        order: team.order,
        createdAt: now,
      });
    }

    const sourcePlan = await ctx.db
      .query("draftBudgetPlans")
      .withIndex("by_draft", (q) => q.eq("draftSettingsId", args.id))
      .first();
    if (sourcePlan) {
      await ctx.db.insert("draftBudgetPlans", {
        draftSettingsId: newId,
        amounts: sourcePlan.amounts,
        overspendBehavior: sourcePlan.overspendBehavior,
        updatedAt: now,
      });
    }

    return newId;
  },
});
