// Sleeper's real, documented consumer API (api.sleeper.app/v1/) - distinct
// from the undocumented api.sleeper.com endpoints in ./client.ts used for
// projections/stats. Confirmed live response shape (2026 preseason):
// {"week": 0, "season": "2026", "season_type": "pre", ...}.
const STATE_API_BASE_URL = "https://api.sleeper.app/v1";

interface SleeperNflState {
  week: number;
  season: string;
  season_type: "pre" | "regular" | "post";
}

// The week value this app should fetch/tag data with, derived from
// Sleeper's own notion of "what's happening right now" - "0" outside the
// regular season (matches this app's existing season-long/draft-prep
// sentinel), otherwise Sleeper's actual current week number. Called fresh
// at runtime by whatever's fetching (see convex/fetchAllData.ts) rather
// than baked into a cron argument, since cron args are static at deploy
// time and would never update on their own.
export async function fetchCurrentNflWeek(): Promise<string> {
  const response = await fetch(`${STATE_API_BASE_URL}/state/nfl`);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Sleeper state API request failed: ${response.status} ${response.statusText}` +
        (body ? ` - ${body}` : ""),
    );
  }
  const state: SleeperNflState = await response.json();
  return state.season_type === "regular" ? String(state.week) : "0";
}
