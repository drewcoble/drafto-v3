import { Box, Group, Text } from "@mantine/core";
import {
  MOBILE_HEADER_HEIGHT,
  MOBILE_STATS_ROW_HEIGHT,
} from "../../../constants/general";

interface MobileStatsRowProps {
  maxBid: number;
  planSafe: number | null;
  openSlots: number;
  perOpenSlot: number;
}

// Condensed, single-row version of the desktop stat tiles (see StatTile.tsx
// / the SimpleGrid in DraftTopBar.tsx) - docked directly under the fixed
// AppHeader on mobile (top: MOBILE_HEADER_HEIGHT, no gap) so budget context
// stays visible without scrolling, and reads as one continuous fixed header
// block rather than a separate floating piece. Every mobile layout that
// renders this must also reserve MOBILE_STATS_ROW_HEIGHT of top padding, on
// top of MOBILE_HEADER_HEIGHT (see draft route layout).
export function MobileStatsRow({
  maxBid,
  planSafe,
  openSlots,
  perOpenSlot,
}: MobileStatsRowProps) {
  const stats = [
    { label: "Max Bid", value: `$${Math.max(maxBid, 0)}`, color: "inherit" },
    {
      label: "Budget +/-",
      value:
        planSafe === null
          ? "—"
          : planSafe > 0
            ? `+$${planSafe}`
            : `-$${Math.abs(planSafe)}`,
      color:
        planSafe === null
          ? "inherit"
          : planSafe > 0
            ? "green"
            : planSafe < 0
              ? "red"
              : "inherit",
    },
    { label: "Open", value: openSlots.toString(), color: "inherit" },
    { label: "/Slot", value: `$${perOpenSlot.toFixed(1)}`, color: "inherit" },
  ];

  return (
    <Box
      hiddenFrom="sm"
      pos="fixed"
      top={MOBILE_HEADER_HEIGHT}
      left={0}
      right={0}
      px="md"
      style={{
        zIndex: 210,
        minHeight: MOBILE_STATS_ROW_HEIGHT,
        display: "flex",
        alignItems: "center",
        // Same frosted-glass treatment as AppHeader.tsx/BottomNav.tsx -
        // translucent + blurred rather than a flat cutout, so this reads
        // as one continuous fixed header block with AppHeader above it.
        background:
          "color-mix(in srgb, var(--mantine-color-body) 75%, transparent)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--mantine-color-default-border)",
      }}
    >
      <Group justify="space-between" wrap="nowrap" style={{ flex: 1 }}>
        {stats.map((stat) => (
          <Group key={stat.label} gap={4} wrap="nowrap">
            <Text size="xs" c="dimmed">
              {stat.label}
            </Text>
            <Text size="sm" fw={700} c={stat.color}>
              {stat.value}
            </Text>
          </Group>
        ))}
      </Group>
    </Box>
  );
}
