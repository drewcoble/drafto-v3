import { Anchor, Badge, Button, Group, Menu, Stack, Text } from "@mantine/core";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { Position } from "../types";
import type { SlotDescriptor } from "../lib/rosterSlots";
import { eligibleSlotsForPosition } from "../lib/slotAssignment";
import { positionColorOrGray } from "../lib/positionColors";

interface TeamSlotDetailProps {
  slots: SlotDescriptor[];
  bySlot: Map<string, Doc<"draftPicks">>;
  nameByFpid: Map<number, { name: string; team: string | null }>;
  flexPositions?: readonly Position[];
  superflexPositions?: readonly Position[];
  onRemove?: (pickId: Id<"draftPicks">) => void;
  onMove?: (pickId: Id<"draftPicks">, slotKey: string) => void;
  onSelectPlayer?: (fpid: number) => void;
}

// Expandable per-slot roster breakdown for one team - used by both the live
// Draft Room's LeagueTab (with Remove/Move actions) and Settings'
// SeasonSummary (read-only, for a past season, which passes neither), so it
// lives in the shared components/ folder rather than either page. Move only
// renders when both onMove and flexPositions/superflexPositions are given -
// it needs those to work out which other slots this pick is even eligible
// for (e.g. bumping a flex-caliber RB2 down to FLEX to free up budget).
export function TeamSlotDetail({
  slots,
  bySlot,
  nameByFpid,
  flexPositions,
  superflexPositions,
  onRemove,
  onMove,
  onSelectPlayer,
}: TeamSlotDetailProps) {
  const canMove = onMove && flexPositions && superflexPositions;
  return (
    <Stack gap={4} mt="xs">
      {slots.map((slot) => {
        const pick = bySlot.get(slot.key);
        const player = pick ? nameByFpid.get(pick.fpid) : undefined;
        const moveTargets =
          canMove && pick
            ? eligibleSlotsForPosition(
                pick.position,
                slots,
                flexPositions,
                superflexPositions,
              ).filter((target) => target.key !== slot.key)
            : [];
        return (
          <Group key={slot.key} justify="space-between" gap="xs" wrap="nowrap">
            <Badge
              variant="light"
              size="sm"
              color={positionColorOrGray(slot.position)}
            >
              {slot.label}
            </Badge>
            <Text size="xs" c="dimmed" style={{ flex: 1 }}>
              {player && pick && onSelectPlayer ? (
                <Anchor
                  component="button"
                  type="button"
                  size="xs"
                  c="dimmed"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectPlayer(pick.fpid);
                  }}
                >
                  {player.name}
                </Anchor>
              ) : (
                (player?.name ?? "—")
              )}
              {pick ? ` · $${pick.price}` : ""}
              {pick?.isKeeper ? " (keeper)" : ""}
            </Text>
            {pick && canMove && moveTargets.length > 0 && (
              <Menu shadow="md" width={170} position="bottom-end">
                <Menu.Target>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Move
                  </Button>
                </Menu.Target>
                <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
                  {moveTargets.map((target) => {
                    const occupant = bySlot.get(target.key);
                    const occupantName = occupant
                      ? nameByFpid.get(occupant.fpid)?.name
                      : undefined;
                    return (
                      <Menu.Item
                        key={target.key}
                        onClick={() => onMove(pick._id, target.key)}
                      >
                        {target.label}
                        {occupantName ? ` (swap w/ ${occupantName})` : ""}
                      </Menu.Item>
                    );
                  })}
                </Menu.Dropdown>
              </Menu>
            )}
            {pick && onRemove && (
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(pick._id);
                }}
              >
                Remove
              </Button>
            )}
          </Group>
        );
      })}
    </Stack>
  );
}
