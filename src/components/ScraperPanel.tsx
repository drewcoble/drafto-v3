import { useState } from "react";
import { useAction } from "convex/react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { api } from "../../convex/_generated/api";

interface ScraperPanelProps {
  week: string;
}

export function ScraperPanel({ week }: ScraperPanelProps) {
  const runScrape = useAction(api.scrape.scrapeAllPositions);
  const [isRunning, setIsRunning] = useState(false);
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
      </Text>
      <Group>
        <Button onClick={handleRun} loading={isRunning}>
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
