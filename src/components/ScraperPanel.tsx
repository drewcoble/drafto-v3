import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Alert,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { api } from "../../convex/_generated/api";

interface ScraperPanelProps {
  week: string;
}

export function ScraperPanel({ week }: ScraperPanelProps) {
  const runScrape = useAction(api.scrape.scrapeAllPositions);
  const saveConnection = useMutation(api.users.saveFantasyProsConnection);
  const currentUser = useQuery(api.users.getCurrentUser);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionCookie, setSessionCookie] = useState("");
  const canAccessScraper = currentUser?.role === "super-admin";
  const [status, setStatus] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const handleRun = async () => {
    setIsRunning(true);
    setStatus(null);

    try {
      await runScrape({ week });
      setStatus({
        kind: "success",
        message: `Fresh projections were loaded for all positions for week "${week}".`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to refresh projections right now.";
      setStatus({ kind: "error", message });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Stack gap="md" py="sm">
      <Text c="dimmed">
        Pull fresh projection data for QB, RB, WR, TE, and DST from FantasyPros.
        Store your FantasyPros session cookie here and the signed-in account will reuse it for future scrapes.
      </Text>
      {!canAccessScraper && (
        <Alert color="yellow" variant="light">
          Running the scraper requires super-admin access. Update your role in the Convex dashboard.
        </Alert>
      )}
      {currentUser && (
        <Text size="sm" c="dimmed">
          Connected: {currentUser.fantasyProsEnabled ? "Yes" : "Not yet"}
        </Text>
      )}
      <TextInput
        label="FantasyPros session cookie"
        placeholder="Paste the session cookie value from your FantasyPros browser session"
        value={sessionCookie}
        onChange={(event) => setSessionCookie(event.currentTarget.value)}
      />
      <Group>
        <Button
          onClick={async () => {
            try {
              await saveConnection({
                sessionCookie,
                ...(currentUser?.email ? { username: currentUser.email } : {}),
              })
              setStatus({ kind: "success", message: "FantasyPros connection saved for this account." })
            } catch (error) {
              const message = error instanceof Error ? error.message : "Unable to save the connection.";
              setStatus({ kind: "error", message })
            }
          }}
        >
          Save FantasyPros connection
        </Button>
        <Button onClick={handleRun} loading={isRunning} disabled={!canAccessScraper}>
          Run scraper
        </Button>
      </Group>
      {status && (
        <Alert
          color={status.kind === "success" ? "green" : "red"}
          variant="light"
        >
          {status.message}
        </Alert>
      )}
    </Stack>
  );
}
