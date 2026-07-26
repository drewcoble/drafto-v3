import { useMemo } from "react";
import { useQuery } from "convex/react";
import { Badge, Group, Progress, Stack, Table, Text } from "@mantine/core";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { expandRosterSlots } from "../../lib/rosterSlots";
import { useTeamBudget } from "../../hooks/useTeamBudget";

const WEEK = "draft";

interface MyTeamTabProps {
  draftSettingsId: Id<"draftSettings">;
  teams: Doc<"draftTeams">[];
  selfTeamId: Id<"draftTeams">;
}

export function MyTeamTab({ draftSettingsId, selfTeamId }: MyTeamTabProps) {
  const settingsList = useQuery(api.draftSettings.listDraftSettings, {});
  const picks = useQuery(api.draft.picks.listDraftPicks, { draftSettingsId });
  const plan = useQuery(api.draft.plan.getBudgetPlan, { draftSettingsId });
  const allProjections = useQuery(api.projections.getAllProjections, {
    week: WEEK,
  });
  const stats = useTeamBudget(draftSettingsId, selfTeamId);

  const settings = settingsList?.find((s) => s._id === draftSettingsId);

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

      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Slot</Table.Th>
            <Table.Th>Player</Table.Th>
            <Table.Th>Plan</Table.Th>
            <Table.Th>Paid</Table.Th>
            <Table.Th>+/-</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {slots.map((slot) => {
            const pick = pickBySlotKey.get(slot.key);
            const player = pick ? nameByFpid.get(pick.fpid) : undefined;
            const planAmount = plan?.amounts[slot.key] ?? 0;
            return (
              <Table.Tr key={slot.key}>
                <Table.Td>
                  <Badge variant="light">{slot.label}</Badge>
                </Table.Td>
                <Table.Td>{player?.name ?? "—"}</Table.Td>
                <Table.Td>${planAmount}</Table.Td>
                <Table.Td>{pick ? `$${pick.price}` : "—"}</Table.Td>
                <Table.Td>
                  {pick ? pick.price - planAmount : ""}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>

      {unassignedPicks.length > 0 && (
        <Stack gap={6}>
          <Text size="sm" fw={500}>
            Unassigned picks
          </Text>
          {unassignedPicks.map((pick) => (
            <Text key={pick._id} size="sm" c="dimmed">
              {nameByFpid.get(pick.fpid)?.name ?? `#${pick.fpid}`} - $
              {pick.price}
            </Text>
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
    </Stack>
  );
}
