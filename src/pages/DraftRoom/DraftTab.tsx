import { SimpleGrid, Stack, Text } from "@mantine/core";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { PlayerDetailModal } from "../../components/PlayerDetailModal";
import { GenericValuesNotice } from "../../components/GenericValuesNotice";
import { WEEK } from "../../constants/general";
import type { DraftTierRow } from "../../types";
import { RecentPicksTable } from "./components/RecentPicksTable";
import { TargetsTable } from "./components/ShortlistTable";
import { getErrorMessage } from "../../lib/errors";

interface DraftTabProps {
  seasonId: Id<"seasons">;
  teams: Doc<"seasonTeams">[];
}

// Search/nominate/bid/resolve all live in DraftTopBar now (shared across
// every Draft Room tab) - this tab is just two audit/reference tables side
// by side: what's already been picked, and the "target"-tagged shortlist
// (see convex/draft/tags.ts) in priority order. Tagging itself still happens
// elsewhere (Players Left's bar click, or the Setup app's Players table);
// this is purely for reviewing/reordering/pruning it.
export function DraftTab({ seasonId, teams }: DraftTabProps) {
  const [selectedFpid, setSelectedFpid] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const settingsList = useQuery(api.leagues.listSeasons, {});
  const settings = settingsList?.find((s) => s._id === seasonId);
  const thisSeason = settings?.year ?? String(new Date().getFullYear());
  const allProjections = useQuery(api.projections.getAllProjections, {
    week: WEEK,
  });
  const picks = useQuery(api.draft.picks.listDraftPicks, { seasonId });
  const playerTags = useQuery(api.draft.tags.listPlayerTags, {
    seasonId,
  });
  // Same query/args PlayersLeftTab uses - stable for the draft's duration
  // (season settings + projections only), so this is a shared subscription
  // whenever that tab is also mounted, not a second server-side compute.
  const draftBoardResult = useQuery(
    api.draft.board.getDraftBoard,
    settings
      ? { seasonId, week: WEEK, scoring: settings.scoring }
      : "skip",
  ) as { isGeneric: boolean; rows: DraftTierRow[] } | undefined;
  const tieredValues = draftBoardResult?.rows;
  const usingGenericValues = draftBoardResult?.isGeneric ?? false;

  const removePick = useMutation(api.draft.picks.removePick);
  const reorderShortlist = useMutation(api.draft.tags.reorderShortlist);
  const clearPlayerTag = useMutation(api.draft.tags.clearPlayerTag);

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

  const teamById = useMemo(() => {
    const map = new Map<string, Doc<"seasonTeams">>();
    for (const team of teams) {
      map.set(team._id, team);
    }
    return map;
  }, [teams]);

  const boardByFpid = useMemo(() => {
    const map = new Map<number, DraftTierRow>();
    for (const row of tieredValues ?? []) map.set(row.fpid, row);
    return map;
  }, [tieredValues]);

  const pickByFpid = useMemo(() => {
    const map = new Map<number, Doc<"draftPicks">>();
    for (const pick of picks ?? []) map.set(pick.fpid, pick);
    return map;
  }, [picks]);

  const recentPicks = useMemo(
    () =>
      [...(picks ?? [])].sort((a, b) => b.sequence - a.sequence).slice(0, 8),
    [picks],
  );

  // Dense order among targets only - a stale/missing order value (e.g. from
  // data written before this field existed) falls back to insertion order
  // rather than corrupting the sort.
  const shortlist = useMemo(() => {
    return (playerTags ?? [])
      .filter((tag) => tag.tag === "target")
      .sort(
        (a, b) =>
          (a.order ?? 0) - (b.order ?? 0) || a._creationTime - b._creationTime,
      )
      .map((tag) => {
        const pick = pickByFpid.get(tag.fpid);
        return {
          tag,
          row: boardByFpid.get(tag.fpid),
          pick,
          draftedByTeam: pick ? teamById.get(pick.teamId) : undefined,
        };
      });
  }, [playerTags, boardByFpid, pickByFpid, teamById]);

  const runAction = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(
        getErrorMessage(err, "That action failed."),
      );
    }
  };

  const handleMoveShortlist = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= shortlist.length) return;
    const fpids = shortlist.map(({ tag }) => tag.fpid);
    [fpids[index], fpids[target]] = [fpids[target]!, fpids[index]!];
    runAction(() => reorderShortlist({ seasonId, fpids }));
  };

  return (
    <Stack gap="md" py="sm">
      {actionError && (
        <Text c="red" size="sm">
          {actionError}
        </Text>
      )}
      {usingGenericValues && <GenericValuesNotice />}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <RecentPicksTable
          picks={recentPicks}
          nameByFpid={nameByFpid}
          teamNameById={teamNameById}
          onRemove={(pickId) => runAction(() => removePick({ pickId }))}
          onSelectPlayer={setSelectedFpid}
          trackConsecutiveYears={settings?.keeperRules?.trackConsecutiveYears ?? true}
        />
        <TargetsTable
          rows={shortlist}
          onMove={handleMoveShortlist}
          onRemove={(fpid) =>
            runAction(() => clearPlayerTag({ seasonId, fpid }))
          }
          onSelectPlayer={setSelectedFpid}
        />
      </SimpleGrid>

      <PlayerDetailModal
        fpid={selectedFpid}
        onClose={() => setSelectedFpid(null)}
        week={WEEK}
        scoring={settings?.scoring ?? "PPR"}
        season={thisSeason}
        seasonId={seasonId}
      />
    </Stack>
  );
}
