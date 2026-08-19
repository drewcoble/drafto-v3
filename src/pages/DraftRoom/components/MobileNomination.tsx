import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Drawer,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  UserPlus,
  X,
} from "lucide-react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { POSITION_COLORS } from "../../../lib/positionColors";
import { GenericValueBadge } from "../../../components/GenericValueBadge";
import {
  BOTTOM_NAV_BOTTOM_OFFSET,
  BOTTOM_NAV_HEIGHT,
} from "../../../constants/general";
import { useHoldRepeat } from "../../../hooks/useHoldRepeat";
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

type SheetMode = "closed" | "search" | "assign";

// Bottom offset shared by both minimized "peek" cards below - flush against
// the top edge of BottomNav's own pill (no gap). BottomNav's top corners
// stay rounded ("xl") whether or not a peek card is showing - see
// PeekCard's own corner-fill patches below for how the seam still reads as
// gapless despite that.
const PEEK_BOTTOM_OFFSET = `calc(${BOTTOM_NAV_BOTTOM_OFFSET}px + ${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`;

// How far above the screen's bottom edge the Drawer's own sheet stops -
// BottomNav's rendered height/offset plus a small gap, so the sheet never
// overlaps (and BottomNav - see its own higher z-index below - stays fully
// visible and tappable for in-app navigation while the sheet's open).
const DRAWER_BOTTOM_OFFSET = `calc(${BOTTOM_NAV_BOTTOM_OFFSET}px + ${BOTTOM_NAV_HEIGHT}px + 8px + env(safe-area-inset-bottom))`;

// How far down the drag handle has to travel before release counts as a
// swipe-to-dismiss rather than a tap or an aborted drag.
const DRAG_DISMISS_THRESHOLD = 80;

// Lets the small handle bar at the top of the Drawer double as a
// swipe-down-to-dismiss target, the native bottom-sheet convention. `dragY`
// tracks the pointer 1:1 (for the content below to visually follow the
// finger) and past DRAG_DISMISS_THRESHOLD on release, `onDismiss` fires -
// same as tapping the scrim or pressing Escape.
function useSwipeToDismiss(onDismiss: () => void) {
  const [dragY, setDragY] = useState(0);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);

  const endDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (dragY > DRAG_DISMISS_THRESHOLD) onDismiss();
    setDragY(0);
  };

  return {
    dragY,
    dragHandleProps: {
      onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
        draggingRef.current = true;
        startYRef.current = event.clientY;
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!draggingRef.current) return;
        setDragY(Math.max(0, event.clientY - startYRef.current));
      },
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}

