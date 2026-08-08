import { useEffect, useState } from "react";
import { useAction, useQuery } from "convex/react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Center,
  Container,
  Group,
  List,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { api } from "../../../convex/_generated/api";

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// The app's one paid plan - see convex/schema.ts's subscriptions table and
// the monetization plan for what this unlocks (unlimited leagues, Report
// Card/Lineup Optimizer, real per-league player values instead of generic
// estimates).
export function BillingPage() {
  const subscription = useQuery(api.billing.queries.getMySubscription);
  const startCheckout = useAction(api.billing.actions.startCheckout);
  const openBillingPortal = useAction(api.billing.actions.openBillingPortal);
  const reconcileCheckoutSession = useAction(
    api.billing.actions.reconcileCheckoutSession,
  );
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);

  // Right after a successful Stripe Checkout, reconcile immediately instead
  // of waiting on the webhook - same "read window.location.search once,
  // clear it, react" pattern SeasonSettingsTab.tsx uses for the Yahoo OAuth
  // redirect.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const sessionId = params.get("session_id");
    if (checkout === "success" && sessionId) {
      setIsReconciling(true);
      void reconcileCheckoutSession({ sessionId })
        .catch(() => {
          // The webhook will still catch this shortly - not fatal if the
          // client-side reconcile fails (e.g. a slow Stripe read).
        })
        .finally(() => setIsReconciling(false));
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [reconcileCheckoutSession]);

  const handleSubscribe = async () => {
    setError(null);
    setIsRedirecting(true);
    try {
      const { url } = await startCheckout({
        successPath: "/billing",
        cancelPath: "/billing",
      });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout.");
      setIsRedirecting(false);
    }
  };

  const handleManage = async () => {
    setError(null);
    setIsRedirecting(true);
    try {
      const { url } = await openBillingPortal({ returnPath: "/billing" });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open billing portal.");
      setIsRedirecting(false);
    }
  };

  if (subscription === undefined || isReconciling) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  const isActive =
    subscription?.comped ||
    subscription?.status === "active" ||
    subscription?.status === "past_due";

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Group gap="xs">
          <ActionIcon
            component={Link}
            to="/"
            variant="subtle"
            color="gray"
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={18} />
          </ActionIcon>
          <Title order={2}>Billing</Title>
        </Group>

        {isActive ? (
          <Card withBorder padding="lg">
            <Stack gap="sm">
              <Group justify="space-between">
                <Title order={4}>Pro plan</Title>
                <Badge color="green">Active</Badge>
              </Group>
              {subscription?.comped && (
                <Text size="sm" c="dimmed">
                  You have complimentary Pro access.
                </Text>
              )}
              {subscription?.status === "past_due" && (
                <Text size="sm" c="orange">
                  Your last payment failed - Stripe is retrying automatically.
                  Update your card to avoid losing access.
                </Text>
              )}
              {subscription?.currentPeriodEnd && (
                <Text size="sm" c="dimmed">
                  {subscription.cancelAtPeriodEnd ? "Cancels" : "Renews"} on{" "}
                  {formatDate(subscription.currentPeriodEnd)}.
                </Text>
              )}
              {subscription?.hasStripeCustomer ? (
                <Button
                  onClick={() => void handleManage()}
                  loading={isRedirecting}
                  variant="light"
                >
                  Manage subscription
                </Button>
              ) : (
                <Text size="sm" c="dimmed">
                  Contact support to make changes to your complimentary access.
                </Text>
              )}
            </Stack>
          </Card>
        ) : (
          <Card withBorder padding="lg">
            <Stack gap="sm">
              <Title order={4}>Pro</Title>
              <Text size="sm" c="dimmed">
                Unlock everything the free plan limits.
              </Text>
              <List size="sm" spacing={4}>
                <List.Item>Unlimited leagues</List.Item>
                <List.Item>Draft Report Card &amp; Lineup Optimizer</List.Item>
                <List.Item>
                  Real player $ values for your league's actual settings
                </List.Item>
              </List>
              <Button onClick={() => void handleSubscribe()} loading={isRedirecting}>
                Subscribe
              </Button>
            </Stack>
          </Card>
        )}

        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
      </Stack>
    </Container>
  );
}
