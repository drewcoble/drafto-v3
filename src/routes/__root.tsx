import { useEffect, useMemo } from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Center, Loader, Stack, Text } from "@mantine/core";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AppHeader } from "../components/AppHeader";
import { AuthPanel } from "../components/AuthPanel";
import { PageContainer } from "../components/PageContainer";
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
      <PageContainer>
        <Stack gap="md">
          <AppHeader minimal />
          <Center>
            <Loader />
          </Center>
        </Stack>
      </PageContainer>
    );
  }

  if (!isAuthenticated) {
    return (
      <PageContainer>
        <Stack gap="md">
          <AppHeader minimal />
          <Stack gap="md" maw={420} mx="auto">
            <Text c="dimmed">Sign in to view projections and draft.</Text>
            <AuthPanel />
          </Stack>
        </Stack>
      </PageContainer>
    );
  }

  return <Outlet />;
}
