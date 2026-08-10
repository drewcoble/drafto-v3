import { useQuery } from "convex/react";
import {
  ActionIcon,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { AppHeader } from "../../components/AppHeader";
import { MOBILE_HEADER_HEIGHT, WEEK } from "../../constants/general";
import { DataPanel } from "../Settings/DataPanel";

// Super-admin-only data-fetch tool, formerly a per-league Setup tab (see
// NavTabs.tsx's TABS) - DataPanel itself is entirely league-independent (its
// actions loop over every league in the database), so it lives here as its
// own page rather than nested under a specific league's /setup/$leagueId
// route.
export function AdminDataPanel() {
  const currentUser = useQuery(api.users.getCurrentUser);

  if (currentUser === undefined) {
    return (
      <>
        <AppHeader />
        <Center pt={{ base: MOBILE_HEADER_HEIGHT + 16, sm: "xl" }} pb="xl">
          <Loader />
        </Center>
      </>
    );
  }

  if (currentUser?.role !== "super-admin") {
    return (
      <>
        <AppHeader />
        <Stack
          gap="md"
          pt={{ base: MOBILE_HEADER_HEIGHT + 16, sm: "xl" }}
          pb="xl"
          align="center"
        >
          <Text c="dimmed">You don't have access to this page.</Text>
          <Button component={Link} to="/" variant="default">
            Back to dashboard
          </Button>
        </Stack>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <Container
        size="md"
        pt={{ base: MOBILE_HEADER_HEIGHT + 16, sm: "xl" }}
        pb="xl"
      >
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
            <Title order={2}>Admin: Data</Title>
          </Group>

          <DataPanel week={WEEK} />
        </Stack>
      </Container>
    </>
  );
}
