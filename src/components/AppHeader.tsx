import { useAuthActions } from "@convex-dev/auth/react";
import { Button, Group, Select, Text, Title } from "@mantine/core";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { setStoredLeagueId } from "../lib/leagueStorage";
import { ColorSchemeToggle } from "./ColorSchemeToggle";

const NEW_LEAGUE_VALUE = "new";

// Shared top bar for both the Setup and Draft Room screens - league picker
// (+ New League), the Setup/Draft Room mode switch, and sign out. Reads
// which league/section is current from the URL rather than local state.
export function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { leagueId } = useParams({ strict: false });
  const { signOut } = useAuthActions();
  const currentUser = useQuery(api.users.getCurrentUser);
  const draftSettingsList = useQuery(api.draftSettings.listDraftSettings, {});

  const inDraftRoom = location.pathname.startsWith("/draft");
  const hasRealLeague = !!leagueId && leagueId !== NEW_LEAGUE_VALUE;

  const handleLeagueChange = (value: string | null) => {
    if (!value) return;
    if (value === NEW_LEAGUE_VALUE) {
      void navigate({
        to: "/setup/$leagueId/league",
        params: { leagueId: NEW_LEAGUE_VALUE },
      });
      return;
    }
    if (currentUser) {
      setStoredLeagueId(currentUser._id, value);
    }
    void navigate({
      to: ".",
      params: (prev) => ({ ...prev, leagueId: value }),
    });
  };

  return (
    <Group justify="space-between" align="center">
      <Title order={2}>
        <Text component="span" inherit c="gold.5">
          infini
        </Text>
        draft
      </Title>
      <Group gap="sm">
        <Select
          variant="unstyled"
          placeholder="Select league"
          data={[
            ...(draftSettingsList ?? []).map((league) => ({
              value: league._id,
              label: league.name,
            })),
            { value: NEW_LEAGUE_VALUE, label: "+ New League" },
          ]}
          value={hasRealLeague ? (leagueId as Id<"draftSettings">) : null}
          onChange={handleLeagueChange}
          w={220}
          allowDeselect={false}
        />
        {inDraftRoom ? (
          <Link
            to="/setup/$leagueId/league"
            params={{ leagueId: leagueId ?? NEW_LEAGUE_VALUE }}
          >
            <Button component="span" variant="light" size="sm" color="gold">
              Back to Setup
            </Button>
          </Link>
        ) : leagueId && leagueId !== NEW_LEAGUE_VALUE ? (
          <Link to="/draft/$leagueId/draft" params={{ leagueId }}>
            <Button component="span" variant="filled" size="sm" color="gold">
              Enter Draft Room
            </Button>
          </Link>
        ) : (
          <Button variant="filled" size="sm" disabled>
            Enter Draft Room
          </Button>
        )}
        <Button variant="default" size="sm" onClick={() => signOut()}>
          Sign out
        </Button>
        <ColorSchemeToggle />
      </Group>
    </Group>
  );
}
