import { Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { Import, Wrench } from "lucide-react";

interface LeagueCreateChoiceProps {
  onChooseCustom: () => void;
  onChooseSleeperImport: () => void;
  onCancel: () => void;
}

// First screen of the "+ New League" flow (see LeagueDetails.tsx) - a fork
// between today's blank-form setup and importing settings/teams from a real
// Sleeper league (see Part 4 of the plan doc / LeagueImportWizard.tsx).
// Yahoo import isn't offered yet - it depends on Part 3's OAuth flow.
export function LeagueCreateChoice({
  onChooseCustom,
  onChooseSleeperImport,
  onCancel,
}: LeagueCreateChoiceProps) {
  return (
    <Stack gap="md" py="sm" maw={500}>
      <Title order={4}>New League</Title>
      <Card withBorder padding="md">
        <Group justify="space-between" wrap="nowrap">
          <Stack gap={2}>
            <Text fw={500}>Custom Setup</Text>
            <Text size="sm" c="dimmed">
              Start from a blank league and set roster slots, scoring, and
              teams by hand.
            </Text>
          </Stack>
          <Button
            variant="default"
            leftSection={<Wrench size={16} />}
            onClick={onChooseCustom}
          >
            Start
          </Button>
        </Group>
      </Card>
      <Card withBorder padding="md">
        <Group justify="space-between" wrap="nowrap">
          <Stack gap={2}>
            <Text fw={500}>Import from Sleeper</Text>
            <Text size="sm" c="dimmed">
              Pull roster slots, scoring, and team names from a real Sleeper
              league, with an option to seed keeper suggestions from last
              season's roster.
            </Text>
          </Stack>
          <Button leftSection={<Import size={16} />} onClick={onChooseSleeperImport}>
            Import
          </Button>
        </Group>
      </Card>
      <Group>
        <Button variant="subtle" onClick={onCancel}>
          Cancel
        </Button>
      </Group>
    </Stack>
  );
}