// Mobile replacement for the desktop NominationPanel card (hidden below the
// "sm" breakpoint via visibleFrom="sm" on that component - see
// DraftTopBar.tsx). A gavel FAB sits over the center of the bottom nav bar
// and drives a single bottom Drawer that's shared by both the search/
// nominate form and the bid/assign controls, swapping bodies depending on
// `mode`. The Drawer can be minimized without losing the in-progress
// nomination/search - while minimized, a small floating "peek" card takes
// its place above the bottom nav so the auction can still be tracked
// one-handed without the sheet covering the rest of the screen.
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
  const [mode, setMode] = useState<SheetMode>("closed");
  const [minimized, setMinimized] = useState(false);
  const hasActiveNomination = !!activeNomination;

  // Mirrors the server: once a nomination lands (whether this device made it
  // or another team's client did), the sheet takes over in the expanded
  // assign state. Once it resolves/passes, drop back to fully closed rather
  // than lingering on a stale assign sheet - but leave an in-progress search
  // alone, since the absence of a nomination is the expected state while
  // searching for one to make.
  useEffect(() => {
    if (hasActiveNomination) {
      setMode("assign");
      setMinimized(false);
    } else {
      setMode((current) => (current === "assign" ? "closed" : current));
    }
  }, [hasActiveNomination]);

  // Guards the single render tick between the server clearing
  // activeNomination and the effect above catching up, so the sheet/peek
  // never flash stale assign content with nothing behind it.
  const effectiveMode: SheetMode =
    mode === "assign" && !activeNomination ? "closed" : mode;
  const sheetOpen = effectiveMode !== "closed" && !minimized;
  const peeking = effectiveMode !== "closed" && minimized;

  // Same "dismiss" the scrim tap and Escape key trigger, reused as the
  // swipe-to-close target below - search cancels outright, assign only
  // minimizes (the nomination itself is still live on the server).
  const dismiss = () => {
    if (effectiveMode === "search") {
      setMode("closed");
    } else {
      setMinimized(true);
    }
  };
  const { dragY, dragHandleProps } = useSwipeToDismiss(dismiss);

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

  const nominatingTeam = activeNomination
    ? teams.find((team) => team._id === activeNomination.nominatingTeamId)
    : undefined;

  let fabIcon: ReactNode = <UserPlus size={24} />;
  let fabLabel = "Nominate a player";
  let fabAction = () => setMode("search");
  if (effectiveMode === "search") {
    fabIcon = <X size={24} />;
    fabLabel = "Close nominate a player";
    fabAction = () => {
      setMode("closed");
      setMinimized(false);
    };
  } else if (effectiveMode === "assign" && !minimized) {
    fabIcon = <ChevronDown size={24} />;
    fabLabel = "Minimize nomination";
    fabAction = () => setMinimized(true);
  } else if (effectiveMode === "assign" && minimized) {
    fabIcon = <ChevronUp size={24} />;
    fabLabel = "Resume nomination";
    fabAction = () => setMinimized(false);
  }

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
        <ActionIcon
          radius="xl"
          size={56}
          color="saddlebrown"
          variant="filled"
          aria-label={fabLabel}
          onClick={fabAction}
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
          {fabIcon}
        </ActionIcon>
      </Box>

      <Drawer
        hiddenFrom="sm"
        opened={sheetOpen}
        onClose={dismiss}
        position="bottom"
        withCloseButton={false}
        size="50%"
        // Below BottomNav's own 200 (and the FAB's 210) rather than above
        // them, so the nav bar - and the FAB sitting in its notch - render
        // on top of both the sheet and its scrim instead of being covered
        // by them, keeping in-app navigation reachable while the sheet's
        // open. The sheet itself never occupies BottomNav's screen area
        // anyway (see DRAWER_BOTTOM_OFFSET below), so this only affects the
        // full-viewport scrim.
        zIndex={150}
        styles={{
          content: {
            maxWidth: 480,
            margin: `0 auto ${DRAWER_BOTTOM_OFFSET}`,
            borderTopLeftRadius: "var(--mantine-radius-xl)",
            borderTopRightRadius: "var(--mantine-radius-xl)",
            overflow: "hidden",
          },
          body: {
            height: "100%",
            padding: 0,
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        {/* Follows the drag handle 1:1 while dragging (see
            useSwipeToDismiss) and snaps back once released below the
            dismiss threshold - Content itself (background/rounded corners/
            Mantine's own open/close transition) stays untouched so this
            never fights that transition's own transform. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
            transform: `translateY(${dragY}px)`,
            transition: dragY === 0 ? "transform 200ms ease" : "none",
          }}
        >
          <div
            {...dragHandleProps}
            aria-hidden
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "10px 0 6px",
              flexShrink: 0,
              touchAction: "none",
              cursor: "grab",
            }}
          >
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: 999,
                background: "var(--mantine-color-default-border)",
              }}
            />
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding:
                "0 var(--mantine-spacing-md) calc(var(--mantine-spacing-md) + env(safe-area-inset-bottom))",
            }}
          >
            {effectiveMode === "search" && (
              <Stack gap={10}>
                <Group justify="space-between" wrap="nowrap">
                  <Text fw={700} size="lg">
                    Nominate a Player
                  </Text>
                  <Group gap={6} wrap="nowrap">
                    <ActionIcon
                      variant="default"
                      radius="xl"
                      onClick={() => setMinimized(true)}
                      aria-label="Minimize"
                      title="Minimize - keeps your search in progress"
                    >
                      <ChevronDown size={18} />
                    </ActionIcon>
                    <ActionIcon
                      variant="default"
                      radius="xl"
                      onClick={() => setMode("closed")}
                      aria-label="Close"
                    >
                      <X size={18} />
                    </ActionIcon>
                  </Group>
                </Group>

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
                      {/* Manual isn't part of the team cycle above (the arrows
                      only ever bump between actual teams), so it needs its
                      own explicit way in. */}
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
                    setMode("closed");
                    setMinimized(false);
                  }}
                  onSelectPlayer={onSelectPlayer}
                  touchFriendly
                />
              </Stack>
            )}

            {effectiveMode === "assign" && activeNomination && (
              <AssignDrawerBody
                activeNomination={activeNomination}
                nominatedPlayer={nominatedPlayer}
                nominatedValue={nominatedValue}
                nominatingTeam={nominatingTeam}
                teams={teams}
                selfTeamId={selfTeamId}
                onBumpBid={onBumpBid}
                onSetBid={onSetBid}
                onAssignWinner={onAssignWinner}
                onPass={onPass}
                onSelectPlayer={onSelectPlayer}
                usingGenericValues={usingGenericValues}
                onMinimize={() => setMinimized(true)}
              />
            )}
          </div>
        </div>
      </Drawer>

      {peeking && effectiveMode === "search" && (
        <SearchPeekCard
          label={
            nominationOrderEnabled
              ? `${currentTeamName ?? "Manual"} is nominating`
              : "Search a player to nominate"
          }
          onClick={() => setMinimized(false)}
        />
      )}

      {peeking && effectiveMode === "assign" && activeNomination && (
        <AssignPeekCard
          activeNomination={activeNomination}
          nominatedPlayer={nominatedPlayer}
          nominatedValue={nominatedValue}
          usingGenericValues={usingGenericValues}
          onClick={() => setMinimized(false)}
        />
      )}
    </>
  );
}

