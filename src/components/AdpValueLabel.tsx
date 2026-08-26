import { Text, Tooltip } from "@mantine/core";
import { formatSignedNumber, keeperValueColor } from "../lib/keeperValue";

interface AdpValueLabelProps {
  ourRank: number | undefined;
  adp: number | undefined;
  // Prefixes the diff with "vs ADP" - same showLabel convention as
  // StandardValueLabel.tsx, redundant inside a table cell that already has
  // its own "vs ADP" column header.
  showLabel?: boolean;
}

// Snake/linear's counterpart to StandardValueLabel.tsx - this app's own
// overall rank (every active-position player sorted by dollarValue, which
// already normalizes VOR across positions the same way $ auction pricing
// does - raw valueOverReplacement isn't directly comparable position to
// position, see PlayersTable.tsx's ourRankByFpid) minus a blended market ADP
// (Sleeper ADP averaged with ESPN's overall draft-kit rank, or ESPN alone
// for superflex since Sleeper has no superflex-aware ADP - see
// PlayersTable.tsx's blendedAdpByFpid), shown as a +/- rank-spot diff.
// Positive = ADP has this player going LATER than our own math ranks them -
// a potential value if they last that long. Negative = ADP drafts them
// EARLIER than our math justifies - a reach at ADP.
export function AdpValueLabel({
  ourRank,
  adp,
  showLabel = true,
}: AdpValueLabelProps) {
  if (ourRank === undefined || adp === undefined) return null;
  const diff = Math.round(adp) - ourRank;
  return (
    <Tooltip label={`Our rank #${ourRank} · ADP #${Math.round(adp)}`} withArrow>
      <Text size="xs" fw={600} c={keeperValueColor(diff)} span>
        {showLabel ? "vs ADP " : ""}
        {formatSignedNumber(diff)}
      </Text>
    </Tooltip>
  );
}
