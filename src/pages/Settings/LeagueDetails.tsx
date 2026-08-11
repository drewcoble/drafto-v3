import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "@tanstack/react-router";
import { Play, Trophy, Undo2 } from "lucide-react";
import {
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Group,
  List,
  Loader,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { positionColorOrDefault } from "../../lib/positionColors";
import {
  DEFAULT_FORM,
  ROSTER_SLOT_KEYS,
  SCORING_OPTIONS,
  TE_SCORING_OPTIONS,
  type LeagueSettingsFormValues,
} from "../../constants/leagueSettings";
import { SettingsForm } from "./components/SettingsForm";
import { SeasonHistoryPanel } from "./components/SeasonHistoryPanel";
import { TeamsPanel } from "./components/TeamsPanel";
import { LeagueCreateChoice } from "./components/LeagueCreateChoice";
import { LeagueImportWizard } from "./components/LeagueImportWizard";
import { YahooLeagueImportWizard } from "./components/YahooLeagueImportWizard";
import { UpgradePrompt } from "../../components/UpgradePrompt";
import { LockedNotice } from "../../components/LockedNotice";
import { useDraftPhase } from "../../hooks/useDraftPhase";
import { getErrorMessage } from "../../lib/errors";

interface LeagueDetailsProps {
  selectedLeagueId: Id<"seasons"> | undefined;
  isCreatingLeague: boolean;
  onLeagueSaved: (id: Id<"seasons">) => void;
  onDoneCreating: () => void;
  onLeagueDeleted: () => void;
}

export function LeagueDetails({
  selectedLeagueId,
  isCreatingLeague,
  onLeagueSaved,
  onDoneCreating,
  onLeagueDeleted,
}: LeagueDetailsProps) {
  const settingsList = useQuery(api.leagues.listSeasons, {});
  const entitlement = useQuery(api.billing.queries.getMyEntitlement);
  const createSettings = useMutation(api.leagues.createLeague);
  const updateSettings = useMutation(api.leagues.updateSeason);
  const draftTeams = useQuery(
    api.draft.teams.listSeasonTeams,
    selectedLeagueId ? { seasonId: selectedLeagueId } : "skip",
  );
  const initializeDraftTeams = useMutation(
    api.draft.teams.initializeSeasonTeams,
  );
  const renameDraftTeam = useMutation(api.draft.teams.renameSeasonTeam);
  const setTeamSalaryCap = useMutation(api.draft.teams.setTeamSalaryCap);
  const removeDraftTeam = useMutation(api.draft.teams.removeSeasonTeam);
  const setUseKeepers = useMutation(api.leagues.setUseKeepers);
  const deleteDraftSettings = useMutation(api.leagues.deleteLeague);
  const phase = useDraftPhase(selectedLeagueId);
  const isStarted = phase?.isStarted ?? false;
  const startDraft = useMutation(api.draft.lifecycle.startDraft);
  const reopenSetup = useMutation(api.draft.lifecycle.reopenSetup);
  const seasonLineage = useQuery(
    api.draft.history.listSeasonLineage,
    selectedLeagueId ? { seasonId: selectedLeagueId } : "skip",
  );
  const nominationConfig = useQuery(
    api.draft.nominationOrder.getNominationConfig,
    selectedLeagueId ? { seasonId: selectedLeagueId } : "skip",
  );

  const [isEditing, setIsEditing] = useState(false);
  // Gates the "+ New League" flow's first screen (Custom Setup vs. Import
  // from Sleeper/Yahoo - see LeagueCreateChoice.tsx) ahead of isEditing/
  // SettingsForm taking over for the custom path. null once a choice has
  // been made or there's no creation in progress.
  const [createMode, setCreateMode] = useState<
    "choice" | "sleeperImport" | "yahooImport" | null
  >(null);
  const [form, setForm] = useState<LeagueSettingsFormValues>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selfName, setSelfName] = useState("Me");
  const [opponentNames, setOpponentNames] = useState<string[]>([]);
  const [isSavingTeams, setIsSavingTeams] = useState(false);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  const [historySeasonId, setHistorySeasonId] = useState<Id<"seasons"> | null>(
    null,
  );
  const [useKeepersError, setUseKeepersError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [startModalOpen, setStartModalOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [isReopening, setIsReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  // Triggered by the "+ New League" option in the header dropdown, which can
  // fire regardless of which tab is currently active.
  useEffect(() => {
    if (isCreatingLeague) {
      setError(null);
      setIsEditing(false);
      setCreateMode("choice");
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
            teScoring: settings.teScoring ?? "NONE",
            sixPointPassTds: settings.sixPointPassTds ?? false,
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
        teScoring: form.teScoring,
        sixPointPassTds: form.sixPointPassTds,
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
      setError(getErrorMessage(err, "Failed to save settings."));
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
        seasonId: settings._id,
        selfName,
        opponentNames,
      });
    } catch (err) {
      setTeamsError(getErrorMessage(err, "Failed to save teams."));
    } finally {
      setIsSavingTeams(false);
    }
  };

  const handleRenameTeam = async (teamId: Id<"seasonTeams">, name: string) => {
    setTeamsError(null);
    try {
      await renameDraftTeam({ teamId, name });
    } catch (err) {
      setTeamsError(getErrorMessage(err, "Failed to rename team."));
    }
  };

  const handleSetTeamSalaryCap = async (
    teamId: Id<"seasonTeams">,
    salaryCap: number | null,
  ) => {
    setTeamsError(null);
    try {
      await setTeamSalaryCap({ teamId, salaryCap });
    } catch (err) {
      setTeamsError(getErrorMessage(err, "Failed to set salary cap."));
    }
  };

  const handleRemoveTeam = async (teamId: Id<"seasonTeams">) => {
    setTeamsError(null);
    try {
      await removeDraftTeam({ teamId });
    } catch (err) {
      setTeamsError(getErrorMessage(err, "Failed to remove team."));
    }
  };

  const handleToggleUseKeepers = async (checked: boolean) => {
    if (!settings) return;
    setUseKeepersError(null);
    try {
      await setUseKeepers({ id: settings._id, useKeepers: checked });
    } catch (err) {
      setUseKeepersError(
        getErrorMessage(err, "Failed to update keepers setting."),
      );
    }
  };

  const handleStartDraft = async () => {
    if (!settings) return;
    setIsStarting(true);
    setStartError(null);
    try {
      await startDraft({ seasonId: settings._id });
      setStartModalOpen(false);
    } catch (err) {
      setStartError(getErrorMessage(err, "Failed to start the draft."));
    } finally {
      setIsStarting(false);
    }
  };

  const handleReopenSetup = async () => {
    if (!settings) return;
    setIsReopening(true);
    setReopenError(null);
    try {
      await reopenSetup({ seasonId: settings._id });
    } catch (err) {
      setReopenError(getErrorMessage(err, "Failed to reopen setup."));
    } finally {
      setIsReopening(false);
    }
  };

  const handleDelete = async () => {
    if (!settings) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteDraftSettings({ id: settings._id });
      setDeleteModalOpen(false);
      onLeagueDeleted();
    } catch (err) {
      setDeleteError(getErrorMessage(err, "Failed to delete league."));
    } finally {
      setIsDeleting(false);
    }
  };

  if (
    createMode === "choice" &&
    entitlement &&
    !entitlement.hasProAccess &&
    !entitlement.canCreateFreeLeague
  ) {
    return (
      <UpgradePrompt
        title="Free plan is limited to 1 league per year"
        message="You've already created your free league for this year. Upgrade to Pro for more, or come back next year."
      />
    );
  }

  if (createMode === "choice") {
    return (
      <LeagueCreateChoice
        onChooseCustom={() => {
          setCreateMode(null);
          setForm(DEFAULT_FORM);
          setError(null);
          setIsEditing(true);
        }}
        onChooseSleeperImport={() => setCreateMode("sleeperImport")}
        onChooseYahooImport={() => setCreateMode("yahooImport")}
      />
    );
  }

  if (createMode === "sleeperImport") {
    return (
      <LeagueImportWizard
        onImported={(id) => {
          setCreateMode(null);
          onLeagueSaved(id);
          onDoneCreating();
        }}
        onCancel={() => {
          setCreateMode(null);
          onDoneCreating();
        }}
      />
    );
  }

  if (createMode === "yahooImport") {
    return (
      <YahooLeagueImportWizard
        onImported={(id) => {
          setCreateMode(null);
          onLeagueSaved(id);
          onDoneCreating();
        }}
        onCancel={() => {
          setCreateMode(null);
          onDoneCreating();
        }}
      />
    );
  }

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
        teamsLocked={!!draftTeams && draftTeams.length > 0}
        configLocked={isStarted}
        {...(settings
          ? {
              useKeepersControl: {
                checked: settings.useKeepers ?? true,
                onChange: handleToggleUseKeepers,
                error: useKeepersError,
                disabled: !entitlement?.hasProAccess || isStarted,
                ...(isStarted
                  ? {
                      lockedMessage:
                        "This draft has started - reopen setup to change it.",
                    }
                  : {}),
              },
            }
          : {})}
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

  const rosterEntries = ROSTER_SLOT_KEYS.map(
    (slot) => [slot, settings.rosterSlots[slot]] as const,
  );

  const hasTeams = !!draftTeams && draftTeams.length > 0;

  return (
    <Stack gap="lg" py="sm">
      <Group justify="space-between" align="center">
        <Title order={4}>{settings.name}</Title>
        <Group gap="xs">
          {!isStarted && (
            <Tooltip
              label="Add at least one team before starting the draft"
              disabled={hasTeams}
            >
              <Button
                leftSection={<Play size={16} />}
                onClick={() => setStartModalOpen(true)}
                disabled={!hasTeams}
              >
                Start Draft
              </Button>
            </Tooltip>
          )}
          {isStarted && (
            <Button
              variant="default"
              leftSection={<Undo2 size={16} />}
              onClick={handleReopenSetup}
              loading={isReopening}
            >
              Reopen Setup
            </Button>
          )}
          <Button
            color="red"
            variant="outline"
            onClick={() => setDeleteModalOpen(true)}
          >
            Delete League
          </Button>
        </Group>
      </Group>
      {reopenError && (
        <Text c="red" size="sm">
          {reopenError}
        </Text>
      )}
      {isStarted && (
        <LockedNotice>
          This draft has started - scoring, roster, and keeper rules are locked,
          and teams can no longer be added or removed. Team names, salary cap
          overrides, and nomination order still stay editable.
        </LockedNotice>
      )}

      <Modal
        opened={startModalOpen}
        onClose={() => setStartModalOpen(false)}
        title="Start the draft"
      >
        <Stack gap="md">
          <Text size="sm">
            This locks league scoring, roster slots, and keeper rules for the
            rest of the draft, and enables nominating/bidding on players. Team
            names, salary cap overrides, and nomination order stay editable. You
            can reopen setup afterward, but only until the first player is
            actually drafted.
          </Text>
          {startError && (
            <Text c="red" size="sm">
              {startError}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setStartModalOpen(false)}>
              Cancel
            </Button>
            <Button loading={isStarting} onClick={handleStartDraft}>
              Start Draft
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* No outer Card - SeasonHistoryPanel renders SeasonSummary's own
          grid of per-team Cards when a past season is selected, so wrapping
          this section would nest a Card inside a Card. */}
      {seasonLineage !== undefined && seasonLineage.length > 1 && (
        <SeasonHistoryPanel
          seasonLineage={seasonLineage}
          currentSettingsId={settings._id}
          historySeasonId={historySeasonId}
          onSelectHistorySeason={setHistorySeasonId}
        />
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card withBorder padding="md">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Text size="md" fw={500}>
                League Settings
              </Text>
              <Button variant="default" size="md" onClick={startEditing}>
                Edit
              </Button>
            </Group>
            {/* Plain stat blocks, not Cards - this whole panel is already
                inside the "League Settings" Card above, and nesting Cards
                inside a Card reads as boxes-in-boxes. */}
            <SimpleGrid cols={3} spacing="md">
              <Stack gap={0}>
                <Text size="sm" c="dimmed">
                  Teams
                </Text>
                <Text size="xl" fw={700}>
                  {settings.teamCount}
                </Text>
              </Stack>
              <Stack gap={0}>
                <Text size="sm" c="dimmed">
                  Salary Cap
                </Text>
                <Text size="xl" fw={700}>
                  ${settings.salaryCap}
                </Text>
              </Stack>
              <Stack gap={0}>
                <Text size="sm" c="dimmed">
                  Scoring
                </Text>
                <Text size="xl" fw={700}>
                  {SCORING_OPTIONS.find(
                    (option) => option.value === settings.scoring,
                  )?.label ?? settings.scoring}
                </Text>
              </Stack>
            </SimpleGrid>
            <Group gap="lg">
              <Text size="sm" c="dimmed">
                TE Premium:{" "}
                {TE_SCORING_OPTIONS.find(
                  (option) => option.value === (settings.teScoring ?? "NONE"),
                )?.label ?? "No Bonus"}
              </Text>
              <Text size="sm" c="dimmed">
                Passing TDs: {settings.sixPointPassTds ? "6 pts" : "4 pts"}
              </Text>
            </Group>
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
            <Group gap="lg">
              <Text size="sm" c="dimmed">
                FLEX eligible: {settings.flexPositions.join(", ")}
              </Text>
              <Text size="sm" c="dimmed">
                SUPERFLEX eligible: {settings.superflexPositions.join(", ")}
              </Text>
              {entitlement && !entitlement.hasProAccess ? (
                <Group gap={4} wrap="nowrap">
                  <Text size="sm" c="dimmed">
                    Use Keepers:
                  </Text>
                  <Trophy size={14} />
                  <Text size="sm" c="dimmed">
                    Pro only
                  </Text>
                </Group>
              ) : (
                <Text size="sm" c="dimmed">
                  Use Keepers: {(settings.useKeepers ?? true) ? "Yes" : "No"}
                </Text>
              )}
            </Group>
          </Stack>
        </Card>

        <Card withBorder padding="md">
          {draftTeams === undefined ? (
            <Stack gap={6}>
              <Text size="md" fw={500}>
                Teams
              </Text>
              <Loader size="sm" />
            </Stack>
          ) : draftTeams.length === 0 ? (
            <Stack gap="sm" maw={420}>
              <Text size="md" fw={500}>
                Teams
              </Text>
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
                  !selfName.trim() || opponentNames.some((name) => !name.trim())
                }
                w="fit-content"
              >
                Save Teams
              </Button>
            </Stack>
          ) : (
            <TeamsPanel
              seasonId={settings._id}
              teams={draftTeams}
              nominationOrder={nominationConfig?.nominationOrder}
              nominationOrderMode={nominationConfig?.nominationOrderMode}
              salaryCap={settings.salaryCap}
              onRenameTeam={handleRenameTeam}
              onSetTeamSalaryCap={handleSetTeamSalaryCap}
              onRemoveTeam={handleRemoveTeam}
              renameError={teamsError}
              removeLocked={isStarted}
            />
          )}
        </Card>
      </SimpleGrid>

      <Modal
        opened={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete league"
      >
        <Stack gap="md">
          <Text size="sm">
            This will delete all seasons for this league. This cannot be undone.
          </Text>
          <List size="sm">
            {(seasonLineage ?? [settings]).map((season) => (
              <List.Item key={season._id}>
                {settings.name} ({season.year})
              </List.Item>
            ))}
          </List>
          {entitlement && !entitlement.hasProAccess && (
            <Text size="sm" c="orange.6">
              You're on the free plan (1 new league per year) - deleting this
              league won't free up this year's slot for a new one.{" "}
              <Anchor component={Link} to="/billing" size="sm">
                Upgrade to Pro
              </Anchor>{" "}
              for unlimited leagues.
            </Text>
          )}
          {deleteError && (
            <Text c="red" size="sm">
              {deleteError}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button color="red" loading={isDeleting} onClick={handleDelete}>
              Delete League
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
