import { useEffect, useState } from "react";
import { NumberInput } from "@mantine/core";
import type { Doc } from "../../../../convex/_generated/dataModel";

interface TeamSalaryCapFieldProps {
  team: Doc<"draftTeams">;
  leagueSalaryCap: number;
  onSetSalaryCap: (salaryCap: number | null) => void;
}

// Mirrors TeamNameField's blur/Enter-commit pattern. Empty field means "use
// the league default" (salaryCapOverride absent) - shown as a placeholder
// rather than a value, and committing an empty field clears the override.
export function TeamSalaryCapField({
  team,
  leagueSalaryCap,
  onSetSalaryCap,
}: TeamSalaryCapFieldProps) {
  const [value, setValue] = useState<number | "">(
    team.salaryCapOverride ?? "",
  );

  useEffect(() => {
    setValue(team.salaryCapOverride ?? "");
  }, [team.salaryCapOverride]);

  const commit = () => {
    if (value === "") {
      if (team.salaryCapOverride !== undefined) onSetSalaryCap(null);
      return;
    }
    if (value !== team.salaryCapOverride) {
      onSetSalaryCap(value);
    }
  };

  return (
    <NumberInput
      value={value}
      onChange={(next) => setValue(next === "" ? "" : Number(next))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      placeholder={String(leagueSalaryCap)}
      min={1}
      prefix="$"
      w={100}
    />
  );
}
