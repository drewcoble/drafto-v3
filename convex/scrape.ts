'use node'

import { v } from 'convex/values'
import * as cheerio from 'cheerio'
import { action } from './_generated/server'
import { api } from './_generated/api'

const BASE_URL = 'https://www.fantasypros.com/nfl/projections'

const positionValidator = v.union(
  v.literal('QB'),
  v.literal('RB'),
  v.literal('WR'),
  v.literal('TE'),
  v.literal('DST'),
)

interface ParsedRow {
  playerName: string
  team: string | null
  stats: Record<string, number>
  fpts: number
}

/**
 * NOTE ON SELECTORS
 * -------------------------------------------------------------------------
 * This parses the projections table by *structure* (thead group row + leaf
 * row, tbody rows/cells) rather than by CSS class names, because FantasyPros'
 * exact class names weren't available to verify at build time. If FantasyPros
 * changes their markup and this starts returning 0 rows, the fix is almost
 * always here: re-check how `table`, `thead tr`, and `tbody tr td` are
 * structured on the live page and adjust the selectors below.
 */
function parseProjectionsTable(html: string): ParsedRow[] {
  const $ = cheerio.load(html)
  const table = $('table').first()

  const headerRows = table.find('thead tr')
  if (headerRows.length === 0) {
    return []
  }

  // FantasyPros renders two header rows for QB/RB/WR/TE: a "group" row
  // (PASSING / RUSHING / MISC) using colspan, and a "leaf" row with the
  // actual stat abbreviations (ATT, YDS, TDS, FPTS, ...). DST typically only
  // has one row. We expand the group row across its colspans so index i in
  // `groups` lines up with index i in `leaves`.
  const groupRow = headerRows.eq(0)
  const groups: string[] = []
  groupRow.find('th').each((_, el) => {
    const label = $(el).text().trim().toUpperCase() || 'MISC'
    const colspan = parseInt($(el).attr('colspan') ?? '1', 10) || 1
    for (let i = 0; i < colspan; i++) groups.push(label)
  })

  const leafRow = headerRows.length > 1 ? headerRows.eq(1) : headerRows.eq(0)
  const leaves: string[] = []
  leafRow.find('th').each((_, el) => {
    leaves.push($(el).text().trim())
  })

  const columnKeys = leaves.map((leaf, i) => {
    if (leaf === '' || leaf.toLowerCase() === 'player') return 'PLAYER'
    if (leaf.toUpperCase() === 'FPTS') return 'FPTS'
    const group = groups[i] ?? ''
    return group && group !== 'MISC' ? `${group}_${leaf}` : leaf
  })

  const rows: ParsedRow[] = []

  table.find('tbody tr').each((_, tr) => {
    const cells = $(tr).find('td')
    if (cells.length === 0) return

    const firstCell = $(cells[0])
    const firstCellText = firstCell.text().trim()
    const anchorText = firstCell.find('a').first().text().trim()
    const playerName = anchorText || firstCellText

    // Team is usually the trailing 2-4 letter abbreviation left over once the
    // player name is removed, e.g. "Jalen HurtsPHI" -> "PHI".
    const remainder = firstCellText.replace(anchorText, '').trim()
    const teamMatch = remainder.match(/[A-Z]{2,4}$/)
    const team = teamMatch ? teamMatch[0] : null

    const stats: Record<string, number> = {}
    let fpts = 0

    cells.each((idx, td) => {
      if (idx === 0) return
      const key = columnKeys[idx] ?? `COL_${idx}`
      const raw = $(td).text().trim().replace(/,/g, '')
      const value = parseFloat(raw)
      if (Number.isNaN(value)) return

      if (key === 'FPTS') {
        fpts = value
      } else {
        stats[key] = value
      }
    })

    if (playerName) {
      rows.push({ playerName, team, stats, fpts })
    }
  })

  return rows
}

export const scrapePosition = action({
  args: { position: positionValidator, week: v.string() },
  handler: async (ctx, args): Promise<{ upserted: number; removed: number }> => {
    const urlPosition = args.position.toLowerCase()
    const url = `${BASE_URL}/${urlPosition}.php?max-yes=true&min-yes=true&week=${args.week}`

    const response = await fetch(url, {
      headers: {
        // A real UA reduces the odds of being served a stripped-down page.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()
    const rows = parseProjectionsTable(html)

    if (rows.length === 0) {
      throw new Error(
        `No rows parsed for ${args.position} (week=${args.week}). The page structure may ` +
          `have changed, or the site served a bot-check page — inspect the selectors in convex/scrape.ts.`,
      )
    }

    const result = await ctx.runMutation(api.projections.upsertProjections, {
      position: args.position,
      week: args.week,
      rows,
    })

    return result
  },
})

export const scrapeAllPositions = action({
  args: { week: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const positions = ['QB', 'RB', 'WR', 'TE', 'DST'] as const
    for (const position of positions) {
      await ctx.runAction(api.scrape.scrapePosition, { position, week: args.week })
    }
  },
})