interface AssignDrawerBodyProps {
  activeNomination: Doc<"draftNominations">;
  nominatedPlayer: { name: string; team: string | null } | undefined;
  nominatedValue: { dollarValue: number } | undefined;
  nominatingTeam: Doc<"seasonTeams"> | undefined;
  teams: Doc<"seasonTeams">[];
  selfTeamId: Id<"seasonTeams">;
  onBumpBid: (delta: number) => void;
  onSetBid: (amount: number) => void;
  onAssignWinner: (teamId: Id<"seasonTeams">) => void;
  onPass: () => void;
  onSelectPlayer: (fpid: number) => void;
  usingGenericValues: boolean;
  onMinimize: () => void;
}

function AssignDrawerBody({
  activeNomination,
  nominatedPlayer,
  nominatedValue,
  nominatingTeam,
  teams,
  selfTeamId,
  onBumpBid,
  onSetBid,
  onAssignWinner,
  onPass,
  onSelectPlayer,
  usingGenericValues,
  onMinimize,
}: AssignDrawerBodyProps) {
  // Self team always listed first - it's the common case, and with the
  // dedicated "I won" button gone on mobile, picking it from this list is
  // now the only way to log a self-win.
  const orderedTeams = [
    ...teams.filter((team) => team._id === selfTeamId),
    ...teams.filter((team) => team._id !== selfTeamId),
  ];

  const [winnerTeamId, setWinnerTeamId] =
    useState<Id<"seasonTeams">>(selfTeamId);
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

  const decrementBidHold = useHoldRepeat(() => onBumpBid(-1));
  const incrementBidHold = useHoldRepeat(() => onBumpBid(1));

  return (
    <Stack gap={10}>
      <Group justify="space-between" align="center" wrap="nowrap">
        <Text size="xs" c="dimmed">
          {nominatingTeam
            ? `Nominated by ${nominatingTeam.name}`
            : "Active nomination"}
        </Text>
        <ActionIcon
          variant="default"
          radius="xl"
          onClick={onMinimize}
          aria-label="Minimize"
          title="Minimize - keeps this nomination in view"
        >
          <ChevronDown size={18} />
        </ActionIcon>
      </Group>

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
        <ActionIcon
          size={40}
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
        <ActionIcon
          size={40}
          variant="default"
          onClick={() => onBumpBid(1)}
          {...incrementBidHold}
        >
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
  );
}

// Same background as BottomNav.tsx (not Card/Popover's) - shared by the peek
// card itself and its corner-fill patches below so all three are
// indistinguishable from BottomNav at the shared edge.
const PEEK_CARD_BACKGROUND =
  "light-dark(color-mix(in srgb, var(--mantine-color-body) 65%, transparent), color-mix(in srgb, var(--mantine-color-dark-5) 50%, transparent))";

