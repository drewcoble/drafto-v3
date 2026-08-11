import { useEffect } from "react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
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
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();

  // Landing here while NOT authenticated almost always means a stale/
  // invalid token was still sitting in this browser's storage - __root.tsx
  // optimistically renders the authenticated tree off that token before the
  // server has actually validated it, some query (e.g. listSeasons) gets
  // rejected with "must be signed in", and we end up here. Plain "Try
  // again" reruns the exact same query against the exact same bad token and
  // loops right back here - reproducing in a brand new tab too, since the
  // bad token persists across tabs until something explicitly clears it.
  // Nothing in that failure path ever calls signOut(), so the token never
  // gets cleared - do that here instead of a normal retry.
  const looksLikeStaleAuth = !isAuthenticated;

  // Self-heals automatically rather than making the user notice and click
  // "Back to sign in" themselves - most people seeing an error screen right
  // after opening the app have no reason to think a button on it will fix
  // anything. The button below still exists as a manual fallback (e.g. if
  // this effect runs before isAuthenticated has settled).
  useEffect(() => {
    if (!looksLikeStaleAuth) return;
    void (async () => {
      await signOut();
      reset();
    })();
    // Only want this once per mount - see looksLikeStaleAuth's comment for
    // why a stale token specifically needs signOut(), not just a retry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Center py="xl">
      <Stack gap="sm" align="center" maw={420} ta="center">
        <Title order={4}>Something went wrong</Title>
        <Text c="dimmed" size="sm">
          {message}
        </Text>
        <Group>
          {looksLikeStaleAuth ? (
            <Button
              variant="light"
              onClick={() => {
                void (async () => {
                  await signOut();
                  reset();
                })();
              }}
            >
              Back to sign in
            </Button>
          ) : (
            <>
              <Button onClick={reset} variant="light">
                Try again
              </Button>
              <Button component={Link} to="/" variant="default">
                Back to dashboard
              </Button>
            </>
          )}
        </Group>
      </Stack>
    </Center>
  );
}
