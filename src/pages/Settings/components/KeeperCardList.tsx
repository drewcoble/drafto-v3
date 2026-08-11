import { useMemo } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Card,
  Group,
  Menu,
  Stack,
  Text,
} from "@mantine/core";
import { MoreVertical } from "lucide-react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { Position } from "../../../types";
import type { SlotDescriptor } from "../../../lib/rosterSlots";
import { eligibleSlotsForPosition } from "../../../lib/slotAssignment";
import { POSITION_COLORS } from "../../../lib/positionColors";
import { KeeperStreakCell } from "./KeeperStreakInput";
import { KeeperPriceCell, KeeperTeamCell } from "./KeeperPriceTeamCells";

interface KeeperCardListProps {
  keepers: Doc<"draftPicks">[];
  nameByFpid: Map<number, { name: string; team: string | null }>;
  teams: { _id: Id<"seasonTeams">; name: string }[];
  slots: SlotDescriptor[];
  flexPositions: readonly Position[];
  superflexPositions: readonly Position[];
  onRemove: (pickId: Id<"draftPicks">) => void;
  onSetStreak: (pickId: Id<"draftPicks">, streak: number) => void;
  onSetPrice: (pickId: Id<"draftPicks">, price: number) => void;
  onSetTeam: (pickId: Id<"draftPicks">, teamId: Id<"seasonTeams">) => void;
  onMove: (pickId: Id<"draftPicks">, slotKey: string) => void;
  onSelectPlayer: (fpid: number) => void;
  // Gates the "Yrs kept" editor below - true when the league has a
  // maxConsecutiveYears cap set (see schema.ts's trackConsecutiveYears
  // comment).
  showStreakInput: boolean;
}

// Mobile replacement for KeeperTable.tsx (hidden from "sm" up via
// hiddenFrom="sm" on this component - see KeepersTab.tsx). The desktop
// table's columns don't fit a phone width without horizontal scrolling, so
// each keeper gets its own card with the same data/actions stacked instead.
export function KeeperCardList({
  keepers,
  nameByFpid,
  teams,
  slots,
  flexPositions,
  superflexPositions,
  onRemove,
  onSetStreak,
  onSetPrice,
  onSetTeam,
  onMove,
  onSelectPlayer,
  showStreakInput,
}: KeeperCardListProps) {
  const slotLabelByKey = useMemo(
    () => new Map(slots.map((slot) => [slot.key, slot.label])),
    [slots],
  );

  // Same team-scoped occupant preview as KeeperTable.tsx - see that file's
  // comment on occupantByTeamAndSlot for why this is safe to key on keepers
  // alone.
  const occupantByTeamAndSlot = useMemo(() => {
    const map = new Map<string, Doc<"draftPicks">>();
    for (const pick of keepers) {
      if (pick.planSlotKey) {
        map.set(`${pick.teamId}|${pick.planSlotKey}`, pick);
      }
    }
    return map;
  }, [keepers]);

  if (keepers.length === 0) return null;

  return (
    <Stack gap="sm" hiddenFrom="sm">
      {keepers.map((pick) => {
        const moveTargets = eligibleSlotsForPosition(
          pick.position,
          slots,
          flexPositions,
          superflexPositions,
        ).filter((target) => target.key !== pick.planSlotKey);
        const currentSlotLabel = pick.planSlotKey
          ? (slotLabelByKey.get(pick.planSlotKey) ?? pick.planSlotKey)
          : undefined;

        return (
          <Card key={pick._id} withBorder padding="sm" radius="md">
            <Stack gap={8}>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Group gap={6} wrap="wrap" style={{ minWidth: 0 }}>
                  <Anchor
                    component="button"
                    type="button"
                    fw={500}
                    onClick={() => onSelectPlayer(pick.fpid)}
                  >
                    {nameByFpid.get(pick.fpid)?.name ?? `#${pick.fpid}`}
                  </Anchor>
                  <Badge variant="light" color={POSITION_COLORS[pick.position]}>
                    {pick.position}
                  </Badge>
                </Group>
                <Menu shadow="md" width={200} position="bottom-end">
                  <Menu.Target>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label="Keeper actions"
                    >
                      <MoreVertical size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {moveTargets.map((target) => {
                      const occupant = occupantByTeamAndSlot.get(
                        `${pick.teamId}|${target.key}`,
                      );
                      const occupantName = occupant
                        ? (nameByFpid.get(occupant.fpid)?.name ??
                          `#${occupant.fpid}`)
                        : undefined;
                      return (
                        <Menu.Item
                          key={target.key}
                          onClick={() => onMove(pick._id, target.key)}
                        >
                          Move to {target.label}
                          {occupantName ? ` (swap w/ ${occupantName})` : ""}
                        </Menu.Item>
                      );
                    })}
                    {moveTargets.length > 0 && <Menu.Divider />}
                    <Menu.Item color="red" onClick={() => onRemove(pick._id)}>
                      Remove
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>

              <Group gap={8} wrap="wrap">
                <KeeperTeamCell
                  pick={pick}
                  teams={teams}
                  onSetTeam={onSetTeam}
                />
                <KeeperPriceCell pick={pick} onSetPrice={onSetPrice} />
                {currentSlotLabel ? (
                  <Badge variant="light" color="gray">
                    {currentSlotLabel}
                  </Badge>
                ) : (
                  <Text size="xs" c="dimmed">
                    Unassigned
                  </Text>
                )}
              </Group>

              {showStreakInput && (
                <Group gap={6} wrap="nowrap">
                  <KeeperStreakCell pick={pick} onSetStreak={onSetStreak} />
                </Group>
              )}
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}
