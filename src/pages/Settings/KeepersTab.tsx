import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Card, Center, Loader, SimpleGrid, Stack, Text } from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { POSITIONS, type Position } from "../../types";
import { filterRelevantPlayers, pointsForScoring } from "../../lib/relevantPlayers";
import { assignSlotForPick } from "../../lib/slotAssignment";
import { expandRosterSlots } from "../../lib/rosterSlots";
import { WEEK } from "../../constants/general";
import { PlayerDetailModal } from "../../components/PlayerDetailModal";
import { GenericValuesNotice } from "../../components/GenericValuesNotice";
import { KeeperTable } from "./components/KeeperTable";
import { KeeperCardList } from "./components/KeeperCardList";
import { KeeperSearchForm } from "./components/KeeperSearchForm";
import { KeeperRulesPanel } from "./components/KeeperRulesPanel";
import { getErrorMessage } from "../../lib/errors";

interface KeepersTabProps {
  seasonId: Id<"seasons">;
}

export function KeepersTab({ seasonId }: KeepersTabProps) {
  const settingsList = useQuery(api.leagues.listSeasons, {});
  const settings = settingsList?.find((league) => league._id === seasonId);
  const draftTeams = useQuery(api.draft.teams.listSeasonTeams, {
    seasonId,
  });
  const allProjections = useQuery(api.projections.getAllProjections, {
    week: WEEK,
  });
  const allRankings = useQuery(api.rankings.getAllRankings, { week: WEEK });
  const draftValuesResult = useQuery(
    api.draftValues.getDraftValues,
    settings
      ? { seasonId, week: WEEK, scoring: settings.scoring }
      : "skip",
  );
  const draftValues = draftValuesResult?.values;
  const usingGenericValues = draftValuesResult?.isGeneric ?? false;
  const picks = useQuery(api.draft.picks.listDraftPicks, { seasonId });
  const priceHistory = useQuery(api.draft.history.getPlayerPriceHistory, {
    seasonId,
  });
  const addKeeper = useMutation(api.draft.picks.addKeeper);
  const removeKeeper = useMutation(api.draft.picks.removeKeeper);
  const setKeeperStreak = useMutation(api.draft.picks.setKeeperStreak);
  const setPickSlot = useMutation(api.draft.picks.setPickSlot);

  const [keeperSearch, setKeeperSearch] = useState("");
  const [keeperTeamId, setKeeperTeamId] = useState<Id<"seasonTeams"> | null>(
    null,
  );
  const [keeperPrice, setKeeperPrice] = useState<number>(1);
  const [keeperError, setKeeperError] = useState<string | null>(null);
  const [selectedFpid, setSelectedFpid] = useState<number | null>(null);

  // Default the keeper team picker to the self team once teams exist,
  // mirroring DraftTab's nominatingTeamId default.
  useEffect(() => {
    if (keeperTeamId || !draftTeams) return;
    const selfTeam = draftTeams.find((team) => team.isSelf);
    if (selfTeam) setKeeperTeamId(selfTeam._id);
  }, [draftTeams, keeperTeamId]);

  const activePositions = useMemo(() => {
    if (!settings) return [];
    return POSITIONS.filter(
      (pos) =>
        settings.rosterSlots[pos] > 0 ||
        settings.flexPositions.includes(pos) ||
        settings.superflexPositions.includes(pos),
    );
  }, [settings]);

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

  const nameByFpid = useMemo(() => {
    const map = new Map<number, { name: string; team: string | null }>();
    for (const row of allProjections ?? []) {
      map.set(row.fpid, row);
    }
    return map;
  }, [allProjections]);

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of draftTeams ?? []) {
      map.set(team._id, team.name);
    }
    return map;
  }, [draftTeams]);

  const keeperSearchResults = useMemo(() => {
    if (!allProjections || !settings || keeperSearch.trim().length < 2) {
      return [];
    }
    const relevant = filterRelevantPlayers(
      allProjections,
      activePositions,
      settings.scoring,
      adpByFpid,
      (row) => pointsForScoring(row, settings.scoring),
    );
    const query = keeperSearch.trim().toLowerCase();
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
    keeperSearch,
    activePositions,
    adpByFpid,
    draftedFpids,
    draftValueByFpid,
  ]);

  const keepers = useMemo(
    () => (picks ?? []).filter((pick) => pick.isKeeper),
    [picks],
  );

  const atTeamKeeperCap = useMemo(() => {
    const maxKeepersPerTeam = settings?.keeperRules?.maxKeepersPerTeam;
    if (maxKeepersPerTeam === undefined || !keeperTeamId) return false;
    const teamKeeperCount = keepers.filter(
      (pick) => pick.teamId === keeperTeamId,
    ).length;
    return teamKeeperCount >= maxKeepersPerTeam;
  }, [settings, keeperTeamId, keepers]);

  const slots = useMemo(
    () => (settings ? expandRosterSlots(settings.rosterSlots) : []),
    [settings],
  );

  const handleAddKeeper = async (
    fpid: number,
    position: Position,
    price: number,
  ) => {
    if (!settings || !keeperTeamId) return;
    setKeeperError(null);
    try {
      const team = draftTeams?.find((t) => t._id === keeperTeamId);
      let planSlotKey: string | undefined;
      if (team?.isSelf) {
        const selfKeeperSlotKeys = new Set(
          keepers
            .filter((pick) => pick.teamId === keeperTeamId)
            .map((pick) => pick.planSlotKey)
            .filter((key): key is string => !!key),
        );
        planSlotKey = assignSlotForPick(
          position,
          settings.rosterSlots,
          selfKeeperSlotKeys,
          settings.flexPositions,
          settings.superflexPositions,
        );
      }
      await addKeeper({
        seasonId,
        teamId: keeperTeamId,
        fpid,
        price,
        ...(planSlotKey ? { planSlotKey } : {}),
      });
      setKeeperSearch("");
    } catch (err) {
      setKeeperError(
        getErrorMessage(err, "Failed to add keeper."),
      );
    }
  };

  const handleRemoveKeeper = async (pickId: Id<"draftPicks">) => {
    setKeeperError(null);
    try {
      await removeKeeper({ pickId });
    } catch (err) {
      setKeeperError(
        getErrorMessage(err, "Failed to remove keeper."),
      );
    }
  };

  const handleSetStreak = async (pickId: Id<"draftPicks">, streak: number) => {
    setKeeperError(null);
    try {
      await setKeeperStreak({ pickId, streak });
    } catch (err) {
      setKeeperError(
        getErrorMessage(err, "Failed to update keeper streak."),
      );
    }
  };

  const handleMoveKeeper = async (pickId: Id<"draftPicks">, slotKey: string) => {
    setKeeperError(null);
    try {
      await setPickSlot({ pickId, slotKey });
    } catch (err) {
      setKeeperError(
        getErrorMessage(err, "Failed to move keeper."),
      );
    }
  };

  if (settingsList === undefined || draftTeams === undefined) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  if (!settings) {
    return <Text c="dimmed">No league settings configured yet.</Text>;
  }

  if (draftTeams.length === 0) {
    return (
      <Text c="dimmed">
        Set up your draft teams on the League Details tab before assigning
        keepers.
      </Text>
    );
  }

  return (
    <Stack gap="md" py="sm">
      <Text size="sm" c="dimmed">
        Assign players to teams before the draft starts. Kept players are
        pre-loaded onto their team's roster and won't appear in the
        nomination pool or Players Left board.
      </Text>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Stack gap="md">
          <Text size="md" fw={500}>
            Current Keepers
          </Text>
          {keepers.length === 0 ? (
            <Text size="sm" c="dimmed">
              No keepers assigned yet.
            </Text>
          ) : (
            <>
              {/* Desktop table gets its own single-level border - the mobile
                  card list below already boxes each keeper individually
                  (KeeperCardList), so it isn't also wrapped in a Card here
                  (that would nest a Card inside a Card). */}
              <Card withBorder padding="md" visibleFrom="sm">
                <KeeperTable
                  keepers={keepers}
                  nameByFpid={nameByFpid}
                  teamNameById={teamNameById}
                  slots={slots}
                  flexPositions={settings.flexPositions}
                  superflexPositions={settings.superflexPositions}
                  onRemove={handleRemoveKeeper}
                  onSetStreak={handleSetStreak}
                  onMove={handleMoveKeeper}
                  onSelectPlayer={setSelectedFpid}
                  showStreakInput={settings.keeperRules?.trackConsecutiveYears ?? true}
                />
              </Card>
              <KeeperCardList
                keepers={keepers}
                nameByFpid={nameByFpid}
                teamNameById={teamNameById}
                slots={slots}
                flexPositions={settings.flexPositions}
                superflexPositions={settings.superflexPositions}
                onRemove={handleRemoveKeeper}
                onSetStreak={handleSetStreak}
                onMove={handleMoveKeeper}
                onSelectPlayer={setSelectedFpid}
                showStreakInput={settings.keeperRules?.trackConsecutiveYears ?? true}
              />
            </>
          )}
        </Stack>

        <Stack gap="md">
          <Text size="md" fw={500}>
            Add a Keeper
          </Text>
          {usingGenericValues && <GenericValuesNotice />}
          {/* No outer Card here - KeeperSearchForm already boxes the
              selected-candidate summary in its own Card once a player is
              picked, so wrapping this whole section would nest one Card
              inside another. */}
          <KeeperSearchForm
            keeperSearch={keeperSearch}
            onKeeperSearchChange={setKeeperSearch}
            draftTeams={draftTeams}
            keeperTeamId={keeperTeamId}
            onKeeperTeamIdChange={setKeeperTeamId}
            keeperPrice={keeperPrice}
            onKeeperPriceChange={setKeeperPrice}
            keeperError={keeperError}
            keeperSearchResults={keeperSearchResults}
            draftValueByFpid={draftValueByFpid}
            priceHistory={priceHistory}
            keeperRules={settings.keeperRules}
            atTeamKeeperCap={atTeamKeeperCap}
            onAddKeeper={handleAddKeeper}
            onSelectPlayer={setSelectedFpid}
          />
        </Stack>
      </SimpleGrid>

      {/* No outer Card - KeeperRulesPanel already organizes itself into its
          own Cards (default formula, limits, per tier), so wrapping it here
          would nest a Card inside a Card. */}
      <KeeperRulesPanel settings={settings} />

      <PlayerDetailModal
        fpid={selectedFpid}
        onClose={() => setSelectedFpid(null)}
        week={WEEK}
        scoring={settings.scoring}
        season={settings.year}
        seasonId={seasonId}
      />
    </Stack>
  );
}
