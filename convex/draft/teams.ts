import { v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import { requireSeasonOwner, requireRealDraft } from "./auth";
import { invalidateDraftValues } from "../draftValues";

export const listSeasonTeams = query({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    await requireSeasonOwner(ctx, args.seasonId);
    const teams = await ctx.db
      .query("seasonTeams")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();
    return teams.sort((a, b) => a.order - b.order);
  },
});

// No-auth counterpart to listSeasonTeams, for server-side callers that have
// already checked ownership themselves - specifically convex/sleeper/
// league.ts's syncLeagueRoster action, which can't call the QueryCtx-typed
// requireSeasonOwner directly (actions only get ActionCtx) and already
// verified the caller owns this season via requireOwnedSeasonForSync before
// reaching this query.
export const listSeasonTeamsInternal = internalQuery({
  args: { seasonId: v.id("seasons") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("seasonTeams")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .collect();
  },
});

// Called once, from "Enter Draft Room" - creates the owner's own team
// (isSelf: true, order 0) plus one row per opponent name. Throws if this
// season's teams have already been set up, since re-running would duplicate
// them. Also seeds the nomination order to this same entry order (linear
// mode) so a league always has an *active* suggested order from the
// moment teams exist, rather than sitting "manual" until someone visits
// TeamsPanel and clicks Save - "manual" now only happens if a host
// intentionally clears it (see clearNominationOrder).
const sleeperLinkValidator = v.object({
  sleeperRosterId: v.string(),
  sleeperOwnerId: v.string(),
});

export const initializeSeasonTeams = mutation({
  args: {
    seasonId: v.id("seasons"),
    opponentNames: v.array(v.string()),
    selfName: v.string(),
    // Set by the "Import from Sleeper" creation wizard so an imported
    // league's teams already carry their sync links from creation - no
    // separate team-mapping pass needed later in Season Settings (convex/
    // sleeper/league.ts's syncLeagueRoster). Absent for the normal
    // manual-setup flow. opponentSleeperLinks, when given, is parallel to
    // opponentNames (null entries for any unmatched team).
    selfSleeperLink: v.optional(sleeperLinkValidator),
    opponentSleeperLinks: v.optional(
      v.array(v.union(sleeperLinkValidator, v.null())),
    ),
    // Yahoo equivalent, set by the "Import from Yahoo" creation wizard (see
    // convex/yahoo/league.ts's previewYahooImport) - just the team_key
    // string, since Yahoo has no separate roster/owner id split the way
    // Sleeper's link does (see seasonTeams.yahooTeamKey's schema comment).
    selfYahooTeamKey: v.optional(v.string()),
    opponentYahooTeamKeys: v.optional(
      v.array(v.union(v.string(), v.null())),
    ),
  },
  handler: async (ctx, args) => {
    const { season } = await requireSeasonOwner(ctx, args.seasonId);

    const existing = await ctx.db
      .query("seasonTeams")
      .withIndex("by_season", (q) => q.eq("seasonId", args.seasonId))
      .first();
    if (existing) {
      throw new Error("Teams have already been set up for this draft.");
    }

    if (args.opponentNames.length !== season.teamCount - 1) {
      throw new Error(
        `This league has ${season.teamCount} teams, so ${
          season.teamCount - 1
        } opponent names are required (got ${args.opponentNames.length}).`,
      );
    }

    const now = Date.now();
    const selfId = await ctx.db.insert("seasonTeams", {
      seasonId: args.seasonId,
      name: args.selfName,
      isSelf: true,
      order: 0,
      createdAt: now,
      ...(args.selfSleeperLink ?? {}),
      ...(args.selfYahooTeamKey ? { yahooTeamKey: args.selfYahooTeamKey } : {}),
    });
    const teamIds = [selfId];
    for (const [index, name] of args.opponentNames.entries()) {
      const link = args.opponentSleeperLinks?.[index];
      const yahooTeamKey = args.opponentYahooTeamKeys?.[index];
      teamIds.push(
        await ctx.db.insert("seasonTeams", {
          seasonId: args.seasonId,
          name,
          isSelf: false,
          order: index + 1,
          createdAt: now,
          ...(link ?? {}),
          ...(yahooTeamKey ? { yahooTeamKey } : {}),
        }),
      );
    }

    const draft = await requireRealDraft(ctx, args.seasonId);
    await ctx.db.patch(draft._id, {
      nominationOrder: teamIds,
      nominationOrderMode: "linear",
    });
    await ctx.db.insert("draftNominationTurns", {
      draftId: draft._id,
      currentTeamId: selfId,
      direction: 1,
      updatedAt: now,
    });

    return selfId;
  },
});

export const renameSeasonTeam = mutation({
  args: { teamId: v.id("seasonTeams"), name: v.string() },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Team not found.");
    }
    await requireSeasonOwner(ctx, team.seasonId);
    await ctx.db.patch(args.teamId, { name: args.name });
    return await ctx.db.get(args.teamId);
  },
});

// null clears the override back to the league default (seasons.salaryCap).
export const setTeamSalaryCap = mutation({
  args: { teamId: v.id("seasonTeams"), salaryCap: v.union(v.number(), v.null()) },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Team not found.");
    }
    await requireSeasonOwner(ctx, team.seasonId);
    if (args.salaryCap !== null && args.salaryCap <= 0) {
      throw new Error("Salary cap must be a positive number.");
    }
    await ctx.db.patch(args.teamId, {
      salaryCapOverride: args.salaryCap ?? undefined,
    });
    // This team's override feeds the $ value engine's total auction pool
    // size (see convex/draftValues.ts), so the cache needs the same
    // invalidation a league-settings edit already triggers.
    const draft = await requireRealDraft(ctx, team.seasonId);
    await invalidateDraftValues(ctx, draft._id);
    return await ctx.db.get(args.teamId);
  },
});

// Links (or unlinks, passing null for both) this team to a real Sleeper
// roster/owner - the one-time mapping step in Settings that syncLeagueRoster
// (convex/sleeper/league.ts) depends on to know which synced roster belongs
// to which app team.
export const setTeamSleeperLink = mutation({
  args: {
    teamId: v.id("seasonTeams"),
    sleeperRosterId: v.union(v.string(), v.null()),
    sleeperOwnerId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Team not found.");
    }
    await requireSeasonOwner(ctx, team.seasonId);
    await ctx.db.patch(args.teamId, {
      sleeperRosterId: args.sleeperRosterId ?? undefined,
      sleeperOwnerId: args.sleeperOwnerId ?? undefined,
    });
    return await ctx.db.get(args.teamId);
  },
});

// Yahoo equivalent of setTeamSleeperLink above.
export const setTeamYahooLink = mutation({
  args: {
    teamId: v.id("seasonTeams"),
    yahooTeamKey: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Team not found.");
    }
    await requireSeasonOwner(ctx, team.seasonId);
    await ctx.db.patch(args.teamId, {
      yahooTeamKey: args.yahooTeamKey ?? undefined,
    });
    return await ctx.db.get(args.teamId);
  },
});

// null clears the override back to the league default (seasons.faabBudget).
export const setTeamFaabBudget = mutation({
  args: { teamId: v.id("seasonTeams"), faabBudget: v.union(v.number(), v.null()) },
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team) {
      throw new Error("Team not found.");
    }
    await requireSeasonOwner(ctx, team.seasonId);
    if (args.faabBudget !== null && args.faabBudget < 0) {
      throw new Error("FAAB budget can't be negative.");
    }
    await ctx.db.patch(args.teamId, {
      faabBudgetOverride: args.faabBudget ?? undefined,
    });
    return await ctx.db.get(args.teamId);
  },
});
