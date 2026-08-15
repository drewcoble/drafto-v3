import { useState } from "react";
import { useAction } from "convex/react";
import {
  Alert,
  Button,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import { getErrorMessage } from "../../lib/errors";

interface DataPanelProps {
  week: string;
}

type ActionKey = "projections" | "news" | "playerPoints" | "caches";

interface ActionState {
  isRunning: boolean;
  status: { kind: "success" | "error"; message: string } | null;
}

const IDLE_STATE: ActionState = { isRunning: false, status: null };

export function DataPanel({ week }: DataPanelProps) {
  const fetchProjections = useAction(api.sleeper.projections.fetchProjections);
  const fetchNews = useAction(api.fantasyPros.news.fetchNews);
  const fetchPlayerPoints = useAction(
    api.sleeper.playerPoints.fetchAllPlayerPoints,
  );
  const refreshCaches = useAction(api.fetchAllData.refreshCaches);

  // Defaults to the current season server-side (see fetchAllPlayerPoints)
  // when left blank - only needs to be filled in to backfill a past season
  // (e.g. to populate the new per-week stats field for the player detail
  // modal's game log on seasons already in the database).
  const [playerPointsYear, setPlayerPointsYear] = useState("");

  const [states, setStates] = useState<Record<ActionKey, ActionState>>({
    projections: IDLE_STATE,
    news: IDLE_STATE,
    playerPoints: IDLE_STATE,
    caches: IDLE_STATE,
  });

  const actions: Array<{
    key: ActionKey;
    label: string;
    description: string;
    run: () => Promise<unknown>;
    successMessage: string;
  }> = [
    {
      key: "projections",
      label: "Fetch projections",
      description: "Players, projections, ADP/rankings, and injuries.",
      run: () => fetchProjections({ week }),
      successMessage: `Projections refreshed for week "${week}".`,
    },
    {
      key: "news",
      label: "Fetch news",
      description: "Latest player news.",
      run: () => fetchNews({}),
      successMessage: "News refreshed.",
    },
    {
      key: "playerPoints",
      label: "Fetch player points",
      description: "Actual scored fantasy points, per week.",
      run: () =>
        fetchPlayerPoints(
          playerPointsYear.trim() ? { year: playerPointsYear.trim() } : {},
        ),
      successMessage: `Player points refreshed${
        playerPointsYear.trim() ? ` for ${playerPointsYear.trim()}` : ""
      }.`,
    },
    {
      key: "caches",
      label: "Refresh value caches",
      description: "Recomputes value-gap and $-value caches.",
      run: () => refreshCaches({ week }),
      successMessage: "Value caches refreshed.",
    },
  ];

  const runAction = async (action: (typeof actions)[number]) => {
    setStates((prev) => ({
      ...prev,
      [action.key]: { isRunning: true, status: null },
    }));

    try {
      await action.run();
      setStates((prev) => ({
        ...prev,
        [action.key]: {
          isRunning: false,
          status: { kind: "success", message: action.successMessage },
        },
      }));
    } catch (error) {
      const message = getErrorMessage(error, "Something went wrong.");
      setStates((prev) => ({
        ...prev,
        [action.key]: { isRunning: false, status: { kind: "error", message } },
      }));
    }
  };

  return (
    <Stack gap="md" py="sm">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {actions.map((action) => {
          const state = states[action.key];
          return (
            <Card key={action.key} withBorder padding="md">
              <Stack gap="sm" justify="space-between" h="100%">
                <Stack gap={4}>
                  <Text fw={500}>{action.label}</Text>
                  <Text size="sm" c="dimmed">
                    {action.description}
                  </Text>
                </Stack>
                <Stack gap="xs">
                  {action.key === "playerPoints" && (
                    <TextInput
                      placeholder="Year (optional)"
                      value={playerPointsYear}
                      onChange={(event) =>
                        setPlayerPointsYear(event.currentTarget.value)
                      }
                    />
                  )}
                  <Group justify="space-between" align="center">
                    <Button
                      onClick={() => runAction(action)}
                      loading={state.isRunning}
                    >
                      {action.label}
                    </Button>
                  </Group>
                  {state.status && (
                    <Alert
                      color={state.status.kind === "success" ? "green" : "red"}
                      variant="light"
                    >
                      {state.status.message}
                    </Alert>
                  )}
                </Stack>
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>
    </Stack>
  );
}
