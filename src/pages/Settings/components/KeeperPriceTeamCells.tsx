import { Group, Select } from "@mantine/core";
import { Check } from "lucide-react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { EditableNumberStepper } from "../../../components/NumberStepper";
import { useSaveFlash } from "../../../hooks/useSaveFlash";

interface KeeperPriceCellProps {
  pick: Doc<"draftPicks">;
  onSetPrice: (pickId: Id<"draftPicks">, price: number) => void;
}

// Inline-editable price - same "commits immediately, flashes a checkmark"
// pattern as KeeperStreakCell. 0 is a valid price (an undrafted/waiver
// pickup - see keeperCost.ts's computeKeeperCost), so no floor here.
export function KeeperPriceCell({ pick, onSetPrice }: KeeperPriceCellProps) {
  const [showSaved, flashSaved] = useSaveFlash();

  return (
    <Group gap={4} wrap="nowrap" align="center">
      <EditableNumberStepper
        label={`${pick.fpid} price`}
        min={0}
        width={80}
        size="xs"
        prefix="$"
        value={pick.price}
        onChange={(next) => {
          if (next === undefined || next === pick.price) return;
          onSetPrice(pick._id, next);
          flashSaved();
        }}
      />
      {showSaved && <Check size={14} color="var(--mantine-color-teal-6)" />}
    </Group>
  );
}

interface KeeperTeamCellProps {
  pick: Doc<"draftPicks">;
  teams: { _id: Id<"seasonTeams">; name: string }[];
  onSetTeam: (pickId: Id<"draftPicks">, teamId: Id<"seasonTeams">) => void;
}

// Inline-editable team assignment - lets a mis-assigned keeper (e.g. a
// Recommended Keepers quick-add whose team-name guess was wrong, or just a
// picker mistake) be corrected without removing and re-adding it.
export function KeeperTeamCell({
  pick,
  teams,
  onSetTeam,
}: KeeperTeamCellProps) {
  const [showSaved, flashSaved] = useSaveFlash();

  return (
    <Group gap={4} wrap="nowrap" align="center">
      <Select
        aria-label="Team"
        size="xs"
        w={150}
        allowDeselect={false}
        data={teams.map((team) => ({ value: team._id, label: team.name }))}
        value={pick.teamId}
        onChange={(value) => {
          if (!value || value === pick.teamId) return;
          onSetTeam(pick._id, value as Id<"seasonTeams">);
          flashSaved();
        }}
      />
      {showSaved && <Check size={14} color="var(--mantine-color-teal-6)" />}
    </Group>
  );
}
