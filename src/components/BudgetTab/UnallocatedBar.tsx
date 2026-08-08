import { Badge, Box, Group } from "@mantine/core";
import {
  BUDGET_UNALLOCATED_BAR_HEIGHT,
  MOBILE_HEADER_HEIGHT,
} from "../../constants/general";

interface UnallocatedBarProps {
  unallocated: number;
  isDirty: boolean;
}

// Docked directly under the fixed AppHeader on mobile, Setup app's pre-draft
// Budget tab only (see BudgetTab.tsx) - the unallocated total and dirty
// state used to live only in the in-flow Group/Stack above and below the
// slot list, which scrolled out of view as soon as you started editing,
// right when they matter most. Callers must reserve
// BUDGET_UNALLOCATED_BAR_HEIGHT with a spacer, since a `position: fixed`
// element is pulled out of normal document flow.
export function UnallocatedBar({ unallocated, isDirty }: UnallocatedBarProps) {
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
        <Badge variant="light" color={isDirty ? "yellow" : "teal"}>
          {isDirty ? "Unsaved changes" : "All changes saved"}
        </Badge>
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
