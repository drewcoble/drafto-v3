import { useEffect, useState } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { Position } from "../../../types";
import type { PlanSlotMatch } from "../../../lib/planRecommendation";
import { POSITION_COLORS } from "../../../lib/positionColors";

export interface SearchResult {
  fpid: number;
  name: string;
  position: Position;
  team: string | null;
}

interface NominationPanelProps {
  nextPickNumber: number;
  totalPicks: number;
  teams: Doc<"seasonTeams">[];
  // Turn selector - only rendered while nothing's on the block yet (once
  // bidding starts, "who nominates next" isn't actionable) and only when the
  // league has a configured nomination order to begin with.
  nominationOrderEnabled: boolean;
  turnTeamId: Id<"seasonTeams"> | null | undefined;
  turnTeamName: string | undefined;
  onSetTurnTeam: (teamId: Id<"seasonTeams"> | null) => void;

  activeNomination: Doc<"draftNominations"> | undefined;
  nominatedPlayer: { name: string; team: string | null } | undefined;
  nominatedValue: { dollarValue: number } | undefined;
  planMatch: PlanSlotMatch | undefined;
  winnerTeamId: string | null;
  onWinnerTeamIdChange: (id: string | null) => void;
  onBumpBid: (delta: number) => void;
  onSetBid: (amount: number) => void;
  onLogWin: () => void;
  onLogWinner: () => void;
  onPass: () => void;

  search: string;
  onSearchChange: (value: string) => void;
  searchResults: SearchResult[];
  draftValueByFpid: Map<number, { dollarValue: number }>;
  onNominate: (fpid: number) => void;

  actionError: string | null;
  onSelectPlayer: (fpid: number) => void;
}

// Everything needed to run the auction lives in one condensed card, docked
// to the left of the budget stat tiles at the top of every Draft Room tab -
// search + nominate the next player, watch/bump the bid, and log who won,
// all without leaving whichever tab you're on. Swaps between two bodies
// depending on whether a nomination is currently on the block.
export function NominationPanel({
  nextPickNumber,
  totalPicks,
  teams,
  nominationOrderEnabled,
  turnTeamId,
  turnTeamName,
  onSetTurnTeam,
  activeNomination,
  nominatedPlayer,
  nominatedValue,
  planMatch,
  winnerTeamId,
  onWinnerTeamIdChange,
  onBumpBid,
  onSetBid,
  onLogWin,
  onLogWinner,
  onPass,
  search,
  onSearchChange,
  searchResults,
  draftValueByFpid,
  onNominate,
  actionError,
  onSelectPlayer,
}: NominationPanelProps) {
  const nominatingTeam = activeNomination
    ? teams.find((team) => team._id === activeNomination.nominatingTeamId)
    : undefined;

  return (
    <Card withBorder padding="sm" style={{ flex: "1 1 380px" }}>
      <Stack gap={6}>
        <Group justify="space-between" gap="xs" wrap="wrap">
          <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
            Pick {nextPickNumber} of {totalPicks}
          </Text>
          {activeNomination ? (
            nominatingTeam && (
              <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                Nominated by {nominatingTeam.name}
              </Text>
            )
          ) : (
            nominationOrderEnabled && (
              <Group gap={6} wrap="nowrap">
                <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                  {turnTeamName ? `${turnTeamName}'s turn` : "Manual turn"}
                </Text>
                <Select
                  size="xs"
                  w={120}
                  placeholder="Set turn..."
                  data={[
                    { value: "__manual__", label: "— Manual —" },
                    ...teams.map((team) => ({
                      value: team._id,
                      label: team.name,
                    })),
                  ]}
                  value={turnTeamId ?? "__manual__"}
                  onChange={(value) =>
                    onSetTurnTeam(
                      !value || value === "__manual__"
                        ? null
                        : (value as Id<"seasonTeams">),
                    )
                  }
                  allowDeselect={false}
                />
              </Group>
            )
          )}
        </Group>

        <Divider />

        {actionError && (
          <Text c="red" size="xs">
            {actionError}
          </Text>
        )}

        {activeNomination ? (
          <ActiveNominationBody
            activeNomination={activeNomination}
            nominatedPlayer={nominatedPlayer}
            nominatedValue={nominatedValue}
            planMatch={planMatch}
            teams={teams}
            winnerTeamId={winnerTeamId}
            onWinnerTeamIdChange={onWinnerTeamIdChange}
            onBumpBid={onBumpBid}
            onSetBid={onSetBid}
            onLogWin={onLogWin}
            onLogWinner={onLogWinner}
            onPass={onPass}
            onSelectPlayer={onSelectPlayer}
          />
        ) : (
          <SearchBody
            search={search}
            onSearchChange={onSearchChange}
            searchResults={searchResults}
            draftValueByFpid={draftValueByFpid}
            onNominate={onNominate}
            onSelectPlayer={onSelectPlayer}
          />
        )}
      </Stack>
    </Card>
  );
}

