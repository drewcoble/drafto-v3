import { useEffect, useState } from "react";
import { TextInput } from "@mantine/core";
import type { Doc } from "../../../../convex/_generated/dataModel";

interface TeamNameFieldProps {
  team: Doc<"draftTeams">;
  onRename: (name: string) => void;
}

// Saves on blur/Enter rather than on every keystroke - renaming shouldn't
// fire a mutation per character. Reverts the field to the team's current
// name instead of allowing an empty name, and re-syncs if the name changes
// from elsewhere (e.g. the mutation's own round-trip, or another tab).
export function TeamNameField({ team, onRename }: TeamNameFieldProps) {
  const [value, setValue] = useState(team.name);

  useEffect(() => {
    setValue(team.name);
  }, [team.name]);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== team.name) {
      onRename(trimmed);
    } else {
      setValue(team.name);
    }
  };

  return (
    <TextInput
      value={value}
      onChange={(event) => setValue(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      w={180}
    />
  );
}
