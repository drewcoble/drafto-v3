import { Box, Group, SimpleGrid } from "@mantine/core";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PlayerDetailModal } from "../../components/PlayerDetailModal";
import { WEEK } from "../../constants/general";
import { usePlanSlots } from "../../hooks/usePlanSlots";
import { useTeamBudget } from "../../hooks/useTeamBudget";
import { matchPlanSlot } from "../../lib/planRecommendation";
import {
  filterRelevantPlayers,
  pointsForScoring,
} from "../../lib/relevantPlayers";
import { expandRosterSlots } from "../../lib/rosterSlots";
import { assignSlotForPick } from "../../lib/slotAssignment";
import { POSITIONS } from "../../types";
import { MobileNomination } from "./components/MobileNomination";
import { MobileStatsRow } from "./components/MobileStatsRow";
import { NominationPanel } from "./components/NominationPanel";
import { StatTile } from "./components/StatTile";

interface DraftTopBarProps {
  seasonId: Id<"seasons">;
  selfTeamId: Id<"seasonTeams">;
}

// Persistent across every Draft Room tab (mounted once by the layout route),
// so the whole auction - search, nominate, watch/bump the bid, log who won -
// can be run from any tab without ever switching to a dedicated "Draft" tab.
export function DraftTopBar({ seasonId, selfTeamId }: DraftTopBarProps) {
  const [search, setSearch] = useState("");
  const [winnerTeamId, setWinnerTeamId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedFpid, setSelectedFpid] = useState<number | null>(null);

  const settingsList = useQuery(api.leagues.listSeasons, {});
  const teams = useQuery(api.draft.teams.listSeasonTeams, { seasonId });
  const picks = useQuery(api.draft.picks.listDraftPicks, { seasonId });
  const activeNomination = useQuery(api.draft.picks.getActiveNomination, {
    seasonId,
  });

  const settings = settingsList?.find((s) => s._id === seasonId);
  const thisSeason = settings?.year ?? String(new Date().getFullYear());

  const nominationConfig = useQuery(
    api.draft.nominationOrder.getNominationConfig,
    { seasonId },
  );
  const currentNominator = useQuery(
    api.draft.nominationOrder.getCurrentNominator,
    nominationConfig?.nominationOrder ? { seasonId } : "skip",
  );
  const planSlots = usePlanSlots(seasonId, selfTeamId);
  const allProjections = useQuery(api.projections.getAllProjections, {
    week: WEEK,
  });
  const allRankings = useQuery(api.rankings.getAllRankings, { week: WEEK });
  const draftValues = useQuery(
    api.draftValues.getDraftValues,
    settings
      ? { seasonId, week: WEEK, scoring: settings.scoring }
      : "skip",
  )?.values;

  const nominate = useMutation(api.draft.picks.nominate);
  const bumpNominationBid = useMutation(api.draft.picks.bumpNominationBid);
  const setNominationBid = useMutation(api.draft.picks.setNominationBid);
  const resolvePick = useMutation(api.draft.picks.resolvePick);
  const passNomination = useMutation(api.draft.picks.passNomination);
  const setCurrentNominator = useMutation(
    api.draft.nominationOrder.setCurrentNominator,
  );

  // Who gets credited on the nomination that's about to be made - mirrors
  // the turn selector's current turn exactly, including the "no one"
  // (manual) state - no fallback team, since defaulting silently to someone
  // would misattribute the nomination. When no order is configured,
  // self-nominate is the only option.
  const nominatingTeamId = nominationConfig?.nominationOrder
    ? (currentNominator?.currentTeamId ?? undefined)
    : selfTeamId;

  const nameByFpid = useMemo(() => {
    const map = new Map<number, { name: string; team: string | null }>();
    for (const row of allProjections ?? []) {
      map.set(row.fpid, row);
    }
    return map;
  }, [allProjections]);

  const draftValueByFpid = useMemo(() => {
    const map = new Map<number, { dollarValue: number }>();
    for (const value of draftValues ?? []) {
      map.set(value.fpid, value);
    }
    return map;
  }, [draftValues]);

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

  const draftedFpids = useMemo(
    () => new Set((picks ?? []).map((pick) => pick.fpid)),
    [picks],
  );

  const activePositions = useMemo(() => {
    if (!settings) return [];
    return POSITIONS.filter(
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

  const nominatedValue = activeNomination
    ? draftValueByFpid.get(activeNomination.fpid)
    : undefined;

  const nominatedPlayer = activeNomination
    ? nameByFpid.get(activeNomination.fpid)
    : undefined;

  const stats = useTeamBudget(
    seasonId,
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

  if (!settings || !teams || !picks || !stats) return null;

  const totalPicks =
    expandRosterSlots(settings.rosterSlots).length * teams.length;
  const nextPickNumber = Math.min(picks.length + 1, totalPicks);
  const turnTeam = teams.find(
    (team) => team._id === currentNominator?.currentTeamId,
  );

  // Mobile-only unification of onLogWin/onLogWinner below - the desktop
  // panel keeps its dedicated "I won" button (self team, with plan-slot
  // tracking) separate from "someone else won" (no plan-slot tracking,
  // since that's only relevant for the self team's own budget plan). The
  // mobile bar drops the separate "I won" button in favor of always
  // picking a team (self listed first) from one list, so this just
  // branches on whether that pick was the self team.
  const assignWinner = (teamId: Id<"seasonTeams">) => {
    if (!activeNomination) return;
    runAction(() => {
      if (teamId === selfTeamId) {
        const planSlotKey = assignSlotForPick(
          activeNomination.position,
          settings.rosterSlots,
          selfFilledSlotKeys,
          settings.flexPositions,
          settings.superflexPositions,
        );
        return resolvePick({
          seasonId,
          fpid: activeNomination.fpid,
          teamId,
          price: activeNomination.currentBid,
          ...(planSlotKey ? { planSlotKey } : {}),
        });
      }
      return resolvePick({
        seasonId,
        fpid: activeNomination.fpid,
        teamId,
        price: activeNomination.currentBid,
      });
    });
  };

  return (
    <Group align="flex-start" gap="sm" wrap="wrap">
      <Box visibleFrom="sm" style={{ flex: "1 1 380px" }}>
        <NominationPanel
          nextPickNumber={nextPickNumber}
          totalPicks={totalPicks}
          teams={teams}
          nominationOrderEnabled={!!nominationConfig?.nominationOrder}
          turnTeamId={currentNominator?.currentTeamId}
          turnTeamName={turnTeam?.name}
          onSetTurnTeam={(teamId) =>
            runAction(() => setCurrentNominator({ seasonId, teamId }))
          }
          activeNomination={activeNomination ?? undefined}
          nominatedPlayer={nominatedPlayer}
          nominatedValue={nominatedValue}
          planMatch={planMatch}
          winnerTeamId={winnerTeamId}
          onWinnerTeamIdChange={setWinnerTeamId}
          onBumpBid={(delta) =>
            runAction(() => bumpNominationBid({ seasonId, delta }))
          }
          onSetBid={(amount) =>
            runAction(() => setNominationBid({ seasonId, amount }))
          }
          onLogWin={() => assignWinner(selfTeamId)}
          onLogWinner={() =>
            runAction(async () => {
              if (!activeNomination || !winnerTeamId) return;
              await resolvePick({
                seasonId,
                fpid: activeNomination.fpid,
                teamId: winnerTeamId as Id<"seasonTeams">,
                price: activeNomination.currentBid,
              });
              setWinnerTeamId(null);
            })
          }
          onPass={() => runAction(() => passNomination({ seasonId }))}
          search={search}
          onSearchChange={setSearch}
          searchResults={searchResults}
          draftValueByFpid={draftValueByFpid}
          onNominate={(fpid) => {
            runAction(() =>
              nominate({
                seasonId,
                fpid,
                ...(nominatingTeamId ? { nominatingTeamId } : {}),
                openingBid: 1,
              }),
            );
            setSearch("");
          }}
          actionError={actionError}
          onSelectPlayer={setSelectedFpid}
        />
      </Box>

      <MobileNomination
        nominationOrderEnabled={!!nominationConfig?.nominationOrder}
        turnTeamId={currentNominator?.currentTeamId}
        turnTeamName={turnTeam?.name}
        onSetTurnTeam={(teamId) =>
          runAction(() => setCurrentNominator({ seasonId, teamId }))
        }
        teams={teams}
        selfTeamId={selfTeamId}
        activeNomination={activeNomination ?? undefined}
        nominatedPlayer={nominatedPlayer}
        nominatedValue={nominatedValue}
        onBumpBid={(delta) =>
          runAction(() => bumpNominationBid({ seasonId, delta }))
        }
        onSetBid={(amount) =>
          runAction(() => setNominationBid({ seasonId, amount }))
        }
        onAssignWinner={assignWinner}
        onPass={() => runAction(() => passNomination({ seasonId }))}
        search={search}
        onSearchChange={setSearch}
        searchResults={searchResults}
        draftValueByFpid={draftValueByFpid}
        onNominate={(fpid) => {
          runAction(() =>
            nominate({
              seasonId,
              fpid,
              ...(nominatingTeamId ? { nominatingTeamId } : {}),
              openingBid: 1,
            }),
          );
          setSearch("");
        }}
        onSelectPlayer={setSelectedFpid}
      />

      <Box visibleFrom="sm">
        <SimpleGrid
          cols={stats.planSafe !== null ? 5 : 4}
          spacing="sm"
          h="100%"
        >
          <StatTile label="Remaining" value={`$${stats.remaining}`} />
          <StatTile label="Max Bid" value={`$${Math.max(stats.maxBid, 0)}`} />
          {stats.planSafe !== null && (
            <StatTile
              label="Budget +/-"
              value={
                stats.planSafe > 0
                  ? `+$${stats.planSafe}`
                  : `-$${Math.abs(stats.planSafe)}`
              }
              valueColor={
                stats.planSafe > 0
                  ? "green"
                  : stats.planSafe < 0
                    ? "red"
                    : "inherit"
              }
            />
          )}
          <StatTile label="Empty Spots" value={stats.openSlots.toString()} />
          <StatTile
            label="Per Open Slot"
            value={`$${stats.perOpenSlot.toFixed(1)}`}
          />
        </SimpleGrid>
      </Box>

      <MobileStatsRow
        maxBid={stats.maxBid}
        planSafe={stats.planSafe}
        openSlots={stats.openSlots}
        perOpenSlot={stats.perOpenSlot}
      />

      <PlayerDetailModal
        fpid={selectedFpid}
        onClose={() => setSelectedFpid(null)}
        week={WEEK}
        scoring={settings.scoring}
        season={thisSeason}
        seasonId={seasonId}
      />
    </Group>
  );
}
