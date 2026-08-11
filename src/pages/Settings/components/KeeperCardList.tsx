import { useMemo } from "react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Card,
  Group,
  Stack,
  Text,
} from "@mantine/core";
import { Pencil, Trash2 } from "lucide-react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { POSITION_COLORS } from "../../../lib/positionColors";

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
// hiddenFrom="sm" on this component - see KeepersTab.tsx). Deliberately a
// compact read-only summary rather than inline dropdowns/steppers per card
// - team/price/streak are all edited through KeeperEditModal.tsx instead,
// opened via the pencil icon here. Roster slot assignment isn't shown at
// all anymore - now that My Team is browsable pre-draft too, that's handled
// there instead of duplicating a slot picker on this page.
export function KeeperCardList({
  keepers,
  nameByFpid,
  teams,
  onRemove,
  onEdit,
  onSelectPlayer,
  showStreakInput,
}: KeeperCardListProps) {
  const teamNameById = useMemo(
    () => new Map(teams.map((team) => [team._id, team.name])),
    [teams],
  );

  if (keepers.length === 0) return null;

  return (
    <Stack gap="sm" hiddenFrom="sm">
      {keepers.map((pick) => {
        const streak = pick.keeperStreak ?? 1;
        return (
          <Card key={pick._id} withBorder padding="sm" radius="md">
            <Group justify="space-between" wrap="nowrap" align="center">
              <Group gap={6} wrap="wrap" style={{ minWidth: 0 }}>
                <Badge variant="light" color={POSITION_COLORS[pick.position]}>
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
                  variant="subtle"
                  color="gray"
                  aria-label="Edit keeper"
                  onClick={() => onEdit(pick)}
                >
                  <Pencil size={16} />
                </ActionIcon>
                <ActionIcon
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
              {teamNameById.get(pick.teamId) ?? "—"} · ${pick.price}
              {showStreakInput
                ? ` · ${streak} yr${streak === 1 ? "" : "s"} kept`
                : ""}
            </Text>
          </Card>
        );
      })}
    </Stack>
  );
}
