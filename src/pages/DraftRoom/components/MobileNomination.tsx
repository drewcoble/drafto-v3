import { useEffect, useState } from "react";
import type { ReactNode } from "react";
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

// Bottom offset shared by both minimized "peek" cards below - anchored just
// above BottomNav's own pill, same spot the old always-expanded bar used to
// sit permanently.
const PEEK_BOTTOM_OFFSET = "calc(90px + env(safe-area-inset-bottom))";

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
        onClose={() => {
          if (effectiveMode === "search") {
            setMode("closed");
          } else {
            setMinimized(true);
          }
        }}
        position="bottom"
        withCloseButton={false}
        size="auto"
        zIndex={220}
        styles={{
          content: {
            maxWidth: 480,
            margin: "0 auto",
            maxHeight: "85vh",
            borderTopLeftRadius: "var(--mantine-radius-xl)",
            borderTopRightRadius: "var(--mantine-radius-xl)",
          },
          body: {
            paddingBottom:
              "calc(var(--mantine-spacing-md) + env(safe-area-inset-bottom))",
          },
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
        borderRadius: "var(--mantine-radius-xl)",
        border: "1px solid var(--mantine-color-default-border)",
        background:
          "light-dark(color-mix(in srgb, var(--mantine-color-gray-1) 65%, transparent), color-mix(in srgb, var(--mantine-color-dark-5) 50%, transparent))",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: "var(--mantine-shadow-lg)",
        cursor: "pointer",
      }}
    >
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
