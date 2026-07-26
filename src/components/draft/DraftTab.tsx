import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { filterRelevantPlayers, pointsForScoring } from "../../lib/relevantPlayers";
import { useTeamBudget } from "../../hooks/useTeamBudget";
import { assignSlotForPick } from "../../lib/slotAssignment";

const WEEK = "draft";

interface DraftTabProps {
  draftSettingsId: Id<"draftSettings">;
  teams: Doc<"draftTeams">[];
  selfTeamId: Id<"draftTeams">;
}

export function DraftTab({
  draftSettingsId,
  teams,
  selfTeamId,
}: DraftTabProps) {
  const [search, setSearch] = useState("");
  const [nominatingTeamId, setNominatingTeamId] =
    useState<Id<"draftTeams">>(selfTeamId);
  const [winnerTeamId, setWinnerTeamId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const settingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const settings = settingsList?.find((s) => s._id === draftSettingsId);
  const allProjections = useQuery(api.projections.getAllProjections, {
    week: WEEK,
  });
  const allRankings = useQuery(api.rankings.getAllRankings, { week: WEEK });
  const draftValues = useQuery(
    api.draftValues.getDraftValues,
    settings
      ? { draftSettingsId, week: WEEK, scoring: settings.scoring }
      : "skip",
  );
  const picks = useQuery(api.draft.picks.listDraftPicks, { draftSettingsId });
  const activeNomination = useQuery(api.draft.picks.getActiveNomination, {
    draftSettingsId,
  });
  const stats = useTeamBudget(
    draftSettingsId,
    selfTeamId,
    activeNomination?.position,
  );

  const nominate = useMutation(api.draft.picks.nominate);
  const bumpNominationBid = useMutation(api.draft.picks.bumpNominationBid);
  const resolvePick = useMutation(api.draft.picks.resolvePick);
  const passNomination = useMutation(api.draft.picks.passNomination);

  const adpByFpid = useMemo(() => {
    const map = new Map<
      number,
      { adpStd: number; adpHalf: number; adpPpr: number }
    >();
    for (const ranking of allRankings ?? []) {
      map.set(ranking.fpid, ranking);
    }
    return map;
  }, [allRankings]);

  const draftValueByFpid = useMemo(() => {
    const map = new Map<number, { dollarValue: number }>();
    for (const value of draftValues ?? []) {
      map.set(value.fpid, value);
    }
    return map;
  }, [draftValues]);

  const draftedFpids = useMemo(
    () => new Set((picks ?? []).map((pick) => pick.fpid)),
    [picks],
  );

  const activePositions = useMemo(() => {
    if (!settings) return [];
    return (["QB", "RB", "WR", "TE", "DST", "K"] as const).filter(
      (pos) =>
        settings.rosterSlots[pos] > 0 ||
        settings.flexPositions.includes(pos) ||
        settings.superflexPositions.includes(pos),
    );
  }, [settings]);

  const searchResults = useMemo(() => {
    if (!allProjections || !settings || search.trim().length < 2) return [];
    const relevant = filterRelevantPlayers(
      allProjections,
      activePositions,
      settings.scoring,
      adpByFpid,
      (row) => pointsForScoring(row, settings.scoring),
    );
    const query = search.trim().toLowerCase();
    return relevant
      .filter(
        (row) =>
          !draftedFpids.has(row.fpid) &&
          row.name.toLowerCase().includes(query),
      )
      .sort(
        (a, b) =>
          (draftValueByFpid.get(b.fpid)?.dollarValue ?? 0) -
          (draftValueByFpid.get(a.fpid)?.dollarValue ?? 0),
      )
      .slice(0, 8);
  }, [
    allProjections,
    settings,
    search,
    activePositions,
    adpByFpid,
    draftedFpids,
    draftValueByFpid,
  ]);

  const nameByFpid = useMemo(() => {
    const map = new Map<number, { name: string; team: string | null }>();
    for (const row of allProjections ?? []) {
      map.set(row.fpid, row);
    }
    return map;
  }, [allProjections]);

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teams) {
      map.set(team._id, team.name);
    }
    return map;
  }, [teams]);

  const recentPicks = useMemo(
    () => [...(picks ?? [])].sort((a, b) => b.sequence - a.sequence).slice(0, 8),
    [picks],
  );

  const selfFilledSlotKeys = useMemo(
    () =>
      new Set(
        (picks ?? [])
          .filter((pick) => pick.teamId === selfTeamId)
          .map((pick) => pick.planSlotKey)
          .filter((key): key is string => !!key),
      ),
    [picks, selfTeamId],
  );

  const runAction = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "That action failed.",
      );
    }
  };

  const nominatedPlayer = activeNomination
    ? nameByFpid.get(activeNomination.fpid)
    : undefined;
  const nominatedValue = activeNomination
    ? draftValueByFpid.get(activeNomination.fpid)
    : undefined;

  return (
    <Stack gap="md" py="sm">
      {activeNomination ? (
        <Card withBorder padding="md">
          <Stack gap="sm">
            <Group justify="space-between" align="flex-start">
              <Stack gap={2}>
                <Text fw={700} size="lg">
                  {nominatedPlayer?.name ?? `Player #${activeNomination.fpid}`}
                </Text>
                <Group gap="xs">
                  <Badge variant="light">{activeNomination.position}</Badge>
                  {nominatedPlayer?.team && (
                    <Text size="sm" c="dimmed">
                      {nominatedPlayer.team}
                    </Text>
                  )}
                  {nominatedValue && (
                    <Text size="sm" c="dimmed">
                      Fair ~${Math.round(nominatedValue.dollarValue)}
                    </Text>
                  )}
                  {stats?.planSafe !== null && stats?.planSafe !== undefined && (
                    <Text size="sm" c="dimmed">
                      Plan-safe max ${Math.max(stats.planSafe, 0)}
                    </Text>
                  )}
                </Group>
              </Stack>
              <Group gap="xs" align="center">
                <ActionIcon
                  variant="default"
                  onClick={() =>
                    runAction(() =>
                      bumpNominationBid({ draftSettingsId, delta: -1 }),
                    )
                  }
                >
                  −
                </ActionIcon>
                <Text size="xl" fw={700}>
                  ${activeNomination.currentBid}
                </Text>
                <ActionIcon
                  variant="default"
                  onClick={() =>
                    runAction(() =>
                      bumpNominationBid({ draftSettingsId, delta: 1 }),
                    )
                  }
                >
                  +
                </ActionIcon>
              </Group>
            </Group>
            {actionError && (
              <Text c="red" size="sm">
                {actionError}
              </Text>
            )}
            <Group>
              <Button
                onClick={() =>
                  runAction(() => {
                    const planSlotKey = settings
                      ? assignSlotForPick(
                          activeNomination.position,
                          settings.rosterSlots,
                          selfFilledSlotKeys,
                          settings.flexPositions,
                          settings.superflexPositions,
                        )
                      : undefined;
                    return resolvePick({
                      draftSettingsId,
                      fpid: activeNomination.fpid,
                      teamId: selfTeamId,
                      price: activeNomination.currentBid,
                      ...(planSlotKey ? { planSlotKey } : {}),
                    });
                  })
                }
              >
                I won — log at ${activeNomination.currentBid}
              </Button>
              <Select
                placeholder="Someone else won..."
                data={teams
                  .filter((team) => !team.isSelf)
                  .map((team) => ({ value: team._id, label: team.name }))}
                value={winnerTeamId}
                onChange={setWinnerTeamId}
                w={200}
              />
              <Button
                variant="default"
                disabled={!winnerTeamId}
                onClick={() =>
                  runAction(async () => {
                    if (!winnerTeamId) return;
                    await resolvePick({
                      draftSettingsId,
                      fpid: activeNomination.fpid,
                      teamId: winnerTeamId as Id<"draftTeams">,
                      price: activeNomination.currentBid,
                    });
                    setWinnerTeamId(null);
                  })
                }
              >
                Log winner
              </Button>
              <Button
                variant="subtle"
                color="gray"
                onClick={() =>
                  runAction(() => passNomination({ draftSettingsId }))
                }
              >
                Pass
              </Button>
            </Group>
          </Stack>
        </Card>
      ) : (
        <Card withBorder padding="md">
          <Stack gap="sm">
            <Group align="flex-end">
              <TextInput
                label="Search a player to put on the block..."
                placeholder="e.g. CeeDee Lamb"
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                flex={1}
              />
              <Select
                label="Nominating"
                data={teams.map((team) => ({
                  value: team._id,
                  label: team.name,
                }))}
                value={nominatingTeamId}
                onChange={(value) =>
                  value && setNominatingTeamId(value as Id<"draftTeams">)
                }
                w={180}
              />
            </Group>
            {actionError && (
              <Text c="red" size="sm">
                {actionError}
              </Text>
            )}
            {searchResults.length > 0 && (
              <Table>
                <Table.Tbody>
                  {searchResults.map((row) => (
                    <Table.Tr key={row.fpid}>
                      <Table.Td>{row.name}</Table.Td>
                      <Table.Td>
                        <Badge variant="light">{row.position}</Badge>
                      </Table.Td>
                      <Table.Td>{row.team ?? "—"}</Table.Td>
                      <Table.Td>
                        {draftValueByFpid.get(row.fpid)
                          ? `$${Math.round(draftValueByFpid.get(row.fpid)!.dollarValue)}`
                          : "—"}
                      </Table.Td>
                      <Table.Td>
                        <Button
                          size="compact-sm"
                          onClick={() =>
                            runAction(() =>
                              nominate({
                                draftSettingsId,
                                fpid: row.fpid,
                                nominatingTeamId,
                                openingBid: 1,
                              }),
                            )
                          }
                        >
                          Nominate
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        </Card>
      )}

      {stats && (
        <Text size="sm" c="dimmed">
          {stats.openSlots} open slot{stats.openSlots === 1 ? "" : "s"} ·
          ${stats.remaining} remaining
        </Text>
      )}

      <Stack gap={6}>
        <Text size="sm" fw={500}>
          Recent picks
        </Text>
        {recentPicks.length === 0 ? (
          <Text size="sm" c="dimmed">
            No picks yet.
          </Text>
        ) : (
          <Table>
            <Table.Tbody>
              {recentPicks.map((pick) => (
                <Table.Tr key={pick._id}>
                  <Table.Td>
                    {nameByFpid.get(pick.fpid)?.name ?? `#${pick.fpid}`}
                  </Table.Td>
                  <Table.Td>${pick.price}</Table.Td>
                  <Table.Td>{teamNameById.get(pick.teamId) ?? "—"}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Stack>
  );
}
