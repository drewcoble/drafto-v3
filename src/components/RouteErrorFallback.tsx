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
  const looksLikeStaleAuth = !isAuthenticated;

  // Deliberately not an automatic useEffect - an earlier version tried
  // signOut() + reset() (an in-place re-render) as soon as this mounted,
  // but reset() can fire before isAuthenticated has actually finished
  // settling, so the same query fails again immediately, remounting this
  // component and re-triggering the effect - a visible flash loop between
  // this screen and the sign-in form instead of settling on either. A hard
  // reload sidesteps that entirely: it throws away the whole in-memory
  // auth/Convex client state and starts completely fresh against whatever
  // is actually in storage after signOut() clears it, so there's no
  // in-place render to race. Manual (one click) rather than automatic also
  // means it can only ever happen once, never loop on its own.
  const handleBackToSignIn = () => {
    void (async () => {
      await signOut();
      window.location.href = "/";
    })();
  };

  return (
    <Center py="xl">
      <Stack gap="sm" align="center" maw={420} ta="center">
        <Title order={4}>Something went wrong</Title>
        <Text c="dimmed" size="sm">
          {message}
        </Text>
        <Group>
          {looksLikeStaleAuth ? (
            <Button variant="light" onClick={handleBackToSignIn}>
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
