import { Badge, Button, Group, Stack, Text, TextInput } from "@mantine/core";
import type { Id } from "../../../../convex/_generated/dataModel";
import { SeasonSummary } from "../SeasonSummary";

interface SeasonLineageRow {
  _id: Id<"draftSettings">;
  season?: string;
  name: string;
}

interface SeasonHistoryPanelProps {
  seasonLineage: SeasonLineageRow[] | undefined;
  currentSettingsId: Id<"draftSettings">;
  historySeasonId: Id<"draftSettings"> | null;
  onSelectHistorySeason: (id: Id<"draftSettings"> | null) => void;
  isStartingSeason: boolean;
  onOpenStartSeason: () => void;
  onCancelStartSeason: () => void;
  nextSeasonName: string;
  onNextSeasonNameChange: (value: string) => void;
  nextSeasonLabel: string;
  onNextSeasonLabelChange: (value: string) => void;
  cloneError: string | null;
  isCloning: boolean;
  onStartSeason: () => void;
}

export function SeasonHistoryPanel({
  seasonLineage,
  currentSettingsId,
  historySeasonId,
  onSelectHistorySeason,
  isStartingSeason,
  onOpenStartSeason,
  onCancelStartSeason,
  nextSeasonName,
  onNextSeasonNameChange,
  nextSeasonLabel,
  onNextSeasonLabelChange,
  cloneError,
  isCloning,
  onStartSeason,
}: SeasonHistoryPanelProps) {
  return (
    <Stack gap={6}>
      <Group justify="space-between" align="center">
        <Text size="sm" fw={500}>
          Seasons
        </Text>
        {!isStartingSeason && (
          <Button size="compact-sm" variant="default" onClick={onOpenStartSeason}>
            Start Next Season
          </Button>
        )}
      </Group>
      <Group gap="xs">
        {(seasonLineage ?? []).map((row) => (
          <Badge
            key={row._id}
            size="lg"
            variant={row._id === currentSettingsId ? "filled" : "light"}
            style={{ cursor: "pointer" }}
            onClick={() =>
              onSelectHistorySeason(
                row._id === currentSettingsId
                  ? null
                  : historySeasonId === row._id
                    ? null
                    : row._id,
              )
            }
          >
            {row.season ?? row.name}
            {row._id === currentSettingsId ? " (current)" : ""}
          </Badge>
        ))}
      </Group>
      {isStartingSeason && (
        <Stack gap="sm" maw={420}>
          <TextInput
            label="New season's league name"
            value={nextSeasonName}
            onChange={(event) => onNextSeasonNameChange(event.currentTarget.value)}
          />
          <TextInput
            label="Season label"
            placeholder="e.g. 2027"
            value={nextSeasonLabel}
            onChange={(event) => onNextSeasonLabelChange(event.currentTarget.value)}
          />
          <Text size="xs" c="dimmed">
            Copies team count, cap, roster shape, scoring, teams, and your
            budget plan forward. Picks, keepers, and target/avoid tags start
            fresh.
          </Text>
          {cloneError && (
            <Text c="red" size="sm">
              {cloneError}
            </Text>
          )}
          <Group>
            <Button
              onClick={onStartSeason}
              loading={isCloning}
              disabled={!nextSeasonName.trim() || !nextSeasonLabel.trim()}
            >
              Start Season
            </Button>
            <Button
              variant="default"
              onClick={onCancelStartSeason}
              disabled={isCloning}
            >
              Cancel
            </Button>
          </Group>
        </Stack>
      )}
      {historySeasonId && historySeasonId !== currentSettingsId && (
        <SeasonSummary draftSettingsId={historySeasonId} />
      )}
    </Stack>
  );
}
