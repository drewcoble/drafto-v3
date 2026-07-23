import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

const positionValidator = v.union(
  v.literal('QB'),
  v.literal('RB'),
  v.literal('WR'),
  v.literal('TE'),
  v.literal('DST'),
)

export const getProjections = query({
  args: { position: positionValidator, week: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('projections')
      .withIndex('by_position_week', (q) =>
        q.eq('position', args.position).eq('week', args.week),
      )
      .collect()

    return rows.sort((a, b) => b.fpts - a.fpts)
  },
})

export const upsertProjections = mutation({
  args: {
    position: positionValidator,
    week: v.string(),
    rows: v.array(
      v.object({
        playerName: v.string(),
        team: v.union(v.string(), v.null()),
        stats: v.record(v.string(), v.number()),
        fpts: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('projections')
      .withIndex('by_position_week', (q) =>
        q.eq('position', args.position).eq('week', args.week),
      )
      .collect()

    const existingByName = new Map(existing.map((row) => [row.playerName, row]))
    const now = Date.now()
    const seen = new Set<string>()

    for (const row of args.rows) {
      seen.add(row.playerName)
      const match = existingByName.get(row.playerName)

      if (match) {
        await ctx.db.patch(match._id, {
          team: row.team,
          stats: row.stats,
          fpts: row.fpts,
          scrapedAt: now,
        })
      } else {
        await ctx.db.insert('projections', {
          position: args.position,
          week: args.week,
          playerName: row.playerName,
          team: row.team,
          stats: row.stats,
          fpts: row.fpts,
          scrapedAt: now,
        })
      }
    }

    // Drop players that disappeared from the source (e.g. retired, off the board)
    let removed = 0
    for (const row of existing) {
      if (!seen.has(row.playerName)) {
        await ctx.db.delete(row._id)
        removed += 1
      }
    }

    return { upserted: args.rows.length, removed }
  },
})
