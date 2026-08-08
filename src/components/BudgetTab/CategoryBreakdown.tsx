import { Box, Group, Stack, Text } from "@mantine/core";
import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_ORDER } from "../../constants/budget";

interface CategoryBreakdownProps {
  categoryTotals: Array<{ category: (typeof CATEGORY_ORDER)[number]; total: number }>;
  salaryCap: number;
}

export function CategoryBreakdown({
  categoryTotals,
  salaryCap,
}: CategoryBreakdownProps) {
  const allocated = categoryTotals.reduce((sum, { total }) => sum + total, 0);
  const remaining = Math.max(salaryCap - allocated, 0);
  // Nothing allocated yet - a full-width saddlebrown bar reads as "spent",
  // not "nothing chosen", so fall back to a neutral gray until at least
  // something's been budgeted.
  const remainingColor = allocated === 0 ? "gray-6" : "saddlebrown-6";
  return (
    <Stack gap={6}>
      <Box
        style={{
          display: "flex",
          height: 10,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        {categoryTotals.map(({ category, total }) =>
          total > 0 ? (
            <Box
              key={category}
              style={{
                width: `${(total / salaryCap) * 100}%`,
                backgroundColor: `var(--mantine-color-${CATEGORY_COLORS[category]}-6)`,
              }}
            />
          ) : null,
        )}
        {remaining > 0 && (
          // Cap still available to spend - the accent color (matching the
          // palette's "money/scarcity" accent), distinct from the
          // position-colored spent segments to its left. Gray instead once
          // nothing's allocated at all - see remainingColor above.
          <Box
            style={{
              width: `${(remaining / salaryCap) * 100}%`,
              backgroundColor: `var(--mantine-color-${remainingColor})`,
            }}
          />
        )}
      </Box>
      <Group gap="md">
        {categoryTotals.map(({ category, total }) => (
          <Text key={category} size="xs" c="dimmed">
            {CATEGORY_LABELS[category]} ${total}
          </Text>
        ))}
      </Group>
    </Stack>
  );
}
