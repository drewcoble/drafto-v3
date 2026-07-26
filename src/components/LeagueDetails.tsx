import { useEffect, useState } from "react";
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
import type { Id } from "../../convex/_generated/dataModel";
import { POSITIONS, type Position, type ScoringFormat } from "../types";

const ROSTER_SLOT_KEYS = [
  "QB",
  "RB",
  "WR",
  "TE",
  "DST",
  "K",
  "FLEX",
  "SUPERFLEX",
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
  superflexPositions: Position[];
}

const DEFAULT_FORM: SettingsForm = {
  name: "Default $200/12-team",
  teamCount: 12,
  salaryCap: 200,
  scoring: "PPR",
  rosterSlots: {
    QB: 1,
    RB: 2,
    WR: 2,
    TE: 1,
    DST: 1,
    K: 0,
    FLEX: 1,
    SUPERFLEX: 0,
    BENCH: 8,
  },
  flexPositions: ["RB", "WR", "TE"],
  superflexPositions: ["QB", "RB", "WR", "TE"],
};

interface LeagueDetailsProps {
  selectedLeagueId: Id<"draftSettings"> | undefined;
  isCreatingLeague: boolean;
  onLeagueSaved: (id: Id<"draftSettings">) => void;
  onDoneCreating: () => void;
}

export function LeagueDetails({
  selectedLeagueId,
  isCreatingLeague,
  onLeagueSaved,
  onDoneCreating,
}: LeagueDetailsProps) {
  const settingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const createSettings = useMutation(api.draftSettings.createDraftSettings);
  const updateSettings = useMutation(api.draftSettings.updateDraftSettings);
  const draftTeams = useQuery(
    api.draft.teams.listDraftTeams,
    selectedLeagueId ? { draftSettingsId: selectedLeagueId } : "skip",
  );
  const initializeDraftTeams = useMutation(
    api.draft.teams.initializeDraftTeams,
  );

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<SettingsForm>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selfName, setSelfName] = useState("Me");
  const [opponentNames, setOpponentNames] = useState<string[]>([]);
  const [isSavingTeams, setIsSavingTeams] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  // Triggered by the "+ New League" option in the header dropdown, which can
  // fire regardless of which tab is currently active.
  useEffect(() => {
    if (isCreatingLeague) {
      setForm(DEFAULT_FORM);
      setError(null);
      setIsEditing(true);
    }
  }, [isCreatingLeague]);

  const settings = settingsList?.find(
    (league) => league._id === selectedLeagueId,
  );

  // Size the opponent-name inputs to this league's team count once it's
  // known - only relevant while no teams have been set up yet.
  useEffect(() => {
    if (!settings || draftTeams === undefined || draftTeams.length > 0) {
      return;
    }
    const opponentCount = Math.max(settings.teamCount - 1, 0);
    setOpponentNames((current) =>
      current.length === opponentCount
        ? current
        : Array.from({ length: opponentCount }, () => ""),
    );
  }, [settings, draftTeams]);

  if (settingsList === undefined) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

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
            superflexPositions: [...settings.superflexPositions],
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
        superflexPositions: form.superflexPositions,
      };
      if (isCreatingLeague || !settings) {
        const newId = await createSettings(payload);
        onLeagueSaved(newId);
      } else {
        await updateSettings({ id: settings._id, ...payload });
        onLeagueSaved(settings._id);
      }
      onDoneCreating();
      setIsEditing(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save settings.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTeams = async () => {
    if (!settings) return;
    setIsSavingTeams(true);
    setTeamsError(null);
    try {
      await initializeDraftTeams({
        draftSettingsId: settings._id,
        selfName,
        opponentNames,
      });
    } catch (err) {
      setTeamsError(
        err instanceof Error ? err.message : "Failed to save teams.",
      );
    } finally {
      setIsSavingTeams(false);
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
        <Stack gap={6}>
          <Text size="sm" fw={500}>
            SUPERFLEX eligible positions
          </Text>
          <Chip.Group
            multiple
            value={form.superflexPositions}
            onChange={(value) =>
              setForm({ ...form, superflexPositions: value as Position[] })
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
          <Button onClick={handleSave} loading={isSaving}>
            Save
          </Button>
          <Button
            variant="default"
            onClick={() => {
              setIsEditing(false);
              onDoneCreating();
            }}
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
        SUPERFLEX eligible: {settings.superflexPositions.join(", ")}
      </Text>
      <Stack gap={6}>
        <Text size="sm" fw={500}>
          Draft Teams
        </Text>
        {draftTeams === undefined ? (
          <Loader size="sm" />
        ) : draftTeams.length === 0 ? (
          <Stack gap="sm" maw={420}>
            <Text size="sm" c="dimmed">
              Enter your team name and the other {opponentNames.length} teams
              in this draft before entering the Draft Room. You can rename
              teams later.
            </Text>
            <TextInput
              label="Your team name"
              value={selfName}
              onChange={(event) => setSelfName(event.currentTarget.value)}
            />
            {opponentNames.map((name, index) => (
              <TextInput
                key={index}
                placeholder={`Team ${index + 1}`}
                value={name}
                onChange={(event) => {
                  const next = [...opponentNames];
                  next[index] = event.currentTarget.value;
                  setOpponentNames(next);
                }}
              />
            ))}
            {teamsError && (
              <Text c="red" size="sm">
                {teamsError}
              </Text>
            )}
            <Button
              onClick={handleSaveTeams}
              loading={isSavingTeams}
              disabled={
                !selfName.trim() ||
                opponentNames.some((name) => !name.trim())
              }
              w="fit-content"
            >
              Save Teams
            </Button>
          </Stack>
        ) : (
          <Group gap="xs">
            {draftTeams.map((team) => (
              <Badge
                key={team._id}
                variant={team.isSelf ? "filled" : "light"}
                size="lg"
              >
                {team.name}
                {team.isSelf ? " (you)" : ""}
              </Badge>
            ))}
          </Group>
        )}
      </Stack>
    </Stack>
  );
}
