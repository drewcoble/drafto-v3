import { Group, Stack, Text } from "@mantine/core";
import { TeamBudgetStats } from "../../lib/teamBudget";

const BudgetStats = ({
  stats,
  position,
}: {
  stats: TeamBudgetStats;
  position: "top" | "bottom";
}) => {
  const mProps = position === "top" ? { marginBottom: 4 } : { marginTop: 4 };
  return (
    <Stack gap={4} style={{ ...mProps }}>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          max bid
        </Text>
        <Text fw={700} size="sm">
          ${Math.max(stats.maxBid, 0)}
        </Text>
      </Group>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          empty spots
        </Text>
        <Text fw={500} size="sm">
          {stats.openSlots}
        </Text>
      </Group>
    </Stack>
  );
};

export default BudgetStats;