interface ActiveNominationBodyProps {
  activeNomination: Doc<"draftNominations">;
  nominatedPlayer: { name: string; team: string | null } | undefined;
  nominatedValue: { dollarValue: number } | undefined;
  planMatch: PlanSlotMatch | undefined;
  teams: Doc<"seasonTeams">[];
  winnerTeamId: string | null;
  onWinnerTeamIdChange: (id: string | null) => void;
  onBumpBid: (delta: number) => void;
  onSetBid: (amount: number) => void;
  onLogWin: () => void;
  onLogWinner: () => void;
  onPass: () => void;
  onSelectPlayer: (fpid: number) => void;
}

function ActiveNominationBody({
  activeNomination,
  nominatedPlayer,
  nominatedValue,
  planMatch,
  teams,
  winnerTeamId,
  onWinnerTeamIdChange,
  onBumpBid,
  onSetBid,
  onLogWin,
  onLogWinner,
  onPass,
  onSelectPlayer,
}: ActiveNominationBodyProps) {
  // Local draft of the bid input so keystrokes aren't clobbered by the
  // currentBid prop re-rendering mid-type (Convex pushes a fresh value on
  // every subscription update) - only synced from the prop while the field
  // isn't focused, so the +/- stepper (which patches currentBid directly)
  // still reflects immediately, but typing a new value doesn't fight the
  // live subscription.
  const [bidDraft, setBidDraft] = useState<number | string>(
    activeNomination.currentBid,
  );
  const [editingBid, setEditingBid] = useState(false);

  useEffect(() => {
    if (!editingBid) setBidDraft(activeNomination.currentBid);
  }, [activeNomination._id, activeNomination.currentBid, editingBid]);

  const commitBidDraft = () => {
    setEditingBid(false);
    const amount =
      typeof bidDraft === "number" ? bidDraft : parseFloat(bidDraft);
    if (Number.isFinite(amount) && amount !== activeNomination.currentBid) {
      onSetBid(amount);
    } else {
      setBidDraft(activeNomination.currentBid);
    }
  };

  // The two market-value figures read as a short dotted sentence rather
  // than competing separately-labeled tags - only ever 0-2 short fragments,
  // so a plain join reads cleaner here than another row of badges.
  const valueParts = [
    nominatedValue
      ? `Fair ~$${Math.round(nominatedValue.dollarValue)}`
      : null,
    planMatch ? `${planMatch.slotLabel} ~$${Math.round(planMatch.amount)}` : null,
  ].filter((part): part is string => part !== null);

  return (
    <Stack gap={6}>
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap={6} align="center" wrap="nowrap" style={{ minWidth: 0 }}>
          {nominatedPlayer ? (
            <Anchor
              component="button"
              type="button"
              fw={700}
              truncate
              onClick={() => onSelectPlayer(activeNomination.fpid)}
            >
              {nominatedPlayer.name}
            </Anchor>
          ) : (
            <Text fw={700} truncate>
              Player #{activeNomination.fpid}
            </Text>
          )}
          <Badge
            size="sm"
            variant="light"
            color={POSITION_COLORS[activeNomination.position]}
          >
            {activeNomination.position}
          </Badge>
          {nominatedPlayer?.team && (
            <Badge size="sm" variant="outline" color="gray">
              {nominatedPlayer.team}
            </Badge>
          )}
        </Group>
        <Group gap={4} align="center" wrap="nowrap">
          <ActionIcon size="sm" variant="default" onClick={() => onBumpBid(-1)}>
            −
          </ActionIcon>
          <NumberInput
            hideControls
            min={1}
            value={bidDraft}
            onChange={setBidDraft}
            onFocus={() => setEditingBid(true)}
            onBlur={commitBidDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            prefix="$"
            w={78}
            size="sm"
            styles={{
              input: {
                fontFamily: "var(--mantine-font-family-monospace)",
                fontWeight: 700,
                textAlign: "center",
                color: "var(--mantine-color-saddlebrown-5)",
              },
            }}
          />
          <ActionIcon size="sm" variant="default" onClick={() => onBumpBid(1)}>
            +
          </ActionIcon>
        </Group>
      </Group>
      {valueParts.length > 0 && (
        <Text size="xs" c="dimmed">
          {valueParts.join("  ·  ")}
        </Text>
      )}
      <Group gap={6} wrap="wrap">
        <Button size="compact-sm" onClick={onLogWin}>
          I won @ ${activeNomination.currentBid}
        </Button>
        <Select
          size="xs"
          placeholder="Someone else won..."
          data={teams
            .filter((team) => !team.isSelf)
            .map((team) => ({ value: team._id, label: team.name }))}
          value={winnerTeamId}
          onChange={onWinnerTeamIdChange}
          w={150}
        />
        <Button
          size="compact-sm"
          variant="default"
          disabled={!winnerTeamId}
          onClick={onLogWinner}
        >
          Log winner
        </Button>
        <Button size="compact-sm" variant="subtle" color="gray" onClick={onPass}>
          Pass
        </Button>
      </Group>
    </Stack>
  );
}

export interface SearchBodyProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchResults: SearchResult[];
  draftValueByFpid: Map<number, { dollarValue: number }>;
  onNominate: (fpid: number) => void;
  onSelectPlayer: (fpid: number) => void;
}

