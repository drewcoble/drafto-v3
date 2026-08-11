import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Badge,
  Button,
  Card,
  Combobox,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  useCombobox,
} from "@mantine/core";
import { X } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { POSITION_COLORS } from "../../../lib/positionColors";
import { EditableNumberStepper } from "../../../components/NumberStepper";
import { WEEK } from "../../../constants/general";
import type { Position } from "../../../types";
import { getErrorMessage } from "../../../lib/errors";

interface ManualPreviousSeasonModalProps {
  seasonId: Id<"seasons">;
  currentYear: string;
  opened: boolean;
  onClose: () => void;
}

interface PlayerDraft {
  fpid: number;
  name: string;
  position: Position;
  price: number;
}

interface TeamDraft {
  // Local-only identity for React keys/edits - not sent to the mutation
  // (which just takes name/isSelf/players and creates fresh seasonTeams
  // rows either way, same as importPreviousSeasonHistory does for
  // provider imports).
  key: string;
  name: string;
  isSelf: boolean;
  players: PlayerDraft[];
}

const UNASSIGNED_KEY = "__unassigned__";

// Search-and-add row for one team - same compact pattern
// KeeperTierPlayerPicker.tsx uses, minus the maxSize/otherTiers plumbing
// that's specific to that feature.
function PlayerSearchAdd({
  candidates,
  excludeFpids,
  onAdd,
  portalTarget,
}: {
  candidates: PlayerDraft[];
  excludeFpids: Set<number>;
  onAdd: (player: PlayerDraft) => void;
  portalTarget: HTMLDivElement | null;
}) {
  const [search, setSearch] = useState("");
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const results = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length < 2) return [];
    return candidates
      .filter(
        (row) =>
          !excludeFpids.has(row.fpid) && row.name.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [candidates, excludeFpids, search]);

  return (
    <Combobox
      store={combobox}
      // This picker lives inside both a Modal (which traps focus within its
      // own DOM subtree - the default portal-to-body dropdown falls outside
      // that trap and gets yanked closed) and a ScrollArea (whose overflow
      // clips an un-portaled dropdown that flips above the input when the
      // keyboard covers the space below). Portaling to a target that's a
      // sibling of the ScrollArea, but still inside the Modal, avoids both.
      withinPortal={!!portalTarget}
      {...(portalTarget ? { portalProps: { target: portalTarget } } : {})}
      onOptionSubmit={(value) => {
        const player = candidates.find((row) => String(row.fpid) === value);
        combobox.closeDropdown();
        if (!player) return;
        onAdd(player);
        setSearch("");
      }}
    >
      <Combobox.Target>
        <TextInput
          size="xs"
          placeholder="Search a player to add..."
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            combobox.openDropdown();
          }}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options mah={200} style={{ overflowY: "auto" }}>
          {results.length === 0 ? (
            <Combobox.Empty>
              {search.trim().length < 2
                ? "Type at least 2 characters..."
                : "No players found"}
            </Combobox.Empty>
          ) : (
            results.map((row) => (
              <Combobox.Option value={String(row.fpid)} key={row.fpid}>
                <Group gap={6} wrap="nowrap">
                  <Badge
                    size="sm"
                    variant="light"
                    color={POSITION_COLORS[row.position]}
                  >
                    {row.position}
                  </Badge>
                  <Text size="sm">{row.name}</Text>
                </Group>
              </Combobox.Option>
            ))
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

// Lets a host backfill last season's results by hand - team by team,
// searching for whoever they remember each team keeping/drafting - so
// Recommended Keepers (KeepersTab.tsx) has something to work from without
// needing a Sleeper/Yahoo-linked league. Doubles as the edit flow: opening
// this for a year that already has manually-entered data (see
// getManualPreviousSeasonEntry) pre-fills every row, and Save fully
// replaces whatever was there before - same "resubmit the whole form"
// pattern as e.g. TeamsPanel's nomination order.
export function ManualPreviousSeasonModal({
  seasonId,
  currentYear,
  opened,
  onClose,
}: ManualPreviousSeasonModalProps) {
  const [year, setYear] = useState(() => String(Number(currentYear) - 1));
  const [teams, setTeams] = useState<TeamDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Target for the player-search dropdowns below to portal into - see
  // PlayerSearchAdd's comment for why it can't be document.body (default)
  // or un-portaled (the two options Combobox normally offers).
  const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);

  const currentTeams = useQuery(api.draft.teams.listSeasonTeams, {
    seasonId,
  });
  const existingEntry = useQuery(
    api.draft.manualHistory.getManualPreviousSeasonEntry,
    opened ? { seasonId, year } : "skip",
  );
  const allProjections = useQuery(
    api.projections.getAllProjections,
    opened ? { week: WEEK } : "skip",
  );
  const setResults = useMutation(
    api.draft.manualHistory.setManualPreviousSeasonResults,
  );

  const nameByFpid = useMemo(() => {
    const map = new Map<number, PlayerDraft>();
    for (const row of allProjections ?? []) {
      map.set(row.fpid, {
        fpid: row.fpid,
        name: row.name,
        position: row.position,
        price: 1,
      });
    }
    return map;
  }, [allProjections]);

  // Re-derive the form's rows whenever the modal opens on a given year -
  // either from an existing manual entry (edit), or a fresh row per current
  // team plus a fixed Unassigned bucket (create). Deliberately not
  // dependent on `teams` itself, so typing in the form doesn't get
  // stomped - only opening/switching years resets it.
  useEffect(() => {
    if (!opened || currentTeams === undefined || existingEntry === undefined) {
      return;
    }
    if (existingEntry) {
      setTeams(
        existingEntry.teams.map((team, index) => ({
          key: `existing-${index}`,
          name: team.name,
          isSelf: team.isSelf,
          players: team.players.map((p) => {
            const known = nameByFpid.get(p.fpid);
            return {
              fpid: p.fpid,
              price: p.price,
              name: known?.name ?? `#${p.fpid}`,
              position: known?.position ?? "RB",
            };
          }),
        })),
      );
    } else {
      setTeams([
        ...currentTeams.map((team) => ({
          key: team._id,
          name: team.name,
          isSelf: team.isSelf,
          players: [] as PlayerDraft[],
        })),
        { key: UNASSIGNED_KEY, name: "Unassigned", isSelf: false, players: [] },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, currentTeams, existingEntry]);

  const allDraftPlayers = useMemo(
    () => Array.from(nameByFpid.values()),
    [nameByFpid],
  );
  const usedFpids = useMemo(
    () => new Set(teams.flatMap((t) => t.players.map((p) => p.fpid))),
    [teams],
  );

  const addPlayer = (teamKey: string, player: PlayerDraft) => {
    setTeams((current) =>
      current.map((t) =>
        t.key === teamKey ? { ...t, players: [...t.players, player] } : t,
      ),
    );
  };

  const removePlayer = (teamKey: string, fpid: number) => {
    setTeams((current) =>
      current.map((t) =>
        t.key === teamKey
          ? { ...t, players: t.players.filter((p) => p.fpid !== fpid) }
          : t,
      ),
    );
  };

  const setPrice = (teamKey: string, fpid: number, price: number) => {
    setTeams((current) =>
      current.map((t) =>
        t.key === teamKey
          ? {
              ...t,
              players: t.players.map((p) =>
                p.fpid === fpid ? { ...p, price } : p,
              ),
            }
          : t,
      ),
    );
  };

  const totalPlayers = teams.reduce((sum, t) => sum + t.players.length, 0);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await setResults({
        seasonId,
        year,
        teams: teams
          .filter((t) => t.players.length > 0)
          .map((t) => ({
            name: t.name,
            isSelf: t.isSelf,
            players: t.players.map((p) => ({ fpid: p.fpid, price: p.price })),
          })),
      });
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save last season's results."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Enter last season's results"
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Add whoever you remember from each team's roster and what they cost -
          doesn't need to be everyone. Team assignments here are trusted as
          accurate (unlike an imported draft, which only reflects draft day), so
          Recommended Keepers can suggest which team a bargain likely belongs
          to.
        </Text>
        <TextInput
          label="Season"
          description="Which year this roster is from"
          value={year}
          onChange={(event) => setYear(event.currentTarget.value)}
          w={140}
        />
        <div ref={setPortalTarget} />
        <ScrollArea.Autosize mah={420}>
          <Stack gap="sm">
            {teams.map((team) => (
              <Card key={team.key} withBorder padding="sm">
                <Stack gap={6}>
                  <Group gap={6}>
                    <Text size="sm" fw={600}>
                      {team.name}
                    </Text>
                    {team.isSelf && (
                      <Badge size="xs" variant="light">
                        You
                      </Badge>
                    )}
                  </Group>
                  {team.players.map((player) => (
                    <Group key={player.fpid} gap={6} wrap="nowrap">
                      <Badge
                        size="sm"
                        variant="light"
                        color={POSITION_COLORS[player.position]}
                      >
                        {player.position}
                      </Badge>
                      <Text size="sm" flex={1}>
                        {player.name}
                      </Text>
                      <EditableNumberStepper
                        label={`${player.name} price`}
                        min={0}
                        width={80}
                        size="xs"
                        prefix="$"
                        value={player.price}
                        onChange={(value) =>
                          setPrice(team.key, player.fpid, value ?? 0)
                        }
                      />
                      <Button
                        variant="subtle"
                        color="gray"
                        size="xs"
                        px={4}
                        onClick={() => removePlayer(team.key, player.fpid)}
                        aria-label={`Remove ${player.name}`}
                      >
                        <X size={14} />
                      </Button>
                    </Group>
                  ))}
                  <PlayerSearchAdd
                    candidates={allDraftPlayers}
                    excludeFpids={usedFpids}
                    onAdd={(player) => addPlayer(team.key, player)}
                    portalTarget={portalTarget}
                  />
                </Stack>
              </Card>
            ))}
          </Stack>
        </ScrollArea.Autosize>
        {error && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {totalPlayers} player{totalPlayers === 1 ? "" : "s"} entered
          </Text>
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              loading={isSaving}
              disabled={totalPlayers === 0 || !year.trim()}
            >
              Save
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
