// Server-side port of src/lib/consistency.ts's tercile-based consistency
// labeling (duplicated rather than imported - Convex's bundler doesn't
// allow importing across the convex/ boundary, same convention as
// expandRosterSlots/isDraftComplete in convex/draft/slots.ts). Keep the two
// in sync; formula must match exactly so a player's label never disagrees
// between the live draft board and this post-draft report.
export type ConsistencyLabel = "Reliable" | "Boom/Bust" | "Low Output";

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
