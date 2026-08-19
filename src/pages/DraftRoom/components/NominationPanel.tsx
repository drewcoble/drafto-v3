import { useEffect, useRef, useState } from "react";
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
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import {
  BanknoteArrowDown,
  BatteryLow,
  CircleSlash,
  Crosshair,
  HandCoins,
  Rocket,
  ShieldCheck,
  TrendingDown,
  TrendingUpDown,
} from "lucide-react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { Position, PlayerTag, ValueGap } from "../../../types";
import type { PlanSlotMatch } from "../../../lib/planRecommendation";
import {
  consistencyColor,
  type ConsistencyLabel,
} from "../../../lib/consistency";
import { POSITION_COLORS } from "../../../lib/positionColors";
import { playerTagStyle } from "../../../lib/playerTagStyle";
import { GenericValueBadge } from "../../../components/GenericValueBadge";
import { useHoldRepeat } from "../../../hooks/useHoldRepeat";

export interface SearchResult {
  fpid: number;
  name: string;
  position: Position;
  team: string | null;
  // DraftTopBar.tsx populates these on every row regardless of which panel
  // renders them, but SearchBody only ever displays them on touchFriendly
  // (MobileNomination's) rows - desktop's NominationPanel card has no room
  // for them.
  tag?: PlayerTag;
  valueGap?: ValueGap;
  consistency?: ConsistencyLabel;
  onCycleTag?: () => void;
}

// Same icon choices PlayerBar.tsx/PlayerTableRow.tsx use for the same
// consistency ratings - kept in sync there rather than imported, same
// duplication convention those two already share.
const CONSISTENCY_ICON: Record<ConsistencyLabel, typeof ShieldCheck> = {
  Reliable: ShieldCheck,
  "Boom/Bust": TrendingUpDown,
  "Low Output": BatteryLow,
};

interface NominationPanelProps {
  nextPickNumber: number;
  totalPicks: number;
  teams: Doc<"seasonTeams">[];
  // Turn selector - only rendered while nothing's on the block yet (once
  // bidding starts, "who nominates next" isn't actionable) and only when the
  // league has a configured nomination order to begin with.
  nominationOrderEnabled: boolean;
  turnTeamId: Id<"seasonTeams"> | null | undefined;
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

