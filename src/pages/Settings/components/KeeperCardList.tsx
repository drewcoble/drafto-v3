import { useMemo } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Card,
  Divider,
  Group,
  Stack,
  Text,
} from "@mantine/core";
import { Pencil, Trash2 } from "lucide-react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { POSITION_COLORS } from "../../../lib/positionColors";
import { STEPPER_BUTTON_SIZE } from "../../../constants/general";

interface KeeperCardListProps {
  keepers: Doc<"draftPicks">[];
  nameByFpid: Map<number, { name: string; team: string | null }>;
  teams: { _id: Id<"seasonTeams">; name: string }[];
  onRemove: (pickId: Id<"draftPicks">) => void;
  onEdit: (pick: Doc<"draftPicks">) => void;
  onSelectPlayer: (fpid: number) => void;
  // Gates the "Yrs kept" line below - true when the league has a
  // maxConsecutiveYears cap set (see schema.ts's trackConsecutiveYears
  // comment).
  showStreakInput: boolean;
}

// Mobile replacement for KeeperTable.tsx (hidden from "sm" up via
// hiddenFrom="sm" on this component - see KeepersTab.tsx). One card per
// team - each kept player is a row inside that team's card rather than its
// own card, so adding a second keeper to a team grows the existing card
// instead of adding a new one. Deliberately a compact read-only summary
// rather than inline dropdowns/steppers per row - team/price/streak are all
// edited through KeeperEditModal.tsx instead, opened via the pencil icon
// here. Roster slot assignment isn't shown at all anymore - now that My
// Team is browsable pre-draft too, that's handled there instead of
// duplicating a slot picker on this page.
export function KeeperCardList({
  keepers,
  nameByFpid,
  teams,
  onRemove,
  onEdit,
  onSelectPlayer,
  showStreakInput,
}: KeeperCardListProps) {
  const keepersByTeamId = useMemo(() => {
    const map = new Map<Id<"seasonTeams">, Doc<"draftPicks">[]>();
    for (const pick of keepers) {
      const list = map.get(pick.teamId);
      if (list) {
        list.push(pick);
      } else {
        map.set(pick.teamId, [pick]);
      }
    }
    return map;
  }, [keepers]);

  if (keepers.length === 0) return null;

  return (
    <Stack gap="sm" hiddenFrom="sm">
      {teams.map((team) => {
        const teamKeepers = keepersByTeamId.get(team._id);
        if (!teamKeepers || teamKeepers.length === 0) return null;

        const totalCost = teamKeepers.reduce(
          (sum, pick) => sum + pick.price,
          0,
        );

        return (
          <Card key={team._id} withBorder padding="sm" radius="md">
            <Stack gap={2} mb="xs">
              <Text fw={600}>{team.name}</Text>
              <Text size="sm" c="dimmed">
                {teamKeepers.length} keeper{teamKeepers.length === 1 ? "" : "s"}{" "}
                · ${totalCost}
              </Text>
            </Stack>
            <Stack gap="xs">
              {teamKeepers.map((pick, index) => {
                const streak = pick.keeperStreak ?? 1;
                return (
                  <Stack key={pick._id} gap={0}>
                    {index > 0 && <Divider mb="xs" />}
                    <Group justify="space-between" wrap="nowrap" align="center">
                      <Group gap={6} wrap="wrap" style={{ minWidth: 0 }}>
                        <Badge
                          variant="light"
                          color={POSITION_COLORS[pick.position]}
                        >
                          {pick.position}
                        </Badge>
                        <Anchor
                          component="button"
                          type="button"
                          fw={500}
                          onClick={() => onSelectPlayer(pick.fpid)}
                        >
                          {nameByFpid.get(pick.fpid)?.name ?? `#${pick.fpid}`}
                        </Anchor>
                      </Group>
                      <Group gap={4} wrap="nowrap">
                        <ActionIcon
                          size={STEPPER_BUTTON_SIZE}
                          variant="subtle"
                          color="gray"
                          aria-label="Edit keeper"
                          onClick={() => onEdit(pick)}
                        >
                          <Pencil size={16} />
                        </ActionIcon>
                        <ActionIcon
                          size={STEPPER_BUTTON_SIZE}
                          variant="subtle"
                          color="red"
                          aria-label="Remove keeper"
                          onClick={() => onRemove(pick._id)}
                        >
                          <Trash2 size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>
                    <Text size="sm" c="dimmed" mt={4}>
                      ${pick.price}
                      {showStreakInput
                        ? ` · ${streak} yr${streak === 1 ? "" : "s"} kept`
                        : ""}
                    </Text>
                  </Stack>
                );
              })}
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}
