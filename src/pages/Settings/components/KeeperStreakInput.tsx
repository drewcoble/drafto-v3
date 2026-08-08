import { Group } from "@mantine/core";
import { Check } from "lucide-react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { CountStepper } from "../../../components/NumberStepper";
import { useSaveFlash } from "../../../hooks/useSaveFlash";

interface KeeperStreakCellProps {
  pick: Doc<"draftPicks">;
  onSetStreak: (pickId: Id<"draftPicks">, streak: number) => void;
}

// Inline-editable "years kept" stepper - mirrors how setPickSlot lets a pick
// be corrected after the fact rather than requiring remove-and-re-add. Each
// +/- click commits immediately (there's no typed draft to debounce, unlike
// the old NumberInput version). Shared between the desktop table and mobile
// card layouts (KeeperTable.tsx / KeeperCardList.tsx).
export function KeeperStreakCell({ pick, onSetStreak }: KeeperStreakCellProps) {
  const streak = pick.keeperStreak ?? 1;
  const [showSaved, flashSaved] = useSaveFlash();

  return (
    <Group gap={4} wrap="nowrap" align="center">
      <CountStepper
        size="xs"
        label="Yrs kept"
        min={1}
        value={streak}
        onChange={(next) => {
          if (next === undefined || next === streak) return;
          onSetStreak(pick._id, next);
          flashSaved();
        }}
      />
      {showSaved && <Check size={14} color="var(--mantine-color-teal-6)" />}
    </Group>
  );
}