  // True when draftValueByFpid/nominatedValue are convex/draftValues.ts's
  // generic 12-team/$200 fallback rather than this league's real settings -
  // surfaced once here (rather than annotating every individual $ figure
  // below) since this panel is a persistent, space-constrained header
  // shown on every Draft Room tab.
  usingGenericValues: boolean;

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
  usingGenericValues,
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
          <Group gap={4} wrap="nowrap">
            <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
              Pick {nextPickNumber} of {totalPicks}
            </Text>
            {usingGenericValues && <GenericValueBadge />}
          </Group>
          {activeNomination
            ? nominatingTeam && (
                <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                  Nominated by {nominatingTeam.name}
                </Text>
              )
            : nominationOrderEnabled && (
                <Group gap={6} wrap="nowrap">
                  <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                    Nominating team
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

  const decrementBidHold = useHoldRepeat(() => onBumpBid(-1));
  const incrementBidHold = useHoldRepeat(() => onBumpBid(1));

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
    nominatedValue ? `Fair ~$${Math.round(nominatedValue.dollarValue)}` : null,
    planMatch
      ? `${planMatch.slotLabel} ~$${Math.round(planMatch.amount)}`
      : null,
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
          <ActionIcon
            size="sm"
            variant="default"
            onClick={() => onBumpBid(-1)}
            {...decrementBidHold}
          >
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
          <ActionIcon
            size="sm"
            variant="default"
            onClick={() => onBumpBid(1)}
            {...incrementBidHold}
          >
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
        <Button
          size="compact-sm"
          variant="subtle"
          color="gray"
          onClick={onPass}
        >
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
  // Bigger inputs/rows for MobileNomination's popover, where a finger (not
  // a precise mouse pointer) is doing the tapping - off by default for the
  // desktop NominationPanel card, which has more room and doesn't need it.
  touchFriendly?: boolean;
}

export function SearchBody({
  search,
  onSearchChange,
  searchResults,
  draftValueByFpid,
  onNominate,
  onSelectPlayer,
  touchFriendly = false,
}: SearchBodyProps) {
  // Blurred once a result is acted on (nominate, or opening the player
  // detail modal via the name) so the on-screen keyboard on iOS/Android
  // doesn't stick around covering the rest of the panel/modal.
  const inputRef = useRef<HTMLInputElement>(null);
  const blurInput = () => inputRef.current?.blur();

  return (
    <Stack gap={touchFriendly ? 10 : 6}>
      <TextInput
        ref={inputRef}
        size={touchFriendly ? "md" : "sm"}
        placeholder="Search a player to nominate..."
        value={search}
        // iOS's autocorrect/QuickType bar doesn't recognize most player
        // surnames and pops a suggestion strip on top of the results list
        // below, eating the first tap on an option - see
        // ManualPreviousSeasonModal.tsx's copy of this same fix.
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onSearchChange(event.currentTarget.value)}
      />
      {searchResults.length > 0 && (
        <Box mah={touchFriendly ? 320 : 220} style={{ overflowY: "auto" }}>
          <Table.ScrollContainer minWidth={320}>
            <Table verticalSpacing={touchFriendly ? 10 : 4}>
              <Table.Tbody>
                {searchResults.map((row) => {
                  const ConsistencyRowIcon = row.consistency
                    ? CONSISTENCY_ICON[row.consistency]
                    : undefined;
                  return (
                    <Table.Tr key={row.fpid}>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          <Anchor
                            component="button"
                            type="button"
                            size={touchFriendly ? "sm" : "xs"}
                            onClick={() => {
                              blurInput();
                              onSelectPlayer(row.fpid);
                            }}
                          >
                            {row.name}
                          </Anchor>
                          {touchFriendly && (
                            <>
                              {row.valueGap?.direction === "undervalued" ? (
                                <Tooltip label="Undervalued" withArrow>
                                  <ThemeIcon
                                    size="xs"
                                    color="gold"
                                    variant="light"
                                  >
                                    <HandCoins size={12} />
                                  </ThemeIcon>
                                </Tooltip>
                              ) : row.valueGap?.direction === "breakout" ? (
                                <Tooltip label="Breakout Player" withArrow>
                                  <ThemeIcon
                                    size="xs"
                                    color="grape"
                                    variant="light"
                                  >
                                    <Rocket size={12} />
                                  </ThemeIcon>
                                </Tooltip>
                              ) : row.valueGap?.direction === "falloff" ? (
                                <Tooltip label="Falloff Player" withArrow>
                                  <ThemeIcon
                                    size="xs"
                                    color="red"
                                    variant="light"
                                  >
                                    <TrendingDown size={12} />
                                  </ThemeIcon>
                                </Tooltip>
                              ) : (
                                row.valueGap?.direction === "overvalued" && (
                                  <Tooltip label="Overvalued" withArrow>
                                    <ThemeIcon
                                      size="xs"
                                      color="red"
                                      variant="light"
                                    >
                                      <BanknoteArrowDown size={12} />
                                    </ThemeIcon>
                                  </Tooltip>
                                )
                              )}
                              {row.consistency && ConsistencyRowIcon && (
                                <Tooltip label={row.consistency} withArrow>
                                  <ThemeIcon
                                    size="xs"
                                    variant="light"
                                    color={consistencyColor(row.consistency)}
                                  >
                                    <ConsistencyRowIcon size={12} />
                                  </ThemeIcon>
                                </Tooltip>
                              )}
                            </>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          size={touchFriendly ? "sm" : "xs"}
                          variant="light"
                          color={POSITION_COLORS[row.position]}
                        >
                          {row.position}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size={touchFriendly ? "sm" : "xs"} c="dimmed">
                          {row.team ?? "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size={touchFriendly ? "sm" : "xs"}>
                          {draftValueByFpid.get(row.fpid)
                            ? `$${Math.round(draftValueByFpid.get(row.fpid)!.dollarValue)}`
                            : "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4} align="flex-end">
                          <Button
                            size={touchFriendly ? "sm" : "compact-xs"}
                            onClick={() => {
                              blurInput();
                              onNominate(row.fpid);
                            }}
                          >
                            Nominate
                          </Button>
                          {touchFriendly && row.onCycleTag && (
                            <Button
                              size="compact-xs"
                              {...(row.tag
                                ? playerTagStyle(row.tag)
                                : { variant: "default" })}
                              leftSection={
                                row.tag === "avoid" ? (
                                  <CircleSlash size={12} />
                                ) : (
                                  <Crosshair size={12} />
                                )
                              }
                              onClick={row.onCycleTag}
                            >
                              {row.tag === "target"
                                ? "Target"
                                : row.tag === "avoid"
                                  ? "Avoid"
                                  : "+ Tag"}
                            </Button>
                          )}
                        </Stack>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Box>
      )}
    </Stack>
  );
}
