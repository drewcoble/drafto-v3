import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { positionColorOrDefault } from "../../lib/positionColors";
import { guessNextSeason } from "../../lib/season";
import {
  DEFAULT_FORM,
  SCORING_OPTIONS,
  type LeagueSettingsFormValues,
} from "../../constants/leagueSettings";
import { SettingsForm } from "./components/SettingsForm";
import { SeasonHistoryPanel } from "./components/SeasonHistoryPanel";
import { TeamNameField } from "./components/TeamNameField";
import { NominationOrderPanel } from "./components/NominationOrderPanel";

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
  const renameDraftTeam = useMutation(api.draft.teams.renameDraftTeam);
  const seasonLineage = useQuery(
    api.draft.history.listSeasonLineage,
    selectedLeagueId ? { draftSettingsId: selectedLeagueId } : "skip",
  );
  const cloneDraftSettings = useMutation(api.draft.history.cloneDraftSettings);

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<LeagueSettingsFormValues>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selfName, setSelfName] = useState("Me");
  const [opponentNames, setOpponentNames] = useState<string[]>([]);
  const [isSavingTeams, setIsSavingTeams] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  const [historySeasonId, setHistorySeasonId] =
    useState<Id<"draftSettings"> | null>(null);
  const [isStartingSeason, setIsStartingSeason] = useState(false);
  const [nextSeasonLabel, setNextSeasonLabel] = useState("");
  const [nextSeasonName, setNextSeasonName] = useState("");
  const [isCloning, setIsCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);

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

  const handleRenameTeam = async (teamId: Id<"draftTeams">, name: string) => {
    setTeamsError(null);
    try {
      await renameDraftTeam({ teamId, name });
    } catch (err) {
      setTeamsError(
        err instanceof Error ? err.message : "Failed to rename team.",
      );
    }
  };

  const openStartSeasonForm = () => {
    setNextSeasonLabel(guessNextSeason(settings?.season));
    setNextSeasonName(settings?.name ?? "");
    setCloneError(null);
    setIsStartingSeason(true);
  };

  const handleStartSeason = async () => {
    if (!settings) return;
    setIsCloning(true);
    setCloneError(null);
    try {
      const newId = await cloneDraftSettings({
        id: settings._id,
        season: nextSeasonLabel,
        name: nextSeasonName,
      });
      setIsStartingSeason(false);
      setHistorySeasonId(null);
      onLeagueSaved(newId);
    } catch (err) {
      setCloneError(
        err instanceof Error ? err.message : "Failed to start next season.",
      );
    } finally {
      setIsCloning(false);
    }
  };

  if (isEditing) {
    return (
      <SettingsForm
        form={form}
        onChange={setForm}
        error={error}
        isSaving={isSaving}
        onSave={handleSave}
        onCancel={() => {
          setIsEditing(false);
          onDoneCreating();
        }}
      />
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
      <SeasonHistoryPanel
        seasonLineage={seasonLineage}
        currentSettingsId={settings._id}
        historySeasonId={historySeasonId}
        onSelectHistorySeason={setHistorySeasonId}
        isStartingSeason={isStartingSeason}
        onOpenStartSeason={openStartSeasonForm}
        onCancelStartSeason={() => setIsStartingSeason(false)}
        nextSeasonName={nextSeasonName}
        onNextSeasonNameChange={setNextSeasonName}
        nextSeasonLabel={nextSeasonLabel}
        onNextSeasonLabelChange={setNextSeasonLabel}
        cloneError={cloneError}
        isCloning={isCloning}
        onStartSeason={handleStartSeason}
      />
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
            <Badge
              key={slot}
              variant="light"
              size="lg"
              color={positionColorOrDefault(slot)}
            >
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
          <Stack gap="xs">
            {teamsError && (
              <Text c="red" size="sm">
                {teamsError}
              </Text>
            )}
            <Group gap="xs">
              {draftTeams.map((team) => (
                <Group key={team._id} gap={4} wrap="nowrap">
                  <TeamNameField
                    team={team}
                    onRename={(name) => handleRenameTeam(team._id, name)}
                  />
                  {team.isSelf && (
                    <Badge variant="light" size="sm">
                      you
                    </Badge>
                  )}
                </Group>
              ))}
            </Group>
          </Stack>
        )}
      </Stack>
      {draftTeams && draftTeams.length > 0 && (
        <NominationOrderPanel
          draftSettingsId={settings._id}
          teams={draftTeams}
          nominationOrder={settings.nominationOrder}
          nominationOrderMode={settings.nominationOrderMode}
        />
      )}
    </Stack>
  );
}
