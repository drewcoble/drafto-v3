import { STAT_LABELS } from "../constants/playerStats";

export function injuryColor(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("IR") || s.includes("OUT")) return "red";
  if (s.includes("DOUBTFUL")) return "orange";
  if (s.includes("QUESTIONABLE")) return "yellow";
  return "gray";
}

export function formatStatKey(key: string): string {
  return (
    STAT_LABELS[key] ??
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}
