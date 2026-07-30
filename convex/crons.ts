import { cronJobs } from 'convex/server'
import { api } from './_generated/api'

const crons = cronJobs()

// Refetch draft projections + players/rankings/injuries/player-points (all
// Sleeper) and news (FantasyPros) once a day. No `week` arg - fetchAll
// auto-detects the current NFL week via Sleeper's state endpoint on every
// run (cron args are static at deploy time, so a hardcoded value here would
// never update on its own).
crons.cron(
  'fetch draft data',
  '0 12 * * *',
  api.fetchAllData.fetchAll,
  {},
)

export default crons
