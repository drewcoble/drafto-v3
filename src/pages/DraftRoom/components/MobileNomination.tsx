import { useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  NumberInput,
  Popover,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { ChevronLeft, ChevronRight, UserPlus, X } from "lucide-react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { POSITION_COLORS } from "../../../lib/positionColors";
import { GenericValueBadge } from "../../../components/GenericValueBadge";
import {
  BOTTOM_NAV_BOTTOM_OFFSET,
  BOTTOM_NAV_HEIGHT,
} from "../../../constants/general";
import { SearchBody, type SearchResult } from "./NominationPanel";

interface MobileNominationProps {
  nominationOrderEnabled: boolean;
  turnTeamId: Id<"seasonTeams"> | null | undefined;
  onSetTurnTeam: (teamId: Id<"seasonTeams"> | null) => void;

  teams: Doc<"seasonTeams">[];
  selfTeamId: Id<"seasonTeams">;

  activeNomination: Doc<"draftNominations"> | undefined;
  nominatedPlayer: { name: string; team: string | null } | undefined;
  nominatedValue: { dollarValue: number } | undefined;
  onBumpBid: (delta: number) => void;
  onSetBid: (amount: number) => void;
  onAssignWinner: (teamId: Id<"seasonTeams">) => void;
  onPass: () => void;

  search: string;
  onSearchChange: (value: string) => void;
  searchResults: SearchResult[];
  draftValueByFpid: Map<number, { dollarValue: number }>;
  onNominate: (fpid: number) => void;

  // See NominationPanelProps.usingGenericValues.
  usingGenericValues: boolean;

  onSelectPlayer: (fpid: number) => void;
}

// Mobile replacement for the desktop NominationPanel card (hidden below the
// "sm" breakpoint via visibleFrom="sm" on that component - see
// DraftTopBar.tsx). A gavel FAB sits over the center of the bottom nav bar
// and opens a Popover with the search/nominate form, styled like
// PlayerBar.tsx's own nominate popover (withArrow shadow="md") rather than
// a full bottom-sheet Drawer; once a player is nominated the popover closes
// itself and a floating bar takes over above the bottom nav with the live
// bid + winner controls, so the auction can be run one-handed without
// digging through a tab.
export function MobileNomination({
  nominationOrderEnabled,
  turnTeamId,
  onSetTurnTeam,
  teams,
  selfTeamId,
  activeNomination,
  nominatedPlayer,
  nominatedValue,
  onBumpBid,
  onSetBid,
  onAssignWinner,
  onPass,
  search,
  onSearchChange,
  searchResults,
  draftValueByFpid,
  onNominate,
  usingGenericValues,
  onSelectPlayer,
}: MobileNominationProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const hasActiveNomination = !!activeNomination;

  // Auto-close the search popover the moment a nomination lands - the
  // floating bar below takes over from here.
  useEffect(() => {
    if (hasActiveNomination) setPopoverOpen(false);
  }, [hasActiveNomination]);

  // Steps "whose turn" one team over in `teams`' own order (a plain list
  // wrap, not the configured snake/linear nomination order - this is just a
  // manual override control, same as the Select it replaced). From manual
  // (turnTeamId null, no index), either arrow lands on the end of the list
  // nearest that direction rather than skipping past it.
  const currentTeamIndex = teams.findIndex((team) => team._id === turnTeamId);
  const currentTeamName =
    currentTeamIndex === -1 ? null : teams[currentTeamIndex]?.name;
  const bumpTurnTeam = (direction: 1 | -1) => {
    if (teams.length === 0) return;
    if (currentTeamIndex === -1) {
      onSetTurnTeam(
        direction === 1 ? teams[0]!._id : teams[teams.length - 1]!._id,
      );
      return;
    }
    const nextIndex =
      (currentTeamIndex + direction + teams.length) % teams.length;
    onSetTurnTeam(teams[nextIndex]!._id);
  };

  return (
    <>
      {/* Height-matched to BottomNav's own pill (BOTTOM_NAV_HEIGHT) and
          flex-centered, rather than just sharing its bottom offset, so the
          56px circle's vertical center always lines up with the bar's
          regardless of small differences between the two elements' natural
          heights - see BOTTOM_NAV_HEIGHT's comment. */}
      <Box
        hiddenFrom="sm"
        pos="fixed"
        left="50%"
        style={{
          bottom: `calc(${BOTTOM_NAV_BOTTOM_OFFSET}px + env(safe-area-inset-bottom))`,
          height: BOTTOM_NAV_HEIGHT,
          display: "flex",
          alignItems: "center",
          transform: "translateX(-50%)",
          zIndex: 210,
        }}
      >
        <Popover
          opened={popoverOpen}
          onChange={setPopoverOpen}
          position="top"
          withinPortal
          // Background is theme.ts's global Popover default (dark-6,
          // matching Card/MobileNominationBar) - radius and shadow are
          // wired to real Mantine props (they map to
          // --popover-radius/--popover-shadow), so setting them here
          // instead of only via styles.dropdown avoids fighting the
          // component's own CSS variables for those two.
          radius="xl"
          shadow="lg"
          // Same left/right: 12, maxWidth: 480, centered footprint as
          // MobileNominationBar's Box below (the "nominee" bar) - width is
          // relative to the viewport rather than a fixed px so the two
          // floating panels always match, not just at one screen size.
          width="calc(100vw - 24px)"
          styles={{
            dropdown: {
              maxWidth: 480,
              padding: "var(--mantine-spacing-md)",
              border: "1px solid var(--mantine-color-default-border)",
            },
          }}
        >
          <Popover.Target>
            <ActionIcon
              radius="xl"
              size={56}
              color="saddlebrown"
              variant="filled"
              disabled={!!activeNomination}
              aria-label={
                popoverOpen ? "Close nominate a player" : "Nominate a player"
              }
              onClick={() => setPopoverOpen((open) => !open)}
              style={{
                boxShadow: "var(--mantine-shadow-lg)",
                border: "none",
                // A saddlebrown gradient (lighter shade 3 to darker shade 7)
                // instead of a flat fill, each stop still mixed with
                // transparent at the same 65% as before so it stays
                // translucent against the frosted bar underneath it (see
                // BottomNav.tsx).
                background:
                  "linear-gradient(135deg, color-mix(in srgb, var(--mantine-color-saddlebrown-3) 65%, transparent), color-mix(in srgb, var(--mantine-color-saddlebrown-7) 65%, transparent))",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
              }}
            >
              {popoverOpen ? <X size={24} /> : <UserPlus size={24} />}
            </ActionIcon>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap={10}>
              {usingGenericValues && (
                <Group gap={6} wrap="nowrap">
                  <Text size="sm" c="dimmed">
                    Values shown are estimates
                  </Text>
                  <GenericValueBadge />
                </Group>
              )}
              {nominationOrderEnabled && (
                <Stack gap={4}>
                  <Text size="sm" c="dimmed">
                    Nominating team
                  </Text>
                  <Group gap={8} wrap="nowrap" justify="space-between">
                    <Group gap={4} wrap="nowrap">
                      <ActionIcon
                        variant="default"
                        size="lg"
                        onClick={() => bumpTurnTeam(-1)}
                        aria-label="Previous team"
                      >
                        <ChevronLeft size={18} />
                      </ActionIcon>
                      <Text
                        size="sm"
                        fw={600}
                        ta="center"
                        style={{ minWidth: 108 }}
                      >
                        {currentTeamName ?? "Manual"}
                      </Text>
                      <ActionIcon
                        variant="default"
                        size="lg"
                        onClick={() => bumpTurnTeam(1)}
                        aria-label="Next team"
                      >
                        <ChevronRight size={18} />
                      </ActionIcon>
                    </Group>
                    {/* Manual isn't part of the team cycle above (the
                        arrows only ever bump between actual teams), so it
                        needs its own explicit way in. */}
                    <Button
                      size="xs"
                      variant={turnTeamId == null ? "filled" : "default"}
                      {...(turnTeamId == null ? { color: "burlywood" } : {})}
                      onClick={() => onSetTurnTeam(null)}
                    >
                      Manual
                    </Button>
                  </Group>
                </Stack>
              )}
              <SearchBody
                search={search}
                onSearchChange={onSearchChange}
                searchResults={searchResults}
                draftValueByFpid={draftValueByFpid}
                onNominate={(fpid) => {
                  onNominate(fpid);
                  setPopoverOpen(false);
                }}
                onSelectPlayer={onSelectPlayer}
                touchFriendly
              />
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Box>

      {activeNomination && (
        <MobileNominationBar
          activeNomination={activeNomination}
          nominatedPlayer={nominatedPlayer}
          nominatedValue={nominatedValue}
          teams={teams}
          selfTeamId={selfTeamId}
          onBumpBid={onBumpBid}
          onSetBid={onSetBid}
          onAssignWinner={onAssignWinner}
          onPass={onPass}
          onSelectPlayer={onSelectPlayer}
          usingGenericValues={usingGenericValues}
        />
      )}
    </>
  );
}

interface MobileNominationBarProps {
  activeNomination: Doc<"draftNominations">;
  nominatedPlayer: { name: string; team: string | null } | undefined;
  nominatedValue: { dollarValue: number } | undefined;
  teams: Doc<"seasonTeams">[];
  selfTeamId: Id<"seasonTeams">;
  onBumpBid: (delta: number) => void;
  onSetBid: (amount: number) => void;
  onAssignWinner: (teamId: Id<"seasonTeams">) => void;
  onPass: () => void;
  onSelectPlayer: (fpid: number) => void;
  usingGenericValues: boolean;
}

function MobileNominationBar({
  activeNomination,
  nominatedPlayer,
  nominatedValue,
  teams,
  selfTeamId,
  onBumpBid,
  onSetBid,
  onAssignWinner,
  onPass,
  onSelectPlayer,
  usingGenericValues,
}: MobileNominationBarProps) {
  // Self team always listed first - it's the common case, and with the
  // dedicated "I won" button gone on mobile, picking it from this list is
  // now the only way to log a self-win.
  const orderedTeams = [
    ...teams.filter((team) => team._id === selfTeamId),
    ...teams.filter((team) => team._id !== selfTeamId),
  ];

  const [winnerTeamId, setWinnerTeamId] = useState<Id<"seasonTeams">>(
    selfTeamId,
  );
  const [bidDraft, setBidDraft] = useState<number | string>(
    activeNomination.currentBid,
  );
  const [editingBid, setEditingBid] = useState(false);

  useEffect(() => {
    setWinnerTeamId(selfTeamId);
  }, [activeNomination._id, selfTeamId]);

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

  return (
    <Box
      hiddenFrom="sm"
      pos="fixed"
      left={12}
      right={12}
      style={{
        bottom: "calc(90px + env(safe-area-inset-bottom))",
        zIndex: 200,
        maxWidth: 480,
        margin: "0 auto",
        padding: "var(--mantine-spacing-md)",
        borderRadius: "var(--mantine-radius-xl)",
        border: "1px solid var(--mantine-color-default-border)",
        // dark-6, the shade Mantine's Card component defaults to (see
        // Card.css) - this used to come from an inner <Card> nested inside
        // this Box (see the earlier commit that collapsed them into one
        // element), which is where the "slightly lighter" look came from.
        // var(--mantine-color-body) (dark-7) reads noticeably darker.
        background: "var(--mantine-color-dark-6)",
        boxShadow: "var(--mantine-shadow-lg)",
      }}
    >
      <Stack gap={10}>
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          {nominatedPlayer ? (
            <Text
              fw={700}
              truncate
              style={{ flex: 1, minWidth: 0 }}
              onClick={() => onSelectPlayer(activeNomination.fpid)}
            >
              {nominatedPlayer.name}
            </Text>
          ) : (
            <Text fw={700} truncate style={{ flex: 1, minWidth: 0 }}>
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
          {nominatedValue && (
            <Group gap={4} wrap="nowrap">
              <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                ~${Math.round(nominatedValue.dollarValue)}
              </Text>
              {usingGenericValues && <GenericValueBadge />}
            </Group>
          )}
        </Group>

        <Group gap={8} wrap="nowrap">
          <Select
            size="md"
            data={orderedTeams.map((team) => ({
              value: team._id,
              label: team.isSelf ? `${team.name} (me)` : team.name,
            }))}
            value={winnerTeamId}
            onChange={(value) =>
              value && setWinnerTeamId(value as Id<"seasonTeams">)
            }
            allowDeselect={false}
            style={{ flex: 1, minWidth: 0 }}
          />
          <ActionIcon size={40} variant="default" onClick={() => onBumpBid(-1)}>
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
            w={70}
            size="md"
            styles={{
              input: {
                fontFamily: "var(--mantine-font-family-monospace)",
                fontWeight: 700,
                textAlign: "center",
                color: "var(--mantine-color-saddlebrown-5)",
              },
            }}
          />
          <ActionIcon size={40} variant="default" onClick={() => onBumpBid(1)}>
            +
          </ActionIcon>
        </Group>

        <Group gap={8} wrap="nowrap">
          <Button
            size="md"
            color="saddlebrown"
            style={{ flex: 1 }}
            onClick={() => onAssignWinner(winnerTeamId)}
          >
            Assign
          </Button>
          <Button size="md" variant="subtle" color="gray" onClick={onPass}>
            Pass
          </Button>
        </Group>
      </Stack>
    </Box>
  );
}
