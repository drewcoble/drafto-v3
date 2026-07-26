import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { requireDraftOwner } from "./auth";

export const listDraftTeams = query({
  args: { draftSettingsId: v.id("draftSettings") },
  handler: async (ctx, args) => {
    await requireDraftOwner(ctx, args.draftSettingsId);
    const teams = await ctx.db
      .query("draftTeams")
      .withIndex("by_draft", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .collect();
    return teams.sort((a, b) => a.order - b.order);
  },
});

// Called once, from "Enter Draft Room" - creates the owner's own team
// (isSelf: true, order 0) plus one row per opponent name. Throws if this
// draft's teams have already been set up, since re-running would duplicate
// them.
export const initializeDraftTeams = mutation({
  args: {
    draftSettingsId: v.id("draftSettings"),
    opponentNames: v.array(v.string()),
    selfName: v.string(),
  },
  handler: async (ctx, args) => {
    const draftSettings = await requireDraftOwner(ctx, args.draftSettingsId);

    const existing = await ctx.db
      .query("draftTeams")
      .withIndex("by_draft", (q) =>
        q.eq("draftSettingsId", args.draftSettingsId),
      )
      .first();
    if (existing) {
      throw new Error("Teams have already been set up for this draft.");
    }

    if (args.opponentNames.length !== draftSettings.teamCount - 1) {
      throw new Error(
        `This league has ${draftSettings.teamCount} teams, so ${
          draftSettings.teamCount - 1
        } opponent names are required (got ${args.opponentNames.length}).`,
      );
    }

    const now = Date.now();
    const selfId = await ctx.db.insert("draftTeams", {
      draftSettingsId: args.draftSettingsId,
      name: args.selfName,
      isSelf: true,
      order: 0,
      createdAt: now,
    });
    for (const [index, name] of args.opponentNames.entries()) {
      await ctx.db.insert("draftTeams", {
        draftSettingsId: args.draftSettingsId,
        name,
        isSelf: false,
        order: index + 1,
        createdAt: now,
      });
    }
    return selfId;
  },
});

export const renameDraftTeam = mutation({
  args: { teamId: v.id("draftTeams"), name: v.string() },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Team not found.");
    }
    await requireDraftOwner(ctx, team.draftSettingsId);
    await ctx.db.patch(args.teamId, { name: args.name });
    return await ctx.db.get(args.teamId);
  },
});
