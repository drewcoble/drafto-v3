import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { positionValidator } from "./positions";

// Every fpid we've ever chosen to track (populated by upsertPlayers below,
// so it never grows beyond "players we decided were roster-relevant").
// Internal-only: used by convex/sleeper/playerPoints.ts to drop stat rows
// for a player we don't otherwise have a record of, rather than by any
// client-facing list, so a full collect() here stays bounded by that same
// roster-relevant set rather than the unbounded Sleeper payload.
export const listKnownFpids = internalQuery({
  args: {},
  handler: async (ctx) => {
    const players = await ctx.db.query("players").collect();
    return players.map((player) => player.fpid);
  },
});

export const getPlayer = query({
  args: { fpid: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("players")
      .withIndex("by_fpid", (q) => q.eq("fpid", args.fpid))
      .first();
  },
});

export const upsertPlayers = mutation({
  args: {
    rows: v.array(
      v.object({
        fpid: v.number(),
        name: v.string(),
        position: positionValidator,
        team: v.union(v.string(), v.null()),
        yearsExp: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let inserted = 0;
    let updated = 0;

    for (const row of args.rows) {
      const existing = await ctx.db
        .query("players")
        .withIndex("by_fpid", (q) => q.eq("fpid", row.fpid))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          name: row.name,
          position: row.position,
          team: row.team,
          ...(row.yearsExp !== undefined ? { yearsExp: row.yearsExp } : {}),
          updatedAt: now,
        });
        updated += 1;
      } else {
        await ctx.db.insert("players", {
          fpid: row.fpid,
          name: row.name,
          position: row.position,
          team: row.team,
          ...(row.yearsExp !== undefined ? { yearsExp: row.yearsExp } : {}),
          updatedAt: now,
        });
        inserted += 1;
      }
    }

    return { inserted, updated };
  },
});

// Rookie fpids (years_exp === 0), for badge lookups anywhere a player row
// only carries an fpid (projections/draftValues/faabValues rows all
// snapshot identity independently and don't otherwise carry yearsExp) - see
// src/hooks/useRookieFpids.ts, the sole client of this query.
export const getRookieFpids = query({
  args: {},
  handler: async (ctx) => {
    const players = await ctx.db.query("players").collect();
    return players
      .filter((player) => player.yearsExp === 0)
      .map((player) => player.fpid);
  },
});
