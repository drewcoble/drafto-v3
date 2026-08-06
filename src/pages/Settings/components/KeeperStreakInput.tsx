import { useEffect, useState } from "react";
import { Group, NumberInput } from "@mantine/core";
import { Check } from "lucide-react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { useSaveFlash } from "../../../hooks/useSaveFlash";

interface KeeperStreakCellProps {
  pick: Doc<"draftPicks">;
  onSetStreak: (pickId: Id<"draftPicks">, streak: number) => void;
  width?: number;
}

// Inline-editable "years kept" input - mirrors how setPickSlot lets a pick be
// corrected after the fact rather than requiring remove-and-re-add. Commits
// on blur (not per keystroke) so typing a multi-digit value doesn't fire a
// mutation after every digit. Shared between the desktop table and mobile
// card layouts (KeeperTable.tsx / KeeperCardList.tsx).
export function KeeperStreakCell({
  pick,
  onSetStreak,
  width = 70,
}: KeeperStreakCellProps) {
  const savedStreak = pick.keeperStreak ?? 1;
  const [value, setValue] = useState<number>(savedStreak);
  const [showSaved, flashSaved] = useSaveFlash();

  useEffect(() => {
    setValue(savedStreak);
  }, [savedStreak]);

  return (
    <Group gap={4} wrap="nowrap" align="flex-end">
      <NumberInput
        label="Yrs kept"
        size="xs"
        w={width}
        min={1}
        value={value}
        onChange={(next) => setValue(Number(next) || 1)}
        onBlur={() => {
          if (value !== savedStreak) {
            onSetStreak(pick._id, value);
            flashSaved();
          }
        }}
      />
      {showSaved && <Check size={14} color="var(--mantine-color-teal-6)" />}
    </Group>
  );
}
