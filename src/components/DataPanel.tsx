import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { api } from "../../convex/_generated/api";

interface DataPanelProps {
  week: string;
}

type ActionKey = "projections" | "news" | "injuries" | "playerPoints";

interface ActionState {
  isRunning: boolean;
  status: { kind: "success" | "error"; message: string } | null;
}

const IDLE_STATE: ActionState = { isRunning: false, status: null };

export function DataPanel({ week }: DataPanelProps) {
  const fetchProjections = useAction(api.sleeper.projections.fetchProjections);
  const fetchNews = useAction(api.fantasyPros.news.fetchNews);
  const fetchInjuries = useAction(api.fantasyPros.injuries.fetchInjuries);
  const fetchPlayerPoints = useAction(
    api.fantasyPros.playerPoints.fetchAllPlayerPoints,
  );
  const currentUser = useQuery(api.users.getCurrentUser);
  const canFetchData = currentUser?.role === "super-admin";

  const [states, setStates] = useState<Record<ActionKey, ActionState>>({
    projections: IDLE_STATE,
    news: IDLE_STATE,
    injuries: IDLE_STATE,
    playerPoints: IDLE_STATE,
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
      description:
        "Players + season/weekly projections and ADP/rankings for QB, RB, WR, TE, and DST, from Sleeper.",
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
      key: "injuries",
      label: "Fetch injuries",
      description: "Current league-wide injury statuses.",
      run: () => fetchInjuries({}),
      successMessage: "Injuries refreshed.",
    },
    {
      key: "playerPoints",
      label: "Fetch player points",
      description: "Actual (not projected) fantasy points scored.",
      run: () => fetchPlayerPoints({ scoring: "PPR" }),
      successMessage: "Player points refreshed.",
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
      const message =
        error instanceof Error ? error.message : "Something went wrong.";
      setStates((prev) => ({
        ...prev,
        [action.key]: { isRunning: false, status: { kind: "error", message } },
      }));
    }
  };

  return (
    <Stack gap="md" py="sm">
      <Text c="dimmed">
        Pull fresh data from Sleeper (players/projections/rankings) and
        FantasyPros (news/injuries/player points, requires FANTASYPROS_API_KEY
        in the Convex environment). Each button only fetches its own data, so
        you don't need to refresh everything just to pull one update.
      </Text>
      {!canFetchData && (
        <Alert color="yellow" variant="light">
          Fetching data requires super-admin access. Update your role in the
          Convex dashboard.
        </Alert>
      )}
      {actions.map((action) => {
        const state = states[action.key];
        return (
          <Stack key={action.key} gap={4}>
            <Group justify="space-between" align="center">
              <div>
                <Text fw={500}>{action.label}</Text>
                <Text size="sm" c="dimmed">
                  {action.description}
                </Text>
              </div>
              <Button
                onClick={() => runAction(action)}
                loading={state.isRunning}
                disabled={!canFetchData}
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
        );
      })}
    </Stack>
  );
}
