import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Chip,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useMutation, useQuery } from "convex/react";
import { ListChecks, X } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { PlayerDetailModal } from "../../../components/PlayerDetailModal";
import { WEEK } from "../../../constants/general";
import { getErrorMessage } from "../../../lib/errors";
import { positionColorOrDefault } from "../../../lib/positionColors";
import { scoringConfigFromSeason } from "../../../lib/relevantPlayers";
import { POSITIONS, type DraftTierRow, type Position } from "../../../types";
import { BottomSheet, DraftFab, TeamChipRow } from "./mobileDraftSheet";

interface MobileSnakeDraftProps {
  seasonId: Id<"seasons">;
  teams: Doc<"seasonTeams">[];
}

// Snake/linear counterpart to MobileNomination's nominate/assign FAB - the
// mobile way to actually make a pick, reachable from every Draft Room tab
// rather than only the Draft one (SnakeDraftTab's inline table is the
// desktop equivalent, and stays as-is). Self-contained the same way
// SnakeDraftTab is: there's no snake analog of auction's DraftTopBar to
// thread props down from, and Convex dedupes identical query subscriptions,
// so re-querying here costs nothing extra when the Draft tab is also
// mounted (same reasoning DraftTab.tsx's getDraftBoard comment gives).
export function MobileSnakeDraft({ seasonId, teams }: MobileSnakeDraftProps) {
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<Position | null>(null);
  const [pickingTeamId, setPickingTeamId] = useState<Id<"seasonTeams"> | null>(
    null,
  );
  const [selectedFpid, setSelectedFpid] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);

  const settingsList = useQuery(api.leagues.listSeasons, {});
  const settings = settingsList?.find((s) => s._id === seasonId);
  const thisSeason = settings?.year ?? String(new Date().getFullYear());
  const picks = useQuery(api.draft.picks.listDraftPicks, { seasonId });
  // Same authoritative on-the-clock/pick-numbering source the TV board and
  // SnakeDraftTab both read, so this sheet can never disagree with either
  // about whose turn it is or which pick number is up (see
  // getSnakeBoardPublic - the turn pointer alone can lag while keepers
  // occupy early rotation slots).
  const board = useQuery(api.draft.pickSlots.getSnakeBoardPublic, { seasonId });
  const draftBoardResult = useQuery(
    api.draft.board.getDraftBoard,
    settings
      ? {
          seasonId,
          week: WEEK,
          scoringConfig: scoringConfigFromSeason(settings),
        }
      : "skip",
  ) as { isGeneric: boolean; rows: DraftTierRow[] } | undefined;
  const allRankings = useQuery(api.rankings.getAllRankings, { week: WEEK });

  const draftPick = useMutation(api.draft.picks.draftPick);

  // Same ordering rationale as SnakeDraftTab's - the chip row should read in
  // the order teams actually pick in (board.teamOrder is drafts.draftOrder
  // itself), not their creation order in `teams`.
  const orderedTeams = useMemo(() => {
    const orderIndex = new Map(
      (board?.teamOrder ?? []).map((teamId, index) => [teamId, index]),
    );
    if (orderIndex.size === 0) return teams;
    return [...teams].sort(
      (a, b) =>
        (orderIndex.get(a._id) ?? Infinity) -
        (orderIndex.get(b._id) ?? Infinity),
    );
  }, [teams, board]);

  const pickedFpids = useMemo(
    () => new Set((picks ?? []).map((pick) => pick.fpid)),
    [picks],
  );

  const adpByFpid = useMemo(() => {
    const map = new Map<
      number,
      { adpStd: number; adpHalf: number; adpPpr: number }
    >();
    for (const row of allRankings ?? []) map.set(row.fpid, row);
    return map;
  }, [allRankings]);

  const adpForRow = (fpid: number): number | undefined => {
    const row = adpByFpid.get(fpid);
    if (!row || !settings) return undefined;
    if (settings.scoring === "STD") return row.adpStd;
    if (settings.scoring === "HALF") return row.adpHalf;
    return row.adpPpr;
  };

  const availableRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (draftBoardResult?.rows ?? [])
      .filter((row) => !pickedFpids.has(row.fpid))
      .filter((row) => !positionFilter || row.position === positionFilter)
      .filter((row) => !term || row.name.toLowerCase().includes(term))
      .sort((a, b) => b.points - a.points)
      .slice(0, 100);
  }, [draftBoardResult, pickedFpids, positionFilter, search]);

  const currentTeamId = board?.onClockTeamId ?? null;
  const effectivePickingTeamId =
    pickingTeamId ?? currentTeamId ?? orderedTeams[0]?._id ?? null;

  // "1.01, 1/150" - round.pickInRound from the on-the-clock cell (the board
  // already resolved which position is up, trades/forfeits/keepers included),
  // then this pick's overall number out of the draft's real slot total.
  const pickLabel = useMemo(() => {
    if (!board || board.onClockRound === null) return null;
    const round = board.rounds.find((r) => r.round === board.onClockRound);
    const cell = round?.cells.find((c) => c.isOnClock);
    if (!cell) return null;
    return `${board.onClockRound}.${String(cell.position).padStart(2, "0")}, ${board.currentOverallPick}/${board.totalPicks}`;
  }, [board]);

  const handleDraft = async (fpid: number) => {
    if (!effectivePickingTeamId) return;
    setActionError(null);
    setIsPicking(true);
    try {
      await draftPick({ seasonId, fpid, teamId: effectivePickingTeamId });
      // Same "one pick per open" flow as the nominate sheet - a completed
      // pick closes the sheet (and clears the search that found it) rather
      // than leaving a now-stale list open over the page.
      setSearch("");
      setOpened(false);
    } catch (err) {
      setActionError(getErrorMessage(err, "That action failed."));
    } finally {
      setIsPicking(false);
    }
  };

  // Nothing to pick into until an order exists - same guard SnakeDraftTab
  // shows its own message for, just silent here since a FAB has no room to
  // explain itself.
  if (board && board.teamOrder.length === 0) return null;

  return (
    <>
      <DraftFab
        icon={opened ? <X size={24} /> : <ListChecks size={24} />}
        label={opened ? "Close draft a player" : "Draft a player"}
        onClick={() => setOpened((current) => !current)}
      />

      <BottomSheet opened={opened} onDismiss={() => setOpened(false)}>
        <Stack gap={10}>
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text fw={700} size="lg">
                Draft a Player
              </Text>
              {pickLabel && (
                <Text size="sm" c="dimmed">
                  {pickLabel}
                </Text>
              )}
            </Stack>
            <Button
              variant="default"
              size="xs"
              radius="xl"
              onClick={() => setOpened(false)}
            >
              Close
            </Button>
          </Group>

          {actionError && (
            <Text c="red" size="sm">
              {actionError}
            </Text>
          )}

          <Stack gap={4}>
            <Text size="sm" c="dimmed">
              Picking as
              {currentTeamId && (
                <>
                  {" · on the clock: "}
                  <Text component="span" inherit fw={600} c="saddlebrown.5">
                    {teams.find((t) => t._id === currentTeamId)?.name ?? "—"}
                  </Text>
                </>
              )}
            </Text>
            <TeamChipRow
              teams={orderedTeams.map((team) => ({
                id: team._id,
                label: team.name,
              }))}
              selectedId={effectivePickingTeamId}
              onSelect={(id) => setPickingTeamId(id)}
            />
          </Stack>

          <TextInput
            placeholder="Search players"
            value={search}
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />

          <Group gap={6}>
            <Chip
              checked={positionFilter === null}
              onChange={() => setPositionFilter(null)}
              variant="light"
            >
              All
            </Chip>
            {POSITIONS.map((pos) => (
              <Chip
                key={pos}
                checked={positionFilter === pos}
                onChange={() => setPositionFilter(pos)}
                color={positionColorOrDefault(pos)}
                variant="light"
              >
                {pos}
              </Chip>
            ))}
          </Group>

          <Table striped highlightOnHover verticalSpacing={8}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Player</Table.Th>
                <Table.Th>Rk</Table.Th>
                <Table.Th>ADP</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {availableRows.map((row) => {
                const adp = adpForRow(row.fpid);
                return (
                  <Table.Tr key={row.fpid}>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <Badge
                          size="sm"
                          variant="light"
                          color={positionColorOrDefault(row.position)}
                        >
                          {row.position}
                        </Badge>
                        <Text
                          size="sm"
                          component="button"
                          onClick={() => setSelectedFpid(row.fpid)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            textAlign: "left",
                          }}
                        >
                          {row.name}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>{row.positionRank}</Table.Td>
                    <Table.Td>
                      {adp !== undefined ? adp.toFixed(1) : "—"}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        disabled={isPicking || !effectivePickingTeamId}
                        onClick={() => handleDraft(row.fpid)}
                      >
                        Draft
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Stack>
      </BottomSheet>

      <PlayerDetailModal
        fpid={selectedFpid}
        onClose={() => setSelectedFpid(null)}
        week={WEEK}
        scoringConfig={
          settings
            ? scoringConfigFromSeason(settings)
            : { scoring: "PPR", teScoring: "NONE", sixPointPassTds: false }
        }
        season={thisSeason}
        seasonId={seasonId}
      />
    </>
  );
}
