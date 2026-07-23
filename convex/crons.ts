import { cronJobs } from 'convex/server'
import { api } from './_generated/api'

const crons = cronJobs()

// Re-scrape draft projections for all positions once a day.
// Adjust `week` to a specific week number ("1", "2", ...) once the season starts.
crons.daily(
  'scrape draft projections',
  { hourUTC: 12, minuteUTC: 0 },
  api.scrape.scrapeAllPositions,
  { week: 'draft' },
)

export default crons