export function SearchBody({
  search,
  onSearchChange,
  searchResults,
  draftValueByFpid,
  onNominate,
  onSelectPlayer,
}: SearchBodyProps) {
  return (
    <Stack gap={6}>
      <TextInput
        size="sm"
        placeholder="Search a player to nominate..."
        value={search}
        onChange={(event) => onSearchChange(event.currentTarget.value)}
      />
      {searchResults.length > 0 && (
        <Box mah={220} style={{ overflowY: "auto" }}>
          <Table.ScrollContainer minWidth={320}>
            <Table verticalSpacing={4}>
              <Table.Tbody>
                {searchResults.map((row) => (
                  <Table.Tr key={row.fpid}>
                    <Table.Td>
                      <Anchor
                        component="button"
                        type="button"
                        size="xs"
                        onClick={() => onSelectPlayer(row.fpid)}
                      >
                        {row.name}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        size="xs"
                        variant="light"
                        color={POSITION_COLORS[row.position]}
                      >
                        {row.position}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {row.team ?? "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs">
                        {draftValueByFpid.get(row.fpid)
                          ? `$${Math.round(draftValueByFpid.get(row.fpid)!.dollarValue)}`
                          : "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="compact-xs"
                        onClick={() => onNominate(row.fpid)}
                      >
                        Nominate
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Box>
      )}
    </Stack>
  );
}
