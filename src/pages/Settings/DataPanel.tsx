import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { Alert, Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { api } from "../../../convex/_generated/api";

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
  const currentUser = useQuery(api.users.getCurrentUser);
  const canFetchData = currentUser?.role === "super-admin";

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
      description:
        "Players + season/weekly projections, ADP/rankings, and injury statuses for QB, RB, WR, TE, DST, and K, from Sleeper.",
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
      description:
        "Actual (not projected) fantasy points + per-week stat breakdown " +
        "scored, from Sleeper. Defaults to the current season - set a " +
        "year below to backfill a past season instead.",
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
      description:
        "Recomputes the value-gap and $-value caches every Draft Room screen " +
        "reads from - no external calls, just recomputes from whatever " +
        "projections/rankings/player-stats data is already in the database. " +
        "Use this if those caches are empty or stale (e.g. the daily fetch " +
        "hasn't run yet) - an empty cache forces every draft screen onto a " +
        "much more expensive live recompute.",
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
        Pull fresh data from Sleeper (players/projections/rankings/injuries/
        player points) and FantasyPros (news only, requires
        FANTASYPROS_API_KEY in the Convex environment). Each button only
        fetches its own data, so you don't need to refresh everything just to
        pull one update.
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
              <Group gap="xs" wrap="nowrap">
                {action.key === "playerPoints" && (
                  <TextInput
                    placeholder="Year (optional)"
                    value={playerPointsYear}
                    onChange={(event) =>
                      setPlayerPointsYear(event.currentTarget.value)
                    }
                    w={130}
                  />
                )}
                <Button
                  onClick={() => runAction(action)}
                  loading={state.isRunning}
                  disabled={!canFetchData}
                >
                  {action.label}
                </Button>
              </Group>
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
