import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Center, Loader, Stack, Text } from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Position } from "../../types";
import { filterRelevantPlayers, pointsForScoring } from "../../lib/relevantPlayers";
import { assignSlotForPick } from "../../lib/slotAssignment";
import { WEEK } from "../../constants/general";
import { PlayerDetailModal } from "../../components/PlayerDetailModal";
import { KeeperTable } from "./components/KeeperTable";
import { KeeperSearchForm } from "./components/KeeperSearchForm";

interface KeepersTabProps {
  draftSettingsId: Id<"draftSettings">;
}

export function KeepersTab({ draftSettingsId }: KeepersTabProps) {
  const settingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const settings = settingsList?.find((league) => league._id === draftSettingsId);
  const draftTeams = useQuery(api.draft.teams.listDraftTeams, {
    draftSettingsId,
  });
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
  const priceHistory = useQuery(api.draft.history.getPlayerPriceHistory, {
    draftSettingsId,
  });
  const addKeeper = useMutation(api.draft.picks.addKeeper);
  const removeKeeper = useMutation(api.draft.picks.removeKeeper);

  const [keeperSearch, setKeeperSearch] = useState("");
  const [keeperTeamId, setKeeperTeamId] = useState<Id<"draftTeams"> | null>(
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
    return (["QB", "RB", "WR", "TE", "DST", "K"] as const).filter(
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

  const handleAddKeeper = async (fpid: number, position: Position) => {
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
        draftSettingsId,
        teamId: keeperTeamId,
        fpid,
        price: keeperPrice,
        ...(planSlotKey ? { planSlotKey } : {}),
      });
      setKeeperSearch("");
    } catch (err) {
      setKeeperError(
        err instanceof Error ? err.message : "Failed to add keeper.",
      );
    }
  };

  const handleRemoveKeeper = async (pickId: Id<"draftPicks">) => {
    setKeeperError(null);
    try {
      await removeKeeper({ pickId });
    } catch (err) {
      setKeeperError(
        err instanceof Error ? err.message : "Failed to remove keeper.",
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
      <KeeperTable
        keepers={keepers}
        nameByFpid={nameByFpid}
        teamNameById={teamNameById}
        onRemove={handleRemoveKeeper}
        onSelectPlayer={setSelectedFpid}
      />
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
        onAddKeeper={handleAddKeeper}
        onSelectPlayer={setSelectedFpid}
      />

      <PlayerDetailModal
        fpid={selectedFpid}
        onClose={() => setSelectedFpid(null)}
        week={WEEK}
        scoring={settings.scoring}
        season={settings.season ?? String(new Date().getFullYear())}
        draftSettingsId={draftSettingsId}
      />
    </Stack>
  );
}
