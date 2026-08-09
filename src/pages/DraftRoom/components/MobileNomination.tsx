import { useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Drawer,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { UserPlus, X } from "lucide-react";
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
  turnTeamName: string | undefined;
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
// and opens a bottom drawer with the search/nominate form; once a player is
// nominated the drawer closes itself and a floating bar takes over above
// the bottom nav with the live bid + winner controls, so the auction can be
// run one-handed without digging through a tab.
export function MobileNomination({
  nominationOrderEnabled,
  turnTeamId,
  turnTeamName,
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hasActiveNomination = !!activeNomination;

  // Auto-close the search drawer the moment a nomination lands - the
  // floating bar below takes over from here.
  useEffect(() => {
    if (hasActiveNomination) setDrawerOpen(false);
  }, [hasActiveNomination]);

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
          disabled={!!activeNomination}
          aria-label={drawerOpen ? "Close nominate a player" : "Nominate a player"}
          onClick={() => setDrawerOpen((open) => !open)}
          style={{
            boxShadow: "var(--mantine-shadow-lg)",
            // Lightest saddlebrown shade, mostly transparent - a subtle
            // rim rather than the solid body-colored cutout ring this used
            // to be.
            border:
              "3px solid color-mix(in srgb, var(--mantine-color-saddlebrown-0) 25%, transparent)",
            // Lighter than "filled" (shade 5 instead of 7) for more
            // presence against the frosted bar underneath it, still
            // translucent to match (see BottomNav.tsx).
            background:
              "color-mix(in srgb, var(--mantine-color-saddlebrown-5) 65%, transparent)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
        >
          {drawerOpen ? <X size={24} /> : <UserPlus size={24} />}
        </ActionIcon>
      </Box>

      <Drawer
        opened={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        position="bottom"
        title="Nominate a player"
        size="auto"
        hiddenFrom="sm"
      >
        <Stack gap="sm">
          {usingGenericValues && (
            <Group gap={4} wrap="nowrap">
              <Text size="xs" c="dimmed">
                Values shown are estimates
              </Text>
              <GenericValueBadge />
            </Group>
          )}
          {nominationOrderEnabled && (
            <Group gap={6} wrap="nowrap">
              <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                {turnTeamName ? `${turnTeamName}'s turn` : "Manual turn"}
              </Text>
              <Select
                size="xs"
                w={140}
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
          <SearchBody
            search={search}
            onSearchChange={onSearchChange}
            searchResults={searchResults}
            draftValueByFpid={draftValueByFpid}
            onNominate={(fpid) => {
              onNominate(fpid);
              setDrawerOpen(false);
            }}
            onSelectPlayer={onSelectPlayer}
          />
        </Stack>
      </Drawer>

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
        borderRadius: "var(--mantine-radius-xl)",
        border: "1px solid var(--mantine-color-default-border)",
        background: "var(--mantine-color-body)",
        boxShadow: "var(--mantine-shadow-lg)",
      }}
    >
      <Card padding="md" radius="xl">
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
      </Card>
    </Box>
  );
}
