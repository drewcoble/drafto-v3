import {
  Badge,
  Button,
  Chip,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { CountStepper, EditableNumberStepper } from "../../../components/NumberStepper";
import { POSITIONS, type Position, type ScoringFormat } from "../../../types";
import {
  POSITION_COLORS,
  positionColorOrDefault,
} from "../../../lib/positionColors";
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
  // Overrides the Save button's label - e.g. LeagueImportWizard.tsx uses
  // this form purely as the "review the imported settings" step of a bigger
  // multi-part create action, so "Save" alone would undersell what clicking
  // it actually does.
  saveLabel?: string;
  // True once this season's seasonTeams rows already exist - the Teams
  // count can only change in lockstep with those rows from that point on
  // (see convex/draft/teams.ts's removeSeasonTeam and updateSeason's guard
  // in convex/leagues.ts), so editing it here would just be rejected on
  // save.
  teamsLocked?: boolean;
}

export function SettingsForm({
  form,
  onChange,
  error,
  isSaving,
  onSave,
  onCancel,
  saveLabel = "Save",
  teamsLocked = false,
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
      <Group grow align="flex-start">
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Teams
          </Text>
          {teamsLocked ? (
            <Text size="xs" c="dimmed">
              Managed from the Teams panel
            </Text>
          ) : null}
          <CountStepper
            label="Teams"
            min={1}
            value={form.teamCount}
            onChange={(value) =>
              onChange({ ...form, teamCount: value ?? form.teamCount })
            }
            disabled={teamsLocked}
          />
        </Stack>
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Salary Cap
          </Text>
          <EditableNumberStepper
            label="Salary Cap"
            min={1}
            prefix="$"
            value={form.salaryCap}
            onChange={(value) =>
              onChange({ ...form, salaryCap: value ?? form.salaryCap })
            }
          />
        </Stack>
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
            <Stack key={key} gap={4}>
              <Badge
                size="sm"
                variant="light"
                color={positionColorOrDefault(key)}
                style={{ alignSelf: "flex-start" }}
              >
                {key}
              </Badge>
              <CountStepper
                label={key}
                value={form.rosterSlots[key]}
                onChange={(value) =>
                  onChange({
                    ...form,
                    rosterSlots: {
                      ...form.rosterSlots,
                      [key]: value ?? 0,
                    },
                  })
                }
              />
            </Stack>
          ))}
        </SimpleGrid>
      </Stack>
      {form.rosterSlots.FLEX > 0 && (
        <Stack gap={6}>
          <Group gap={6} wrap="nowrap">
            <Badge size="sm" variant="light" color={positionColorOrDefault("FLEX")}>
              FLEX
            </Badge>
            <Text size="sm" fw={500}>
              eligible positions
            </Text>
          </Group>
          <Chip.Group
            multiple
            value={form.flexPositions}
            onChange={(value) =>
              onChange({ ...form, flexPositions: value as Position[] })
            }
          >
            <Group gap="xs">
              {POSITIONS.map((pos) => (
                <Chip key={pos} value={pos} color={POSITION_COLORS[pos]}>
                  {pos}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </Stack>
      )}
      {form.rosterSlots.SUPERFLEX > 0 && (
        <Stack gap={6}>
          <Group gap={6} wrap="nowrap">
            <Badge
              size="sm"
              variant="light"
              color={positionColorOrDefault("SUPERFLEX")}
            >
              SUPERFLEX
            </Badge>
            <Text size="sm" fw={500}>
              eligible positions
            </Text>
          </Group>
          <Chip.Group
            multiple
            value={form.superflexPositions}
            onChange={(value) =>
              onChange({ ...form, superflexPositions: value as Position[] })
            }
          >
            <Group gap="xs">
              {POSITIONS.map((pos) => (
                <Chip key={pos} value={pos} color={POSITION_COLORS[pos]}>
                  {pos}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </Stack>
      )}
      {error && (
        <Text c="red" size="sm">
          {error}
        </Text>
      )}
      <Group>
        <Button onClick={onSave} loading={isSaving}>
          {saveLabel}
        </Button>
        <Button variant="default" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </Group>
    </Stack>
  );
}
