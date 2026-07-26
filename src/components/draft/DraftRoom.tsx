import { useState } from "react";
import { useQuery } from "convex/react";
import { Button, Center, Loader, Stack, Tabs, Text } from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { DraftSubTab } from "../../types";
import { DraftTopBar } from "./DraftTopBar";
import { DraftTab } from "./DraftTab";
import { MyTeamTab } from "./MyTeamTab";
import { BudgetTab } from "./BudgetTab";
import { PlayersLeftTab } from "./PlayersLeftTab";
import { LeagueTab } from "./LeagueTab";

interface DraftRoomProps {
  draftSettingsId: Id<"draftSettings">;
  onExit: () => void;
}

// Teams are set up ahead of time on the League Details tab (Enter Draft Room
// is disabled there until they exist), so this only needs to handle the
// loaded/not-found states, not first-time team setup.
export function DraftRoom({ draftSettingsId, onExit }: DraftRoomProps) {
  const settingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const teams = useQuery(api.draft.teams.listDraftTeams, { draftSettingsId });

  const [subTab, setSubTab] = useState<DraftSubTab>("draft");

  const settings = settingsList?.find((s) => s._id === draftSettingsId);

  if (settingsList === undefined || teams === undefined) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  if (!settings) {
    return (
      <Stack gap="md" py="xl" align="center">
        <Text c="dimmed">League not found.</Text>
        <Button variant="default" onClick={onExit}>
          Back to settings
        </Button>
      </Stack>
    );
  }

  if (teams.length === 0) {
    return (
      <Stack gap="md" py="xl" align="center">
        <Text c="dimmed">
          Set up your draft teams on the League Details tab first.
        </Text>
        <Button variant="default" onClick={onExit}>
          Back to League Details
        </Button>
      </Stack>
    );
  }

  const selfTeam = teams.find((team) => team.isSelf);

  return (
    <Stack gap="md" py="sm">
      <Text size="sm" c="dimmed">
        {settings.name}
      </Text>
      {selfTeam && (
        <DraftTopBar
          draftSettingsId={draftSettingsId}
          selfTeamId={selfTeam._id}
        />
      )}
      <Tabs
        value={subTab}
        onChange={(next) => next && setSubTab(next as DraftSubTab)}
      >
        <Tabs.List>
          <Tabs.Tab value="budget">Budget</Tabs.Tab>
          <Tabs.Tab value="draft">Draft</Tabs.Tab>
          <Tabs.Tab value="myTeam">My Team</Tabs.Tab>
          <Tabs.Tab value="players">Players</Tabs.Tab>
          <Tabs.Tab value="league">League</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      {subTab === "budget" && <BudgetTab draftSettingsId={draftSettingsId} />}
      {selfTeam && subTab === "draft" && (
        <DraftTab
          draftSettingsId={draftSettingsId}
          teams={teams}
          selfTeamId={selfTeam._id}
        />
      )}
      {selfTeam && subTab === "myTeam" && (
        <MyTeamTab
          draftSettingsId={draftSettingsId}
          teams={teams}
          selfTeamId={selfTeam._id}
        />
      )}
      {selfTeam && subTab === "players" && (
        <PlayersLeftTab
          draftSettingsId={draftSettingsId}
          selfTeamId={selfTeam._id}
        />
      )}
      {selfTeam && subTab === "league" && (
        <LeagueTab
          draftSettingsId={draftSettingsId}
          teams={teams}
          selfTeamId={selfTeam._id}
        />
      )}
    </Stack>
  );
}
