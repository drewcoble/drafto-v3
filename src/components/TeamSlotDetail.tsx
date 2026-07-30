import { Anchor, Badge, Button, Group, Stack, Text } from "@mantine/core";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { SlotDescriptor } from "../lib/rosterSlots";
import { positionColorOrGray } from "../lib/positionColors";

interface TeamSlotDetailProps {
  slots: SlotDescriptor[];
  bySlot: Map<string, Doc<"draftPicks">>;
  nameByFpid: Map<number, { name: string; team: string | null }>;
  onRemove?: (pickId: Id<"draftPicks">) => void;
  onSelectPlayer?: (fpid: number) => void;
}

// Expandable per-slot roster breakdown for one team - used by both the live
// Draft Room's LeagueTab (with a Remove action) and Settings' SeasonSummary
// (read-only, for a past season), so it lives in the shared components/
// folder rather than either page.
export function TeamSlotDetail({
  slots,
  bySlot,
  nameByFpid,
  onRemove,
  onSelectPlayer,
}: TeamSlotDetailProps) {
  return (
    <Stack gap={4} mt="xs">
      {slots.map((slot) => {
        const pick = bySlot.get(slot.key);
        const player = pick ? nameByFpid.get(pick.fpid) : undefined;
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
