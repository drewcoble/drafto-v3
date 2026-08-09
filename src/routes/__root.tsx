import { useEffect, useMemo } from "react";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Center, Container, Loader, Stack, Text } from "@mantine/core";
import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AppHeader } from "../components/AppHeader";
import { AuthPanel } from "../components/AuthPanel";
import { RouteErrorFallback } from "../components/RouteErrorFallback";
import { MOBILE_HEADER_HEIGHT } from "../constants/general";
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
      <>
        <AppHeader minimal />
        <Center pt={{ base: MOBILE_HEADER_HEIGHT + 16, sm: "xl" }} pb="xl">
          <Loader />
        </Center>
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <AppHeader minimal />
        <Container
          size="lg"
          pt={{ base: MOBILE_HEADER_HEIGHT + 16, sm: "xl" }}
          pb="xl"
        >
          <Stack gap="md">
            <Text c="dimmed">Sign in to view projections and draft.</Text>
            <AuthPanel />
          </Stack>
        </Container>
      </>
    );
  }

  return <Outlet />;
}
