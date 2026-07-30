import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireDraftOwner } from "./auth";

// Single-player read composing every per-record (not pool-relative) field
// the detail modal needs: identity, this-week projection/ranking, current
// injury status, and - only when draftSettingsId is passed - this draft's
// pick/keeper status and target/avoid tag. Pool-relative fields (news list,
// value-gap signal, $ draft value) are deliberately NOT here - the modal
// reads those via news.getNewsForFpids / valueGaps.getAllValueGaps /
// draftValues.getDraftValues directly so this query never duplicates that
// pool-computation logic.
export const getPlayerDetail = query({
  args: {
    fpid: v.number(),
    week: v.string(),
    draftSettingsId: v.optional(v.id("draftSettings")),
  },
  handler: async (ctx, args) => {
    // Only enforce draft ownership when draft-scoped fields are requested -
    // identity/projection/injury are public reads (same as players.getPlayer/
    // injuries.getInjuries today), so this still works with no league
    // selected (e.g. the pre-draft Players tab before any league exists).
    if (args.draftSettingsId) {
      await requireDraftOwner(ctx, args.draftSettingsId);
    }

    const player = await ctx.db
      .query("players")
      .withIndex("by_fpid", (q) => q.eq("fpid", args.fpid))
      .first();
    if (!player) return null;

    const [projection, ranking, injury] = await Promise.all([
      ctx.db
        .query("projections")
        .withIndex("by_position_week_fpid", (q) =>
          q
            .eq("position", player.position)
            .eq("week", args.week)
            .eq("fpid", args.fpid),
        )
        .first(),
      ctx.db
        .query("rankings")
        .withIndex("by_position_week_fpid", (q) =>
          q
            .eq("position", player.position)
            .eq("week", args.week)
            .eq("fpid", args.fpid),
        )
        .first(),
      ctx.db
        .query("injuries")
        .withIndex("by_fpid", (q) => q.eq("fpid", args.fpid))
        .first(),
    ]);

    let pick = null;
    let tag: "target" | "avoid" | null = null;
    if (args.draftSettingsId) {
      const draftSettingsId = args.draftSettingsId;
      const [pickRow, tagRow] = await Promise.all([
        ctx.db
          .query("draftPicks")
          .withIndex("by_draft_fpid", (q) =>
            q.eq("draftSettingsId", draftSettingsId).eq("fpid", args.fpid),
          )
          .first(),
        ctx.db
          .query("draftPlayerTags")
          .withIndex("by_draft_fpid", (q) =>
            q.eq("draftSettingsId", draftSettingsId).eq("fpid", args.fpid),
          )
          .first(),
      ]);
      pick = pickRow;
      tag = tagRow?.tag ?? null;
    }

    return { player, projection, ranking, injury, pick, tag };
  },
});
