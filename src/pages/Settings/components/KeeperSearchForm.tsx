import { useState } from "react";
import {
  Anchor,
  Badge,
  Button,
  Card,
  CloseButton,
  Combobox,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
  useCombobox,
} from "@mantine/core";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { EditableNumberStepper } from "../../../components/NumberStepper";
import type { Position } from "../../../types";
import { POSITION_COLORS } from "../../../lib/positionColors";
import {
  computeKeeperCost,
  formulaForFpid,
  type KeeperPriceHistoryEntry,
  type KeeperRules,
} from "../../../lib/keeperCost";

interface KeeperSearchResult {
  fpid: number;
  name: string;
  position: Position;
  team: string | null;
}

interface KeeperSearchFormProps {
  keeperSearch: string;
  onKeeperSearchChange: (value: string) => void;
  draftTeams: Doc<"seasonTeams">[];
  keeperTeamId: Id<"seasonTeams"> | null;
  onKeeperTeamIdChange: (id: Id<"seasonTeams"> | null) => void;
  keeperPrice: number;
  onKeeperPriceChange: (price: number) => void;
  keeperError: string | null;
  keeperSearchResults: KeeperSearchResult[];
  draftValueByFpid: Map<number, { dollarValue: number }>;
  priceHistory: Record<number, KeeperPriceHistoryEntry> | undefined;
  keeperRules: KeeperRules | undefined;
  atTeamKeeperCap: boolean;
  onAddKeeper: (fpid: number, position: Position, price: number) => void;
  onSelectPlayer: (fpid: number) => void;
}

