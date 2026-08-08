import { useEffect, useMemo } from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Center, Container, Loader, Stack, Text, Title } from "@mantine/core";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AuthPanel } from "../components/AuthPanel";
import { RouteErrorFallback } from "../components/RouteErrorFallback";
import { getConfiguredSuperAdminEmails } from "../lib/superAdmin";

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: RouteErrorFallback,
});

function RootComponent() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensureCurrentUser);
  const configuredSuperAdminEmails = useMemo(
    () => getConfiguredSuperAdminEmails(),
    [],
  );

  useEffect(() => {
    if (isAuthenticated) {
      void ensureUser({ allowlistedEmails: configuredSuperAdminEmails });
    }
  }, [ensureUser, isAuthenticated, configuredSuperAdminEmails]);

  if (isLoading) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  if (!isAuthenticated) {
    return (
      <Container size="lg" py="xl">
        <Stack gap="md">
          <Title order={2}>
            <Text component="span" inherit c="saddlebrown.6">
              infini
            </Text>
            draft
          </Title>
          <Text c="dimmed">Sign in to view projections and draft.</Text>
          <AuthPanel />
        </Stack>
      </Container>
    );
  }

  return <Outlet />;
}
