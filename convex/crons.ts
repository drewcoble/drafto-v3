import { cronJobs } from 'convex/server'
import { api } from './_generated/api'

const crons = cronJobs()

// Refetch draft projections + players/rankings/news/injuries/player-points
// once a day. Adjust `week` to a specific week number ("1", "2", ...) once
// the season starts.
crons.cron(
  'fetch draft data',
  '0 12 * * *',
  api.fetchAllData.fetchAll,
  { week: 'draft' },
)

export default crons
