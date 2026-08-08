import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ActionIcon,
  Anchor,
  Badge,
  Group,
  Progress,
  Stack,
  Text,
} from "@mantine/core";
import { Trash2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { expandRosterSlots } from "../../lib/rosterSlots";
import { useTeamBudget } from "../../hooks/useTeamBudget";
import { positionColorOrDefault } from "../../lib/positionColors";
import { WEEK } from "../../constants/general";
import { PlayerDetailModal } from "../../components/PlayerDetailModal";
import { SlotTable } from "./components/SlotTable";
import { getErrorMessage } from "../../lib/errors";

interface MyTeamTabProps {
  seasonId: Id<"seasons">;
  teams: Doc<"seasonTeams">[];
  selfTeamId: Id<"seasonTeams">;
}

export function MyTeamTab({ seasonId, selfTeamId }: MyTeamTabProps) {
  const settingsList = useQuery(api.leagues.listSeasons, {});
  const picks = useQuery(api.draft.picks.listDraftPicks, { seasonId });
  const plan = useQuery(api.draft.plan.getLiveBudgetPlan, { seasonId });
  const allProjections = useQuery(api.projections.getAllProjections, {
    week: WEEK,
  });
  const stats = useTeamBudget(seasonId, selfTeamId);
  const removePick = useMutation(api.draft.picks.removePick);
  const setPickSlot = useMutation(api.draft.picks.setPickSlot);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [selectedFpid, setSelectedFpid] = useState<number | null>(null);

  const handleRemove = async (pickId: Id<"draftPicks">) => {
    setRemoveError(null);
    try {
      await removePick({ pickId });
    } catch (err) {
      setRemoveError(
        getErrorMessage(err, "Failed to remove pick."),
      );
    }
  };

  const handleMove = async (pickId: Id<"draftPicks">, slotKey: string) => {
    setRemoveError(null);
    try {
      await setPickSlot({ pickId, slotKey });
    } catch (err) {
      setRemoveError(
        getErrorMessage(err, "Failed to move pick."),
      );
    }
  };

  const settings = settingsList?.find((s) => s._id === seasonId);

  const nameByFpid = useMemo(() => {
    const map = new Map<number, { name: string; team: string | null }>();
    for (const row of allProjections ?? []) {
      map.set(row.fpid, row);
    }
    return map;
  }, [allProjections]);

  const myPicks = useMemo(
    () => (picks ?? []).filter((pick) => pick.teamId === selfTeamId),
    [picks, selfTeamId],
  );

  const pickBySlotKey = useMemo(() => {
    const map = new Map<string, (typeof myPicks)[number]>();
    for (const pick of myPicks) {
      if (pick.planSlotKey) map.set(pick.planSlotKey, pick);
    }
    return map;
  }, [myPicks]);

  const slots = useMemo(
    () => (settings ? expandRosterSlots(settings.rosterSlots) : []),
    [settings],
  );

  const unassignedPicks = useMemo(
    () => myPicks.filter((pick) => !pick.planSlotKey),
    [myPicks],
  );

  // Group plan vs actual by position (FLEX/SFLEX/BN slots - which have no
  // single fixed position - get their own bucket using the slot label).
  const spendByGroup = useMemo(() => {
    const groups = new Map<string, { plan: number; actual: number }>();
    for (const slot of slots) {
      const key = slot.position ?? slot.label.replace(/\d+$/, "");
      const entry = groups.get(key) ?? { plan: 0, actual: 0 };
      entry.plan += plan?.amounts[slot.key] ?? 0;
      const pick = pickBySlotKey.get(slot.key);
      if (pick) entry.actual += pick.price;
      groups.set(key, entry);
    }
    return Array.from(groups.entries());
  }, [slots, plan, pickBySlotKey]);

  const benchSlots = slots.filter((slot) => slot.label.startsWith("BN"));
  const benchFilled = benchSlots.filter((slot) =>
    pickBySlotKey.has(slot.key),
  ).length;

  const thisSeason = settings?.year ?? String(new Date().getFullYear());

  return (
    <Stack gap="md" py="sm">
      {stats && (
        <Group gap="lg">
          <Text size="sm" c="dimmed">
            ${stats.spent} of ${stats.spent + stats.remaining} spent
          </Text>
          <Text size="sm" c="dimmed">
            {stats.totalSlots - stats.openSlots} of {stats.totalSlots} slots
            filled
          </Text>
        </Group>
      )}

      {removeError && (
        <Text c="red" size="sm">
          {removeError}
        </Text>
      )}

      <SlotTable
        slots={slots}
        pickBySlotKey={pickBySlotKey}
        planAmounts={plan?.amounts ?? {}}
        nameByFpid={nameByFpid}
        flexPositions={settings?.flexPositions ?? []}
        superflexPositions={settings?.superflexPositions ?? []}
        onRemove={handleRemove}
        onMove={handleMove}
        onSelectPlayer={setSelectedFpid}
        trackConsecutiveYears={settings?.keeperRules?.trackConsecutiveYears ?? true}
      />

      {unassignedPicks.length > 0 && (
        <Stack gap={6}>
          <Text size="sm" fw={500}>
            Unassigned picks
          </Text>
          {unassignedPicks.map((pick) => (
            <Group key={pick._id} gap={6}>
              <Text size="sm" c="dimmed">
                <Anchor
                  component="button"
                  type="button"
                  size="sm"
                  onClick={() => setSelectedFpid(pick.fpid)}
                >
                  {nameByFpid.get(pick.fpid)?.name ?? `#${pick.fpid}`}
                </Anchor>{" "}
                - ${pick.price}
              </Text>
              {pick.isKeeper && (
                <Badge variant="light" color="gray" size="sm">
                  {settings?.keeperRules?.trackConsecutiveYears ?? true
                    ? `Keeper · Yr ${pick.keeperStreak ?? 1}`
                    : "Keeper"}
                </Badge>
              )}
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label="Remove pick"
                onClick={() => handleRemove(pick._id)}
              >
                <Trash2 size={16} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      )}

      <Stack gap={6}>
        <Text size="sm" fw={500}>
          Where the money went
        </Text>
        {spendByGroup.map(([group, { plan: planTotal, actual }]) => (
          <Group key={group} gap="sm" wrap="nowrap">
            <Text size="sm" w={60}>
              {group}
            </Text>
            <Progress
              value={planTotal > 0 ? Math.min((actual / planTotal) * 100, 100) : 0}
              color={positionColorOrDefault(group)}
              flex={1}
            />
            <Text size="sm" c="dimmed" w={90} ta="right">
              ${actual} / ${planTotal}
            </Text>
          </Group>
        ))}
      </Stack>

      <Stack gap={6}>
        <Text size="sm" fw={500}>
          Bench - {benchFilled} of {benchSlots.length} filled
        </Text>
        <Progress
          value={
            benchSlots.length ? (benchFilled / benchSlots.length) * 100 : 0
          }
        />
      </Stack>

      <PlayerDetailModal
        fpid={selectedFpid}
        onClose={() => setSelectedFpid(null)}
        week={WEEK}
        scoring={settings?.scoring ?? "PPR"}
        season={thisSeason}
        seasonId={seasonId}
      />
    </Stack>
  );
}
