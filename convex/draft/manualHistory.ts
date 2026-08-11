import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireSeasonOwner } from "./auth";

// Lets a host backfill keeper-cost history for a season this app never ran
// a draft for (or ran outside a Sleeper/Yahoo-linked league) - see
// src/pages/Settings/components/ManualPreviousSeasonModal.tsx. Creates a
// synthetic prior season/draft the exact same way convex/leagues.ts's
// importPreviousSeasonHistory does for provider imports, except every pick
// is tagged teamAssignmentConfirmed: true (the user is directly asserting
// "this team had this player," not just reporting draft-day results that
// may be stale from trades/waivers - see schema.ts's comment on that field)
// and historySource: "manual" (so setManualPreviousSeasonResults below
// knows it's allowed to overwrite this season again later, unlike a real
// in-app draft's history or an unconfirmed provider import).

const teamInputValidator = v.object({
  name: v.string(),
  isSelf: v.boolean(),
  players: v.array(
    v.object({
      fpid: v.number(),
      price: v.number(),
    }),
  ),
});

// Existing manually-entered data for `year`, if any - used to pre-fill the
// edit form. Returns null both when no season exists for that year yet AND
// when one exists but wasn't manually entered (a real draft, or an
// unconfirmed provider import) - either way there's nothing for the manual
// edit UI to pre-fill from, and the mutation below would refuse to touch it
// anyway.
export const getManualPreviousSeasonEntry = query({
  args: { seasonId: v.id("seasons"), year: v.string() },
  handler: async (ctx, args) => {
    const { league } = await requireSeasonOwner(ctx, args.seasonId);
    const historySeason = await ctx.db
      .query("seasons")
      .withIndex("by_league_year", (q) =>
        q.eq("leagueId", league._id).eq("year", args.year),
      )
      .first();
    if (!historySeason) return null;

    const historyDraft = await ctx.db
      .query("drafts")
      .withIndex("by_season_kind", (q) =>
        q.eq("seasonId", historySeason._id).eq("kind", "real"),
      )
      .first();
    if (!historyDraft || historyDraft.historySource !== "manual") return null;

    const teams = await ctx.db
      .query("seasonTeams")
      .withIndex("by_season", (q) => q.eq("seasonId", historySeason._id))
      .collect();
    const picks = await ctx.db
      .query("draftPicks")
      .withIndex("by_draft", (q) => q.eq("draftId", historyDraft._id))
      .collect();
    const picksByTeamId = new Map<Id<"seasonTeams">, typeof picks>();
    for (const pick of picks) {
      const list = picksByTeamId.get(pick.teamId) ?? [];
      list.push(pick);
      picksByTeamId.set(pick.teamId, list);
    }

    return {
      teams: teams
        .sort((a, b) => a.order - b.order)
        .map((team) => ({
          name: team.name,
          isSelf: team.isSelf,
          players: (picksByTeamId.get(team._id) ?? []).map((pick) => ({
            fpid: pick.fpid,
            price: pick.price,
          })),
        })),
    };
  },
});

// Creates (or, if `year` already has a manually-entered season, fully
// replaces) this league's synthetic history for that year. Full-replace
// rather than a diff - the edit form always resubmits its whole current
// state, same as e.g. TeamsPanel's nomination-order Save - so a typo fix or
// a team reassignment is just "change the row, submit again."
export const setManualPreviousSeasonResults = mutation({
  args: {
    seasonId: v.id("seasons"),
    year: v.string(),
    teams: v.array(teamInputValidator),
  },
  handler: async (ctx, args) => {
    const { season: current, league } = await requireSeasonOwner(
      ctx,
      args.seasonId,
    );

    const existingSeason = await ctx.db
      .query("seasons")
      .withIndex("by_league_year", (q) =>
        q.eq("leagueId", league._id).eq("year", args.year),
      )
      .first();

    const now = Date.now();
    let historySeasonId: Id<"seasons">;
    let historyDraftId: Id<"drafts">;

    if (existingSeason) {
      const existingDraft = await ctx.db
        .query("drafts")
        .withIndex("by_season_kind", (q) =>
          q.eq("seasonId", existingSeason._id).eq("kind", "real"),
        )
        .first();
      if (!existingDraft || existingDraft.historySource !== "manual") {
        throw new Error(
          `This league already has a ${args.year} season that wasn't entered here, so it can't be overwritten this way.`,
        );
      }
      historySeasonId = existingSeason._id;
      historyDraftId = existingDraft._id;

      const oldTeams = await ctx.db
        .query("seasonTeams")
        .withIndex("by_season", (q) => q.eq("seasonId", historySeasonId))
        .collect();
      for (const team of oldTeams) {
        await ctx.db.delete(team._id);
      }
      const oldPicks = await ctx.db
        .query("draftPicks")
        .withIndex("by_draft", (q) => q.eq("draftId", historyDraftId))
        .collect();
      for (const pick of oldPicks) {
        await ctx.db.delete(pick._id);
      }
    } else {
      historySeasonId = await ctx.db.insert("seasons", {
        leagueId: league._id,
        year: args.year,
        teamCount: args.teams.length,
        salaryCap: current.salaryCap,
        scoring: current.scoring,
        ...(current.teScoring !== undefined
          ? { teScoring: current.teScoring }
          : {}),
        ...(current.sixPointPassTds !== undefined
          ? { sixPointPassTds: current.sixPointPassTds }
          : {}),
        rosterSlots: current.rosterSlots,
        flexPositions: current.flexPositions,
        superflexPositions: current.superflexPositions,
        createdAt: now,
      });
      historyDraftId = await ctx.db.insert("drafts", {
        seasonId: historySeasonId,
        kind: "real",
        name: `${league.name} (Manually entered ${args.year})`,
        status: "complete",
        historySource: "manual",
        createdAt: now,
      });
    }

    let sequence = 0;
    for (const [index, team] of args.teams.entries()) {
      const teamId = await ctx.db.insert("seasonTeams", {
        seasonId: historySeasonId,
        name: team.name,
        isSelf: team.isSelf,
        order: index,
        createdAt: now,
      });
      for (const player of team.players) {
        // Same "skip anything this app has no identity/position record for"
        // rule as importPreviousSeasonHistory - draftPicks.position is
        // required and there's nowhere else to source it from.
        const playerDoc = await ctx.db
          .query("players")
          .withIndex("by_fpid", (q) => q.eq("fpid", player.fpid))
          .first();
        if (!playerDoc) continue;
        sequence += 1;
        await ctx.db.insert("draftPicks", {
          draftId: historyDraftId,
          sequence,
          fpid: player.fpid,
          position: playerDoc.position,
          teamId,
          price: player.price,
          teamAssignmentConfirmed: true,
          createdAt: now,
        });
      }
    }

    return historySeasonId;
  },
});
