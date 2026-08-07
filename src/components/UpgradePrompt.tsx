import { Button, Card, Center, Stack, Text, Title } from "@mantine/core";
import { Link } from "@tanstack/react-router";

interface UpgradePromptProps {
  title?: string;
  message?: string;
}

// Shown wherever a Pro-only feature is gated for a free-plan user (see
// convex/draft/reportCard.ts's "requires_upgrade" status, and the free
// league cap in convex/leagues.ts) instead of an error state.
export function UpgradePrompt({
  title = "This feature requires Pro",
  message = "Upgrade to unlock this feature.",
}: UpgradePromptProps) {
  return (
    <Center py="xl">
      <Card withBorder padding="lg" maw={420}>
        <Stack gap="sm" align="center">
          <Title order={4}>{title}</Title>
          <Text size="sm" c="dimmed" ta="center">
            {message}
          </Text>
          <Button component={Link} to="/billing">
            Upgrade to Pro
          </Button>
        </Stack>
      </Card>
    </Center>
  );
}
