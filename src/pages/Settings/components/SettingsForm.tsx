import {
  Anchor,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { Link } from "@tanstack/react-router";
import {
  CountStepper,
  EditableNumberStepper,
} from "../../../components/NumberStepper";
import {
  POSITIONS,
  type Position,
  type ScoringFormat,
  type TeScoringFormat,
} from "../../../types";
import {
  POSITION_COLORS,
  positionColorOrDefault,
} from "../../../lib/positionColors";
import {
  PASSING_TD_OPTIONS,
  ROSTER_SLOT_KEYS,
  SCORING_OPTIONS,
  TE_SCORING_OPTIONS,
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
  // Only supplied by LeagueDetails.tsx's edit-an-existing-league usage -
  // the import wizards (LeagueImportWizard/YahooLeagueImportWizard) create
  // a brand-new league, which has no id yet to toggle useKeepers against.
  // Saves immediately on change (the same live mutation the old read-only
  // info card's Switch called directly), independent of this form's own
  // Save/Cancel - not part of `form`/onSave's payload.
  useKeepersControl?: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    error: string | null;
    // Locked read-only for free-plan owners - keepers is Pro-only (see
    // convex/leagues.ts's setUseKeepers, which rejects the flip
    // server-side too).
    disabled?: boolean;
  };
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
  useKeepersControl,
}: SettingsFormProps) {
  return (
    <Stack gap="md" py="sm" maw={500}>
      <Card withBorder padding="md">
        <Stack gap="md">
          <Title order={5}>League Basics</Title>
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
        </Stack>
      </Card>

      <Card withBorder padding="md">
        <Stack gap="md">
          <Title order={5}>Scoring</Title>
          <Stack gap={6}>
            <Text size="sm" fw={500}>
              Points per reception
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
              Passing TDs
            </Text>
            <SegmentedControl
              value={form.sixPointPassTds ? "6" : "4"}
              onChange={(value) =>
                onChange({ ...form, sixPointPassTds: value === "6" })
              }
              data={PASSING_TD_OPTIONS.map(({ label, value }) => ({
                label,
                value,
              }))}
            />
          </Stack>
          <Stack gap={6}>
            <Text size="sm" fw={500}>
              TE Premium
            </Text>
            <SegmentedControl
              value={form.teScoring}
              onChange={(value) =>
                onChange({ ...form, teScoring: value as TeScoringFormat })
              }
              data={TE_SCORING_OPTIONS.map(({ label, value }) => ({
                label,
                value,
              }))}
            />
          </Stack>
        </Stack>
      </Card>

      <Card withBorder padding="md">
        <Stack gap="md">
          <Title order={5}>Roster</Title>
          <Stack gap={6}>
            <Text size="sm" fw={500}>
              Roster Slots
            </Text>
            {/* 3 columns of CountSteppers (now STEPPER_BUTTON_SIZE-wide +/-
                buttons each) don't fit a mobile viewport without overlapping -
                2 up narrow, same 3 from "sm" up where there's room, to keep
                one slot's + button from crowding the next slot's - button. */}
            <SimpleGrid
              cols={{ base: 2, sm: 3 }}
              spacing="md"
              verticalSpacing="lg"
            >
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
            <>
              <Divider />
              <Stack gap={6}>
                <Group gap={6} wrap="nowrap">
                  <Badge
                    size="sm"
                    variant="light"
                    color={positionColorOrDefault("FLEX")}
                  >
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
            </>
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
        </Stack>
      </Card>

      {useKeepersControl && (
        <Card withBorder padding="md">
          <Stack gap="md">
            <Title order={5}>Keepers</Title>
            <Stack gap={4}>
              <Switch
                label="Use Keepers"
                description={
                  useKeepersControl.disabled ? (
                    <>
                      Pro only.{" "}
                      <Anchor component={Link} to="/billing" size="xs">
                        Upgrade to enable keepers.
                      </Anchor>
                    </>
                  ) : (
                    "Shows or hides the Keepers tab, where keeper rules are configured."
                  )
                }
                checked={useKeepersControl.checked}
                disabled={useKeepersControl.disabled}
                onChange={(event) =>
                  useKeepersControl.onChange(event.currentTarget.checked)
                }
              />
              {useKeepersControl.error && (
                <Text c="red" size="sm">
                  {useKeepersControl.error}
                </Text>
              )}
            </Stack>
          </Stack>
        </Card>
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
