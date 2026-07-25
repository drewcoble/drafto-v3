import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Badge,
  Button,
  Card,
  Center,
  Chip,
  Group,
  Loader,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { api } from "../../convex/_generated/api";
import { POSITIONS, type Position, type ScoringFormat } from "../types";

const ROSTER_SLOT_KEYS = [
  "QB",
  "RB",
  "WR",
  "TE",
  "DST",
  "FLEX",
  "BENCH",
] as const;

const SCORING_OPTIONS: Array<{ label: string; value: ScoringFormat }> = [
  { label: "No PPR", value: "STD" },
  { label: "Half PPR", value: "HALF" },
  { label: "PPR", value: "PPR" },
];

interface SettingsForm {
  name: string;
  teamCount: number;
  salaryCap: number;
  scoring: ScoringFormat;
  rosterSlots: Record<(typeof ROSTER_SLOT_KEYS)[number], number>;
  flexPositions: Position[];
  replacementFallbackPctPercent: number; // 0-100 in the UI, stored as 0-1
}

const DEFAULT_FORM: SettingsForm = {
  name: "Default $200/12-team",
  teamCount: 12,
  salaryCap: 200,
  scoring: "PPR",
  rosterSlots: { QB: 1, RB: 2, WR: 2, TE: 1, DST: 1, FLEX: 1, BENCH: 8 },
  flexPositions: ["RB", "WR", "TE"],
  replacementFallbackPctPercent: 90,
};

export function LeagueDetails() {
  const settingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const createSettings = useMutation(api.draftSettings.createDraftSettings);
  const updateSettings = useMutation(api.draftSettings.updateDraftSettings);

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<SettingsForm>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (settingsList === undefined) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  const settings = settingsList[0];

  const startEditing = () => {
    setForm(
      settings
        ? {
            name: settings.name,
            teamCount: settings.teamCount,
            salaryCap: settings.salaryCap,
            scoring: settings.scoring,
            rosterSlots: { ...settings.rosterSlots },
            flexPositions: [...settings.flexPositions],
            replacementFallbackPctPercent: Math.round(
              settings.replacementFallbackPct * 100,
            ),
          }
        : DEFAULT_FORM,
    );
    setError(null);
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        teamCount: form.teamCount,
        salaryCap: form.salaryCap,
        scoring: form.scoring,
        rosterSlots: form.rosterSlots,
        flexPositions: form.flexPositions,
        replacementFallbackPct: form.replacementFallbackPctPercent / 100,
      };
      if (settings) {
        await updateSettings({ id: settings._id, ...payload });
      } else {
        await createSettings(payload);
      }
      setIsEditing(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save settings.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <Stack gap="md" py="sm" maw={500}>
        <TextInput
          label="Name"
          value={form.name}
          onChange={(event) =>
            setForm({ ...form, name: event.currentTarget.value })
          }
        />
        <Group grow>
          <NumberInput
            label="Teams"
            min={1}
            value={form.teamCount}
            onChange={(value) =>
              setForm({ ...form, teamCount: Number(value) || 0 })
            }
          />
          <NumberInput
            label="Salary Cap"
            min={1}
            prefix="$"
            value={form.salaryCap}
            onChange={(value) =>
              setForm({ ...form, salaryCap: Number(value) || 0 })
            }
          />
        </Group>
        <Stack gap={6}>
          <Text size="sm" fw={500}>
            Scoring
          </Text>
          <SegmentedControl
            value={form.scoring}
            onChange={(value) =>
              setForm({ ...form, scoring: value as ScoringFormat })
            }
            data={SCORING_OPTIONS.map(({ label, value }) => ({
              label,
              value,
            }))}
          />
        </Stack>
        <Stack gap={6}>
          <Text size="sm" fw={500}>
            Roster Slots
          </Text>
          <SimpleGrid cols={4} spacing="sm">
            {ROSTER_SLOT_KEYS.map((key) => (
              <NumberInput
                key={key}
                label={key}
                min={0}
                value={form.rosterSlots[key]}
                onChange={(value) =>
                  setForm({
                    ...form,
                    rosterSlots: {
                      ...form.rosterSlots,
                      [key]: Number(value) || 0,
                    },
                  })
                }
              />
            ))}
          </SimpleGrid>
        </Stack>
        <Stack gap={6}>
          <Text size="sm" fw={500}>
            FLEX eligible positions
          </Text>
          <Chip.Group
            multiple
            value={form.flexPositions}
            onChange={(value) =>
              setForm({ ...form, flexPositions: value as Position[] })
            }
          >
            <Group gap="xs">
              {POSITIONS.map((pos) => (
                <Chip key={pos} value={pos}>
                  {pos}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </Stack>
        <NumberInput
          label="Replacement fallback %"
          description="Used when the real replacement-rank player isn't in the data yet"
          min={0}
          max={100}
          suffix="%"
          value={form.replacementFallbackPctPercent}
          onChange={(value) =>
            setForm({
              ...form,
              replacementFallbackPctPercent: Number(value) || 0,
            })
          }
        />
        {error && (
          <Text c="red" size="sm">
            {error}
          </Text>
        )}
        <Group>
          <Button onClick={handleSave} loading={isSaving}>
            Save
          </Button>
          <Button
            variant="default"
            onClick={() => setIsEditing(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
        </Group>
      </Stack>
    );
  }

  if (!settings) {
    return (
      <Stack gap="md" py="sm">
        <Text c="dimmed">No league settings configured yet.</Text>
        <Button onClick={startEditing} w="fit-content">
          Create League Settings
        </Button>
      </Stack>
    );
  }

  const rosterEntries = Object.entries(settings.rosterSlots);

  return (
    <Stack gap="md" py="sm">
      <Group justify="space-between" align="center">
        <Title order={4}>{settings.name}</Title>
        <Button variant="default" size="sm" onClick={startEditing}>
          Edit
        </Button>
      </Group>
      <SimpleGrid cols={3} spacing="md">
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            Teams
          </Text>
          <Text size="xl" fw={700}>
            {settings.teamCount}
          </Text>
        </Card>
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            Salary Cap
          </Text>
          <Text size="xl" fw={700}>
            ${settings.salaryCap}
          </Text>
        </Card>
        <Card withBorder padding="md">
          <Text size="sm" c="dimmed">
            Scoring
          </Text>
          <Text size="xl" fw={700}>
            {SCORING_OPTIONS.find((option) => option.value === settings.scoring)
              ?.label ?? settings.scoring}
          </Text>
        </Card>
      </SimpleGrid>
      <Stack gap={6}>
        <Text size="sm" c="dimmed">
          Roster Slots
        </Text>
        <Group gap="xs">
          {rosterEntries.map(([slot, count]) => (
            <Badge key={slot} variant="light" size="lg">
              {slot}: {count}
            </Badge>
          ))}
        </Group>
      </Stack>
      <Text size="sm" c="dimmed">
        FLEX eligible: {settings.flexPositions.join(", ")}
      </Text>
      <Text size="sm" c="dimmed">
        Replacement fallback:{" "}
        {Math.round(settings.replacementFallbackPct * 100)}% of the last
        available player, used when the real replacement-rank player isn't in
        the data yet
      </Text>
    </Stack>
  );
}
