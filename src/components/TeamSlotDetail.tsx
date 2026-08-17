import {
  ActionIcon,
  Anchor,
  Badge,
  Group,
  Menu,
  Stack,
  Text,
} from "@mantine/core";
import { MoreVertical } from "lucide-react";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { Position } from "../types";
import type { SlotDescriptor } from "../lib/rosterSlots";
import { eligibleSlotsForPosition } from "../lib/slotAssignment";
import { positionColorOrDefault } from "../lib/positionColors";
import { RookieBadge } from "./RookieBadge";
import { useRookieFpids } from "../hooks/useRookieFpids";

interface TeamSlotDetailProps {
  slots: SlotDescriptor[];
  bySlot: Map<string, Doc<"draftPicks">>;
  nameByFpid: Map<number, { name: string; team: string | null }>;
  flexPositions?: readonly Position[];
  superflexPositions?: readonly Position[];
  onRemove?: (pickId: Id<"draftPicks">) => void;
  onMove?: (pickId: Id<"draftPicks">, slotKey: string) => void;
  onSelectPlayer?: (fpid: number) => void;
  // Gates the "· Yr X" suffix on the Keeper badge below - true when the
  // league has a maxConsecutiveYears cap set (see schema.ts's
  // trackConsecutiveYears comment).
  trackConsecutiveYears: boolean;
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
  trackConsecutiveYears,
}: TeamSlotDetailProps) {
  const canMove = onMove && flexPositions && superflexPositions;
  const rookieFpids = useRookieFpids();
  return (
    <Stack gap={10} mt="xs">
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
        const hasActions =
          pick && ((canMove && moveTargets.length > 0) || onRemove);
        return (
          <Group
            key={slot.key}
            justify="space-between"
            gap="xs"
            wrap="nowrap"
            mih={36}
          >
            <Badge
              variant="light"
              size="sm"
              color={positionColorOrDefault(slot.label)}
            >
              {slot.label}
            </Badge>
            <Group gap={4} wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
              <Text size="xs" c="dimmed">
                {player && pick && onSelectPlayer ? (
                  <Anchor
                    component="button"
                    type="button"
                    size="xs"
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
                {pick && rookieFpids.has(pick.fpid) && <RookieBadge />}
                {pick ? ` · $${pick.price}` : ""}
              </Text>
              {pick?.isKeeper && (
                <Badge variant="light" color="gray" size="sm">
                  {trackConsecutiveYears
                    ? `Keeper · Yr ${pick.keeperStreak ?? 1}`
                    : "Keeper"}
                </Badge>
              )}
            </Group>
            {hasActions && (
              <Menu shadow="md" width={170} position="bottom-end">
                <Menu.Target>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={(event) => event.stopPropagation()}
                    aria-label="Slot actions"
                  >
                    <MoreVertical size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
                  {pick &&
                    canMove &&
                    moveTargets.map((target) => {
                      const occupant = bySlot.get(target.key);
                      const occupantName = occupant
                        ? nameByFpid.get(occupant.fpid)?.name
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
                  {pick && canMove && moveTargets.length > 0 && onRemove && (
                    <Menu.Divider />
                  )}
                  {pick && onRemove && (
                    <Menu.Item color="red" onClick={() => onRemove(pick._id)}>
                      Remove
                    </Menu.Item>
                  )}
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        );
      })}
    </Stack>
  );
}
