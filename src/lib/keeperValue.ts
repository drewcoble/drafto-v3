// Shared by KeeperCardList.tsx and KeeperTable.tsx to color-code a keeper's
// surplus value (this year's fair price minus what's being paid to keep
// them) consistently between the mobile and desktop layouts.
//
// Zero uses Mantine's theme-aware text color var (rather than a literal
// "white") so it stays legible in both light and dark mode instead of
// disappearing on a light background.
export function keeperValueColor(value: number): string {
  if (value > 0) return "green";
  if (value < 0) return "red";
  return "var(--mantine-color-text)";
}

export function formatSignedDollar(value: number): string {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : "-"}$${Math.abs(rounded)}`;
}
