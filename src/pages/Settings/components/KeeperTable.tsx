import { useMemo } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Group,
  Menu,
  Table,
  Text,
} from "@mantine/core";
import { MoreVertical } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { Doc } from "../../../../convex/_generated/dataModel";
import type { Position } from "../../../types";
import type { SlotDescriptor } from "../../../lib/rosterSlots";
import { eligibleSlotsForPosition } from "../../../lib/slotAssignment";
import { POSITION_COLORS } from "../../../lib/positionColors";
import { KeeperStreakCell } from "./KeeperStreakInput";
import { KeeperPriceCell, KeeperTeamCell } from "./KeeperPriceTeamCells";

interface KeeperTableProps {
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
  // Gates the "Yrs kept" column below - true when the league has a
  // maxConsecutiveYears cap set (see schema.ts's trackConsecutiveYears
  // comment).
  showStreakInput: boolean;
}

export function KeeperTable({
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
}: KeeperTableProps) {
  const slotLabelByKey = useMemo(
    () => new Map(slots.map((slot) => [slot.key, slot.label])),
    [slots],
  );

  // Scoped by team - setPickSlot only swaps within the same team, so an
  // "occupant" preview mixing teams together would misreport who a move
  // actually bumps. Keyed on keepers alone (rather than every draftPick) is
  // fine here: this tab only ever runs pre-draft, before any live pick
  // could also be sitting in one of these slots.
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
    <Table.ScrollContainer minWidth={500} visibleFrom="sm">
      <Table>
        <Table.Tbody>
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
              <Table.Tr key={pick._id}>
                <Table.Td>
                  <Anchor
                    component="button"
                    type="button"
                    onClick={() => onSelectPlayer(pick.fpid)}
                  >
                    {nameByFpid.get(pick.fpid)?.name ?? `#${pick.fpid}`}
                  </Anchor>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color={POSITION_COLORS[pick.position]}>
                    {pick.position}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <KeeperTeamCell
                    pick={pick}
                    teams={teams}
                    onSetTeam={onSetTeam}
                  />
                </Table.Td>
                <Table.Td>
                  <KeeperPriceCell pick={pick} onSetPrice={onSetPrice} />
                </Table.Td>
                <Table.Td>
                  {currentSlotLabel ? (
                    <Badge variant="light" color="gray">
                      {currentSlotLabel}
                    </Badge>
                  ) : (
                    <Text size="xs" c="dimmed">
                      Unassigned
                    </Text>
                  )}
                </Table.Td>
                {showStreakInput && (
                  <Table.Td>
                    <KeeperStreakCell pick={pick} onSetStreak={onSetStreak} />
                  </Table.Td>
                )}
                <Table.Td>
                  <Group gap={4} wrap="nowrap" justify="flex-end">
                    <Menu shadow="md" width={170} position="bottom-end">
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
                        <Menu.Item
                          color="red"
                          onClick={() => onRemove(pick._id)}
                        >
                          Remove
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