// Step-by-step keeper flow: search -> pick a player from the dropdown ->
// set team/cost for that one player -> Save. Replaces the old layout where
// every search match got its own always-live "Add as Keeper" button, which
// made it easy to add the wrong row's price/team combo by mistake.
export function KeeperSearchForm({
  keeperSearch,
  onKeeperSearchChange,
  draftTeams,
  keeperTeamId,
  onKeeperTeamIdChange,
  keeperPrice,
  onKeeperPriceChange,
  keeperError,
  keeperSearchResults,
  draftValueByFpid,
  priceHistory,
  keeperRules,
  atTeamKeeperCap,
  onAddKeeper,
  onSelectPlayer,
}: KeeperSearchFormProps) {
  const [selectedCandidate, setSelectedCandidate] =
    useState<KeeperSearchResult | null>(null);

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const clearSelection = () => {
    setSelectedCandidate(null);
    onKeeperSearchChange("");
  };

  const handleOptionSubmit = (value: string) => {
    const candidate = keeperSearchResults.find(
      (row) => String(row.fpid) === value,
    );
    combobox.closeDropdown();
    if (!candidate) return;
    setSelectedCandidate(candidate);
    onKeeperSearchChange(candidate.name);
    const lastSeason = priceHistory?.[candidate.fpid];
    const suggestedCost = keeperRules
      ? computeKeeperCost(
          formulaForFpid(keeperRules, candidate.fpid, candidate.position),
          lastSeason?.price,
        )
      : null;
    onKeeperPriceChange(suggestedCost ?? 1);
  };

  const lastSeason = selectedCandidate
    ? priceHistory?.[selectedCandidate.fpid]
    : undefined;
  const fairValue = selectedCandidate
    ? draftValueByFpid.get(selectedCandidate.fpid)
    : undefined;
  const suggestedCost =
    selectedCandidate && keeperRules
      ? computeKeeperCost(
          formulaForFpid(
            keeperRules,
            selectedCandidate.fpid,
            selectedCandidate.position,
          ),
          lastSeason?.price,
        )
      : null;

  const disabled = !keeperTeamId || atTeamKeeperCap;

  return (
    <Stack gap="sm">
      <Combobox store={combobox} onOptionSubmit={handleOptionSubmit}>
        <Combobox.Target>
          <TextInput
            label="Search a player to keep..."
            placeholder="e.g. CeeDee Lamb"
            value={keeperSearch}
            // iOS's autocorrect/QuickType bar doesn't recognize most player
            // surnames and pops a suggestion strip on top of the dropdown
            // below, eating the first tap on an option - see
            // ManualPreviousSeasonModal.tsx's copy of this same fix.
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setSelectedCandidate(null);
              onKeeperSearchChange(event.currentTarget.value);
              combobox.openDropdown();
              combobox.updateSelectedOptionIndex();
            }}
            onClick={() => combobox.openDropdown()}
            onFocus={() => combobox.openDropdown()}
            onBlur={() => combobox.closeDropdown()}
            rightSection={
              selectedCandidate ? (
                <CloseButton
                  size="sm"
                  aria-label="Clear selected player"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clearSelection}
                />
              ) : undefined
            }
          />
        </Combobox.Target>

        <Combobox.Dropdown>
          <Combobox.Options mah={280} style={{ overflowY: "auto" }}>
            {keeperSearchResults.length === 0 ? (
              <Combobox.Empty>
                {keeperSearch.trim().length < 2
                  ? "Type at least 2 characters..."
                  : "No players found"}
              </Combobox.Empty>
            ) : (
              keeperSearchResults.map((row) => (
                <Combobox.Option value={String(row.fpid)} key={row.fpid}>
                  <Group justify="space-between" wrap="nowrap" gap="sm">
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm">{row.name}</Text>
                      <Badge
                        size="sm"
                        variant="light"
                        color={POSITION_COLORS[row.position]}
                      >
                        {row.position}
                      </Badge>
                      {row.team && (
                        <Text size="xs" c="dimmed">
                          {row.team}
                        </Text>
                      )}
                    </Group>
                    {draftValueByFpid.get(row.fpid) && (
                      <Text
                        size="xs"
                        c="dimmed"
                        style={{ whiteSpace: "nowrap" }}
                      >
                        ~$
                        {Math.round(
                          draftValueByFpid.get(row.fpid)!.dollarValue,
                        )}
                      </Text>
                    )}
                  </Group>
                </Combobox.Option>
              ))
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>

      {keeperError && (
        <Text c="red" size="sm">
          {keeperError}
        </Text>
      )}

      {selectedCandidate && (
        <Card withBorder padding="sm" radius="md">
          <Stack gap="sm">
            <Group gap={6} wrap="nowrap">
              <Anchor
                component="button"
                type="button"
                fw={500}
                onClick={() => onSelectPlayer(selectedCandidate.fpid)}
              >
                {selectedCandidate.name}
              </Anchor>
              <Badge
                variant="light"
                color={POSITION_COLORS[selectedCandidate.position]}
              >
                {selectedCandidate.position}
              </Badge>
              {selectedCandidate.team && (
                <Text size="xs" c="dimmed">
                  {selectedCandidate.team}
                </Text>
              )}
            </Group>
            <Text size="xs" c="dimmed">
              {fairValue ? `Fair ~$${Math.round(fairValue.dollarValue)}` : null}
              {lastSeason
                ? ` · Last kept $${lastSeason.price}${
                    lastSeason.season ? ` (${lastSeason.season})` : ""
                  }`
                : null}
              {suggestedCost !== null ? ` · Suggested $${suggestedCost}` : null}
            </Text>
            <Group grow align="flex-end">
              <Select
                label="Team"
                data={draftTeams.map((team) => ({
                  value: team._id,
                  label: team.name,
                }))}
                value={keeperTeamId}
                onChange={(value) =>
                  onKeeperTeamIdChange(value as Id<"seasonTeams"> | null)
                }
              />
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Cost
                </Text>
                <EditableNumberStepper
                  label="Cost"
                  min={1}
                  prefix="$"
                  value={keeperPrice}
                  onChange={(value) => onKeeperPriceChange(value ?? 1)}
                />
              </Stack>
            </Group>
            <Tooltip
              label="This team already has the max number of keepers allowed."
              disabled={!atTeamKeeperCap}
            >
              <Button
                size="md"
                fullWidth
                disabled={disabled}
                onClick={() => {
                  onAddKeeper(
                    selectedCandidate.fpid,
                    selectedCandidate.position,
                    keeperPrice,
                  );
                  setSelectedCandidate(null);
                }}
              >
                Save Keeper
              </Button>
            </Tooltip>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
