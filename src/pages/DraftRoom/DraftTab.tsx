import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Group, Select, Stack, Text } from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  filterRelevantPlayers,
  pointsForScoring,
} from "../../lib/relevantPlayers";
import { useTeamBudget } from "../../hooks/useTeamBudget";
import { usePlanSlots } from "../../hooks/usePlanSlots";
import { matchPlanSlot } from "../../lib/planRecommendation";
import { assignSlotForPick } from "../../lib/slotAssignment";
import { WEEK } from "../../constants/general";
import { PlayerDetailModal } from "../../components/PlayerDetailModal";
import { NominationCard } from "./components/NominationCard";
import { NominateSearchCard } from "./components/NominateSearchCard";
import { RecentPicksTable } from "./components/RecentPicksTable";

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
  const [selectedFpid, setSelectedFpid] = useState<number | null>(null);

  const settingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const settings = settingsList?.find((s) => s._id === draftSettingsId);
  const thisSeason = settings?.season ?? String(new Date().getFullYear());
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
  const currentNominator = useQuery(
    api.draft.nominationOrder.getCurrentNominator,
    settings?.nominationOrder ? { draftSettingsId } : "skip",
  );
  const planSlots = usePlanSlots(draftSettingsId, selfTeamId);

  const nominate = useMutation(api.draft.picks.nominate);
  const bumpNominationBid = useMutation(api.draft.picks.bumpNominationBid);
  const resolvePick = useMutation(api.draft.picks.resolvePick);
  const passNomination = useMutation(api.draft.picks.passNomination);
  const removePick = useMutation(api.draft.picks.removePick);
  const setCurrentNominator = useMutation(
    api.draft.nominationOrder.setCurrentNominator,
  );

  // Keeps the nominate form's team picker following the suggested rotation
  // (see convex/draft/nominationOrder.ts) as it advances each turn - still
  // just a default, the Select below stays freely overridable for any one
  // nomination.
  useEffect(() => {
    if (currentNominator?.currentTeamId) {
      setNominatingTeamId(currentNominator.currentTeamId);
    }
  }, [currentNominator?.currentTeamId]);

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

  const nominatedValue = activeNomination
    ? draftValueByFpid.get(activeNomination.fpid)
    : undefined;

  const stats = useTeamBudget(
    draftSettingsId,
    selfTeamId,
    activeNomination?.position,
    nominatedValue?.dollarValue,
  );

  // Which of the team's still-open budget-plan slots the current nomination's
  // market value best matches - the same value-based matching PlayersLeftTab
  // uses, so "Plan-safe max" and this figure never disagree.
  const planMatch = useMemo(() => {
    if (!activeNomination || !planSlots) return undefined;
    return matchPlanSlot(
      activeNomination.position,
      nominatedValue?.dollarValue ?? 0,
      planSlots.openSlots,
      planSlots.amounts,
      planSlots.flexPositions,
      planSlots.superflexPositions,
    );
  }, [activeNomination, planSlots, nominatedValue]);

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
          !draftedFpids.has(row.fpid) && row.name.toLowerCase().includes(query),
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
    () =>
      [...(picks ?? [])].sort((a, b) => b.sequence - a.sequence).slice(0, 8),
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

  return (
    <Stack gap="md" py="sm">
      {activeNomination ? (
        <NominationCard
          activeNomination={activeNomination}
          nominatedPlayer={nominatedPlayer}
          nominatedValue={nominatedValue}
          stats={stats}
          planMatch={planMatch}
          teams={teams}
          winnerTeamId={winnerTeamId}
          onWinnerTeamIdChange={setWinnerTeamId}
          actionError={actionError}
          onBumpBid={(delta) =>
            runAction(() => bumpNominationBid({ draftSettingsId, delta }))
          }
          onLogWin={() =>
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
          onLogWinner={() =>
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
          onPass={() => runAction(() => passNomination({ draftSettingsId }))}
          onSelectPlayer={setSelectedFpid}
        />
      ) : (
        <>
          {settings?.nominationOrder && (
            <Group gap="xs" wrap="wrap" align="center">
              <Text size="sm" fw={500}>
                {currentNominator?.currentTeamId
                  ? `${
                      teams.find(
                        (team) => team._id === currentNominator.currentTeamId,
                      )?.name ?? "Unknown team"
                    }'s turn to nominate`
                  : "No assigned nominator - pick manually"}
              </Text>
              <Select
                size="xs"
                placeholder="Set turn..."
                data={[
                  { value: "__manual__", label: "— Manual —" },
                  ...teams.map((team) => ({
                    value: team._id,
                    label: team.name,
                  })),
                ]}
                value={currentNominator?.currentTeamId ?? "__manual__"}
                onChange={(value) =>
                  runAction(() =>
                    setCurrentNominator({
                      draftSettingsId,
                      teamId:
                        !value || value === "__manual__"
                          ? null
                          : (value as Id<"draftTeams">),
                    }),
                  )
                }
                w={160}
                allowDeselect={false}
              />
            </Group>
          )}
          <NominateSearchCard
            search={search}
            onSearchChange={setSearch}
            teams={teams}
            nominatingTeamId={nominatingTeamId}
            onNominatingTeamIdChange={setNominatingTeamId}
            actionError={actionError}
            searchResults={searchResults}
            draftValueByFpid={draftValueByFpid}
            onNominate={(fpid) => {
              runAction(() =>
                nominate({
                  draftSettingsId,
                  fpid,
                  nominatingTeamId,
                  openingBid: 1,
                }),
              );
              setSearch("");
            }}
            onSelectPlayer={() => {
              setSelectedFpid;
            }}
          />
        </>
      )}

      {stats && (
        <Text size="sm" c="dimmed">
          {stats.openSlots} open slot{stats.openSlots === 1 ? "" : "s"} · $
          {stats.remaining} remaining
        </Text>
      )}

      <RecentPicksTable
        picks={recentPicks}
        nameByFpid={nameByFpid}
        teamNameById={teamNameById}
        onRemove={(pickId) => runAction(() => removePick({ pickId }))}
        onSelectPlayer={setSelectedFpid}
      />

      <PlayerDetailModal
        fpid={selectedFpid}
        onClose={() => setSelectedFpid(null)}
        week={WEEK}
        scoring={settings?.scoring ?? "PPR"}
        season={thisSeason}
        draftSettingsId={draftSettingsId}
      />
    </Stack>
  );
}
