import { Text, Tooltip } from "@mantine/core";
import type { StandardValueRow } from "../lib/standardValues";

interface StandardValueLabelProps {
  value: StandardValueRow | undefined;
}

// Compact "market" comparison figure - ESPN's own $ auction value for this
// player (convex/espn/rankings.ts), shown next to this app's own computed
// value so a gap between the two (a potential bargain or overpay) is
// visible at a glance without a whole extra column. Renders nothing when
// there's no ESPN comparison for this player - deep-bench players ESPN
// doesn't rank, or an fpid that's never been linked to an ESPN id.
export function StandardValueLabel({ value }: StandardValueLabelProps) {
  if (!value) return null;
  return (
    <Tooltip label={`ESPN rank #${Math.round(value.rank)}`} withArrow>
      <Text size="xs" c="dimmed" span>
        espn ${Math.round(value.auctionValue)}
      </Text>
    </Tooltip>
  );
}
