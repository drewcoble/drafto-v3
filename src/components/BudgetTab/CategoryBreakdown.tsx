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
