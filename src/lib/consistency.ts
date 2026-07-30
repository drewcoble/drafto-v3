export type ConsistencyLabel = "Reliable" | "Boom/Bust" | "Low Output";

// A player needs at least this many games in a season before their PPG or
// week-to-week volatility means anything - otherwise a 1-3 game sample
// could produce a wildly misleading label.
const MIN_GAMES = 4;

export interface ConsistencyThresholds {
  lowPpg: number;
  highPpg: number;
  lowCv: number;
  highCv: number;
}

function percentile(sortedAsc: number[], p: number): number {
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.floor(p * sortedAsc.length))]!;
}

// Tercile cutoffs for one position's season cohort, on two independent
// axes: PPG (bottom third "low", top third "high") and week-to-week
// coefficient of variation (stdDeviation / PPG - same split). Feeding both
// into getConsistencyLabel below is what creates the "middle ground": a
// player only gets a label when they land in an extreme third on *both*
// axes, so most players (average on at least one) get none. Checked
// against real 2025 PPR stats - this leaves roughly 70% of players
// unlabeled, matching how volatile football actually is; a flat
// above/below-average split (the previous approach) instead put ~80% of
// starters in "Boom/Bust", which is a description of every fantasy season,
// not a useful signal.
export function computeConsistencyThresholds(
  rows: Array<{ totalPoints: number; gamesPlayed: number; stdDeviation: number }>,
): ConsistencyThresholds | null {
  const eligible = rows.filter((row) => row.gamesPlayed >= MIN_GAMES);
  if (eligible.length === 0) return null;
  const ppgs: number[] = [];
  const cvs: number[] = [];
  for (const row of eligible) {
    const ppg = row.totalPoints / row.gamesPlayed;
    ppgs.push(ppg);
    cvs.push(ppg > 0 ? row.stdDeviation / ppg : Infinity);
  }
  ppgs.sort((a, b) => a - b);
  cvs.sort((a, b) => a - b);
  return {
    lowPpg: percentile(ppgs, 1 / 3),
    highPpg: percentile(ppgs, 2 / 3),
    lowCv: percentile(cvs, 1 / 3),
    highCv: percentile(cvs, 2 / 3),
  };
}

// Reliable = high PPG, low variance ("consistently not bad"). Boom/Bust =
// high PPG, high variance (a real toss-up between a dud and a monster
// week). Low Output = low PPG, low variance (consistently bad). Everyone
// else - average on either axis, or the low-PPG/high-variance "deep-bench
// flier" case that doesn't match either named archetype - gets no label.
export function getConsistencyLabel(
  player: { totalPoints: number; gamesPlayed: number; stdDeviation: number },
  thresholds: ConsistencyThresholds | null,
): ConsistencyLabel | null {
  if (player.gamesPlayed < MIN_GAMES || !thresholds) return null;
  const ppg = player.totalPoints / player.gamesPlayed;
  const cv = ppg > 0 ? player.stdDeviation / ppg : Infinity;
  const ppgTier =
    ppg >= thresholds.highPpg ? "high" : ppg <= thresholds.lowPpg ? "low" : "avg";
  const cvTier =
    cv <= thresholds.lowCv ? "low" : cv >= thresholds.highCv ? "high" : "avg";
  if (ppgTier === "high" && cvTier === "low") return "Reliable";
  if (ppgTier === "high" && cvTier === "high") return "Boom/Bust";
  if (ppgTier === "low" && cvTier === "low") return "Low Output";
  return null;
}

// Stoplight scheme: Reliable (green/go), Boom/Bust (yellow/caution), Low
// Output (red/stop).
export function consistencyColor(label: ConsistencyLabel): string {
  if (label === "Reliable") return "green";
  if (label === "Boom/Bust") return "yellow";
  return "red";
}