// BottomNav keeps its own "xl" corner radius on every corner, always (see
// BottomNav.tsx) - it doesn't know or care whether a peek card is attached
// above it. That radius doesn't reach BottomNav's full width until this many
// px down from its top edge, so a peek card flush against that top edge with
// square bottom corners would leave a curved gap open at each side, right
// where BottomNav's own corner hasn't squared off yet.
function CornerFillPatch({ side }: { side: "left" | "right" }) {
  return (
    <Box
      pos="absolute"
      bottom="calc(-1 * var(--mantine-radius-xl))"
      {...(side === "left" ? { left: 0 } : { right: 0 })}
      style={{
        width: "var(--mantine-radius-xl)",
        height: "var(--mantine-radius-xl)",
        // Transparent inside BottomNav's own corner circle (so its rendered
        // pixels/border show through untouched), solid everywhere else in
        // this square - i.e. exactly the sliver BottomNav's rounding cuts
        // away outside that circle. A hard-edged (not soft) stop, since this
        // is tracing a real geometric boundary, not fading a gradient.
        background: `radial-gradient(circle at bottom ${side}, transparent var(--mantine-radius-xl), ${PEEK_CARD_BACKGROUND} var(--mantine-radius-xl))`,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        pointerEvents: "none",
      }}
    />
  );
}

// Shared floating-card chrome for both minimized states below - same frosted
// glass treatment as BottomNav.tsx/AppHeader.tsx and the drawer it stands in
// for while minimized.
function PeekCard({
  children,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <Box
      hiddenFrom="sm"
      pos="fixed"
      left={12}
      right={12}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onClick();
      }}
      style={{
        bottom: PEEK_BOTTOM_OFFSET,
        zIndex: 205,
        maxWidth: 480,
        margin: "0 auto",
        padding: "10px 14px",
        position: "relative",
        // Rounded on top only, flat where it butts against BottomNav's own
        // rounded top edge - the corner-fill patches above are what make
        // that square edge still read as gapless against BottomNav's own
        // curve, rather than trying to round to match it (which would just
        // relocate the gap rather than close it).
        borderTopLeftRadius: "var(--mantine-radius-xl)",
        borderTopRightRadius: "var(--mantine-radius-xl)",
        borderLeft: "1px solid var(--mantine-color-default-border)",
        borderRight: "1px solid var(--mantine-color-default-border)",
        borderTop: "1px solid var(--mantine-color-default-border)",
        background: PEEK_CARD_BACKGROUND,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        cursor: "pointer",
      }}
    >
      <CornerFillPatch side="left" />
      <CornerFillPatch side="right" />
      {children}
    </Box>
  );
}

function SearchPeekCard({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <PeekCard onClick={onClick} ariaLabel="Resume nominating a player">
      <Group gap={8} wrap="nowrap" justify="space-between">
        <Text size="sm" fw={600} truncate style={{ flex: 1, minWidth: 0 }}>
          {label}
        </Text>
        <ChevronUp size={16} />
      </Group>
    </PeekCard>
  );
}

interface AssignPeekCardProps {
  activeNomination: Doc<"draftNominations">;
  nominatedPlayer: { name: string; team: string | null } | undefined;
  nominatedValue: { dollarValue: number } | undefined;
  usingGenericValues: boolean;
  onClick: () => void;
}

function AssignPeekCard({
  activeNomination,
  nominatedPlayer,
  nominatedValue,
  usingGenericValues,
  onClick,
}: AssignPeekCardProps) {
  return (
    <PeekCard onClick={onClick} ariaLabel="Resume nomination">
      <Group gap={10} wrap="nowrap">
        <Badge
          size="sm"
          variant="light"
          color={POSITION_COLORS[activeNomination.position]}
        >
          {activeNomination.position}
        </Badge>
        <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600} truncate>
            {nominatedPlayer?.name ?? `Player #${activeNomination.fpid}`}
          </Text>
          {nominatedValue && (
            <Group gap={4} wrap="nowrap">
              <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                ~${Math.round(nominatedValue.dollarValue)}
              </Text>
              {usingGenericValues && <GenericValueBadge />}
            </Group>
          )}
        </Stack>
        <Text
          size="md"
          fw={700}
          style={{ color: "var(--mantine-color-saddlebrown-5)" }}
        >
          ${activeNomination.currentBid}
        </Text>
        <ChevronUp size={16} />
      </Group>
    </PeekCard>
  );
}
