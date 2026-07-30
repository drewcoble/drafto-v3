import {
  Button,
  Chip,
  Group,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { POSITIONS, type Position, type ScoringFormat } from "../../../types";
import {
  ROSTER_SLOT_KEYS,
  SCORING_OPTIONS,
  type LeagueSettingsFormValues,
} from "../../../constants/leagueSettings";

interface SettingsFormProps {
  form: LeagueSettingsFormValues;
  onChange: (form: LeagueSettingsFormValues) => void;
  error: string | null;
  isSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function SettingsForm({
  form,
  onChange,
  error,
  isSaving,
  onSave,
  onCancel,
}: SettingsFormProps) {
  return (
    <Stack gap="md" py="sm" maw={500}>
      <TextInput
        label="Name"
        value={form.name}
        onChange={(event) =>
          onChange({ ...form, name: event.currentTarget.value })
        }
      />
      <Group grow>
        <NumberInput
          label="Teams"
          min={1}
          value={form.teamCount}
          onChange={(value) =>
            onChange({ ...form, teamCount: Number(value) || 0 })
          }
        />
        <NumberInput
          label="Salary Cap"
          min={1}
          prefix="$"
          value={form.salaryCap}
          onChange={(value) =>
            onChange({ ...form, salaryCap: Number(value) || 0 })
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
            onChange({ ...form, scoring: value as ScoringFormat })
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
                onChange({
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
            onChange({ ...form, flexPositions: value as Position[] })
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
      <Stack gap={6}>
        <Text size="sm" fw={500}>
          SUPERFLEX eligible positions
        </Text>
        <Chip.Group
          multiple
          value={form.superflexPositions}
          onChange={(value) =>
            onChange({ ...form, superflexPositions: value as Position[] })
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
      {error && (
        <Text c="red" size="sm">
          {error}
        </Text>
      )}
      <Group>
        <Button onClick={onSave} loading={isSaving}>
          Save
        </Button>
        <Button variant="default" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </Group>
    </Stack>
  );
}
