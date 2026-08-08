import { Button, Center, Group, Stack, Text, Title } from "@mantine/core";
import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { getErrorMessage } from "../lib/errors";

// Wired in as __root.tsx's errorComponent - the one app-wide safety net
// against a blank white screen. Convex's useQuery throws synchronously
// during render when the underlying query errors (e.g. a stale/deleted
// league, an auth check failing mid-session), and with no error boundary
// anywhere that throw used to unmount the entire React tree with nothing
// but a console error. This catches it app-wide; "Try again" re-renders
// the failed subtree in place, "Back to dashboard" is the escape hatch for
// anything that keeps failing on retry.
export function RouteErrorFallback({ error, reset }: ErrorComponentProps) {
  const message = getErrorMessage(error, "Something went wrong.");

  return (
    <Center py="xl">
      <Stack gap="sm" align="center" maw={420} ta="center">
        <Title order={4}>Something went wrong</Title>
        <Text c="dimmed" size="sm">
          {message}
        </Text>
        <Group>
          <Button onClick={reset} variant="light">
            Try again
          </Button>
          <Button component={Link} to="/" variant="default">
            Back to dashboard
          </Button>
        </Group>
      </Stack>
    </Center>
  );
}
