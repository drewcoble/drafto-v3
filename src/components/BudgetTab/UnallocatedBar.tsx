import { Badge, Box, Group, Text } from "@mantine/core";
import {
  BUDGET_UNALLOCATED_BAR_HEIGHT,
  MOBILE_HEADER_HEIGHT,
} from "../../constants/general";

interface UnallocatedBarProps {
  unallocated: number;
}

// Docked directly under the fixed AppHeader on mobile, Setup app's pre-draft
// Budget tab only (see BudgetTab.tsx) - the unallocated total used to live
// only in the in-flow header Group above the slot list, which scrolled out
// of view as soon as you started editing, right when it matters most.
// Callers must reserve BUDGET_UNALLOCATED_BAR_HEIGHT with a spacer, since a
// `position: fixed` element is pulled out of normal document flow.
export function UnallocatedBar({ unallocated }: UnallocatedBarProps) {
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
        minHeight: BUDGET_UNALLOCATED_BAR_HEIGHT,
        display: "flex",
        alignItems: "center",
        background: "var(--mantine-color-body)",
        borderBottom: "1px solid var(--mantine-color-default-border)",
      }}
    >
      <Group justify="space-between" wrap="nowrap" style={{ flex: 1 }}>
        <Text size="sm" fw={600}>
          Allocate the cap
        </Text>
        <Badge
          variant="light"
          color={unallocated === 0 ? "green" : "yellow"}
          size="lg"
        >
          ${unallocated} unallocated
        </Badge>
      </Group>
    </Box>
  );
}
