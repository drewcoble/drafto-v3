import { Text, Tooltip } from "@mantine/core";
import type { StandardValueRow } from "../lib/standardValues";

interface StandardValueLabelProps {
  draftValue: number | undefined;
  standardValue: StandardValueRow | undefined;
}

// Compact market comparison - this app's own $ value minus a third-party
// draft-kit's $ auction value for the same player (see
// convex/espn/rankings.ts), shown as a +/- diff rather than the raw
// external number so a bargain/overpay is visible at a glance without
// naming the source or adding a whole extra column. Renders nothing when
// there's nothing to diff against - deep-bench players the external source
// doesn't rank, an fpid never linked to an external id, or this app's own
// value isn't available yet.
export function StandardValueLabel({
  draftValue,
  standardValue,
}: StandardValueLabelProps) {
  if (!standardValue || draftValue === undefined) return null;
  const diff = Math.round(draftValue) - Math.round(standardValue.auctionValue);
  const sign = diff > 0 ? "+" : diff < 0 ? "-" : "±";
  return (
    <Tooltip
      label={`Market rank #${Math.round(standardValue.rank)} · market value $${Math.round(standardValue.auctionValue)}`}
      withArrow
    >
      <Text size="xs" c="dimmed" span>
        vs. market {sign}${Math.abs(diff)}
      </Text>
    </Tooltip>
  );
}
