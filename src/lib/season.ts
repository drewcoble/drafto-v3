// Best-effort default for the "start next season" form - increments a
// trailing number (e.g. "2025" -> "2026"); falls back to blank for anything
// else rather than guessing wrong.
export function guessNextSeason(current: string | undefined): string {
  if (!current) return "";
  const match = current.match(/(\d+)$/);
  if (!match || match.index === undefined) return "";
  const incremented = String(Number(match[1]) + 1);
  return current.slice(0, match.index) + incremented;
}
