import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { POSITIONS, type Position } from "../../../types";
import { filterRelevantPlayers, pointsForScoring } from "../../../lib/relevantPlayers";
import { WEEK } from "../../../constants/general";
import { DEFAULT_KEEPER_RULES } from "../../../constants/leagueSettings";
import type { KeeperRules } from "../../../lib/keeperCost";
import { KeeperTierPlayerPicker } from "./KeeperTierPlayerPicker";

interface KeeperRulesPanelProps {
  settings: Doc<"seasons">;
}

// Local editable draft shapes mirror the schema types but make every
// optional numeric field explicitly `| undefined` instead of `?:` -
// exactOptionalPropertyTypes (tsconfig.json) forbids assigning `undefined`
// to a `?:` field, which local edit state needs to do freely (e.g.
// "clearing" a NumberInput). buildFormula/buildDefaultFormula below strip
// undefined keys back out when constructing the actual mutation payload.
interface FormulaDraft {
  multiplier: number;
  flatAdd: number;
  minimumCost: number | undefined;
}

interface DefaultFormulaDraft extends FormulaDraft {
  undraftedCost: number | undefined;
}

interface TierDraft {
  id: string;
  name: string;
  maxSize: number | undefined;
  formula: FormulaDraft;
}

// crypto.randomUUID() only exists in secure contexts (HTTPS or localhost) -
// it's undefined when the app is opened over plain HTTP on a LAN IP (e.g.
// testing on a phone via http://192.168.x.x), which is a normal way to use
// this app during a draft. The id just needs to be unique within this
// tiers list, not cryptographically random, so fall back to a
// timestamp+random string instead of failing tier creation outright.
function generateTierId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function toTierDrafts(tiers: KeeperRules["tiers"]): TierDraft[] {
  return tiers.map((t) => ({
    id: t.id,
    name: t.name,
    maxSize: t.maxSize,
    formula: {
      multiplier: t.formula.multiplier,
      flatAdd: t.formula.flatAdd,
      minimumCost: t.formula.minimumCost,
    },
  }));
}

function buildFormula(draft: FormulaDraft): KeeperRules["tiers"][number]["formula"] {
  return {
    multiplier: draft.multiplier,
    flatAdd: draft.flatAdd,
    ...(draft.minimumCost !== undefined ? { minimumCost: draft.minimumCost } : {}),
  };
}

function buildDefaultFormula(
  draft: DefaultFormulaDraft,
): KeeperRules["defaultFormula"] {
  return {
    ...buildFormula(draft),
    ...(draft.undraftedCost !== undefined
      ? { undraftedCost: draft.undraftedCost }
      : {}),
  };
}

// Comparable signature for "is the config dirty" / "should the local draft
// resync" that deliberately excludes each tier's `fpids` - those commit
// immediately via the per-tier player picker (its own mutation,
// setKeeperTierPlayers) rather than through this panel's batched Save, so a
// picker click shouldn't wipe out an in-progress formula edit or force a
// resync that discards it.
function definitionSignature(rules: {
  defaultFormula: DefaultFormulaDraft;
  maxKeepersPerTeam: number | undefined;
  maxConsecutiveYears: number | undefined;
  trackConsecutiveYears: boolean;
  tiers: TierDraft[];
}): string {
  return JSON.stringify(rules);
}

// Follows TeamsPanel's pattern: local dirty-tracked draft state, its own
// Save button + dirty/saved badge, own mutation. Player selection within
// each tier is the one exception - see KeeperTierPlayerPicker and
// definitionSignature above for why that's split out.
function toDefaultFormulaDraft(
  formula: KeeperRules["defaultFormula"],
): DefaultFormulaDraft {
  return {
    multiplier: formula.multiplier,
    flatAdd: formula.flatAdd,
    minimumCost: formula.minimumCost,
    undraftedCost: formula.undraftedCost,
  };
}

export function KeeperRulesPanel({ settings }: KeeperRulesPanelProps) {
  const keeperRules = settings.keeperRules ?? DEFAULT_KEEPER_RULES;

  const [defaultFormula, setDefaultFormula] = useState<DefaultFormulaDraft>(
    toDefaultFormulaDraft(keeperRules.defaultFormula),
  );
  const [maxKeepersPerTeam, setMaxKeepersPerTeam] = useState<
    number | undefined
  >(keeperRules.maxKeepersPerTeam);
  const [maxConsecutiveYears, setMaxConsecutiveYears] = useState<
    number | undefined
  >(keeperRules.maxConsecutiveYears);
  // Absent means true - see schema.ts's trackConsecutiveYears comment.
  const [trackConsecutiveYears, setTrackConsecutiveYears] = useState<boolean>(
    keeperRules.trackConsecutiveYears ?? true,
  );
  const [tierDrafts, setTierDrafts] = useState<TierDraft[]>(
    toTierDrafts(keeperRules.tiers),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tierSearch, setTierSearch] = useState<Record<string, string>>({});

  const committedSignature = definitionSignature({
    defaultFormula: toDefaultFormulaDraft(keeperRules.defaultFormula),
    maxKeepersPerTeam: keeperRules.maxKeepersPerTeam,
    maxConsecutiveYears: keeperRules.maxConsecutiveYears,
    trackConsecutiveYears: keeperRules.trackConsecutiveYears ?? true,
    tiers: toTierDrafts(keeperRules.tiers),
  });

  useEffect(() => {
    setDefaultFormula(toDefaultFormulaDraft(keeperRules.defaultFormula));
    setMaxKeepersPerTeam(keeperRules.maxKeepersPerTeam);
    setMaxConsecutiveYears(keeperRules.maxConsecutiveYears);
    setTrackConsecutiveYears(keeperRules.trackConsecutiveYears ?? true);
    setTierDrafts(toTierDrafts(keeperRules.tiers));
    // Only the definition signature (not the whole keeperRules object, which
    // also changes on every fpids-only picker click) should trigger a
    // resync - see definitionSignature's comment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committedSignature]);

  const localSignature = definitionSignature({
    defaultFormula,
    maxKeepersPerTeam,
    maxConsecutiveYears,
    trackConsecutiveYears,
    tiers: tierDrafts,
  });
  const isDirty = localSignature !== committedSignature;

  const setKeeperRules = useMutation(api.draft.keeperRules.setKeeperRules);
  const setKeeperTierPlayers = useMutation(
    api.draft.keeperRules.setKeeperTierPlayers,
  );

  // Self-contained player search, same data sources KeepersTab uses, so the
  // per-tier picker can search/label players without LeagueDetails needing
  // to know anything about keeper rules.
  const allProjections = useQuery(api.projections.getAllProjections, {
    week: WEEK,
  });
  const allRankings = useQuery(api.rankings.getAllRankings, { week: WEEK });

  const activePositions = useMemo(() => {
    return POSITIONS.filter(
      (pos) =>
        settings.rosterSlots[pos] > 0 ||
        settings.flexPositions.includes(pos) ||
        settings.superflexPositions.includes(pos),
    );
  }, [settings]);

  const adpByFpid = useMemo(() => {
    const map = new Map<
      number,
      { adpStd: number; adpHalf: number; adpPpr: number }
    >();
    for (const ranking of allRankings ?? []) map.set(ranking.fpid, ranking);
    return map;
  }, [allRankings]);

  const nameByFpid = useMemo(() => {
    const map = new Map<
      number,
      { fpid: number; name: string; position: Position; team: string | null }
    >();
    for (const row of allProjections ?? []) {
      map.set(row.fpid, {
        fpid: row.fpid,
        name: row.name,
        position: row.position,
        team: row.team,
      });
    }
    return map;
  }, [allProjections]);

  const relevantPlayers = useMemo(() => {
    if (!allProjections) return [];
    return filterRelevantPlayers(
      allProjections,
      activePositions,
      settings.scoring,
      adpByFpid,
      (row) => pointsForScoring(row, settings.scoring),
    );
  }, [allProjections, activePositions, settings.scoring, adpByFpid]);

  const searchResultsForTier = (tierId: string) => {
    const query = (tierSearch[tierId] ?? "").trim().toLowerCase();
    if (query.length < 2) return [];
    return relevantPlayers
      .filter((row) => row.name.toLowerCase().includes(query))
      .slice(0, 8)
      .map((row) => ({
        fpid: row.fpid,
        name: row.name,
        position: row.position,
        team: row.team,
      }));
  };

  const otherTiersFpids = (tierId: string) => {
    const set = new Set<number>();
    for (const t of keeperRules.tiers) {
      if (t.id === tierId) continue;
      for (const fpid of t.fpids) set.add(fpid);
    }
    return set;
  };

  const handleToggleTierPlayer = async (tierId: string, fpid: number) => {
    const tier = keeperRules.tiers.find((t) => t.id === tierId);
    if (!tier) return;
    const nextFpids = tier.fpids.includes(fpid)
      ? tier.fpids.filter((id) => id !== fpid)
      : [...tier.fpids, fpid];
    setError(null);
    try {
      await setKeeperTierPlayers({
        seasonId: settings._id,
        tierId,
        fpids: nextFpids,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update tier players.",
      );
    }
  };

  const addTier = () => {
    setTierDrafts((current) => [
      ...current,
      {
        id: generateTierId(),
        name: `Tier ${current.length + 1}`,
        maxSize: undefined,
        formula: { multiplier: 1, flatAdd: 0, minimumCost: undefined },
      },
    ]);
  };

  const removeTier = (id: string) => {
    setTierDrafts((current) => current.filter((t) => t.id !== id));
  };

  const updateTier = (id: string, patch: Partial<TierDraft>) => {
    setTierDrafts((current) =>
      current.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await setKeeperRules({
        seasonId: settings._id,
        keeperRules: {
          defaultFormula: buildDefaultFormula(defaultFormula),
          ...(maxKeepersPerTeam !== undefined ? { maxKeepersPerTeam } : {}),
          ...(maxConsecutiveYears !== undefined
            ? { maxConsecutiveYears }
            : {}),
          trackConsecutiveYears,
          tiers: tierDrafts.map((draft) => ({
            id: draft.id,
            name: draft.name,
            ...(draft.maxSize !== undefined ? { maxSize: draft.maxSize } : {}),
            formula: buildFormula(draft.formula),
            // Preserve whatever fpids are currently live on the server for
            // this tier (edited independently via the picker) rather than
            // whatever this draft happened to be seeded with.
            fpids:
              keeperRules.tiers.find((t) => t.id === draft.id)?.fpids ?? [],
          })),
        },
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save keeper rules.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Stack gap="sm">
      <Text size="md" fw={500}>
        Keeper Rules
      </Text>
      <Text size="xs" c="dimmed">
        Configures the suggested cost when adding a keeper on the Keepers
        tab, plus optional league-wide limits. Leaving a max blank means
        unlimited.
      </Text>

      <Card withBorder padding="sm">
        <Stack gap="xs">
          <Text size="md" fw={500}>
            Default formula
          </Text>
          <Text size="xs" c="dimmed">
            Cost = multiplier × last season's price + flat add, floored at
            the minimum if set. Applies to any player not in a tier below.
          </Text>
          <Group gap="sm" wrap="wrap">
            <NumberInput
              label="Multiplier"
              size="sm"
              w={110}
              step={0.1}
              value={defaultFormula.multiplier}
              onChange={(v) =>
                setDefaultFormula((f) => ({ ...f, multiplier: Number(v) || 0 }))
              }
            />
            <NumberInput
              label="Flat add ($)"
              size="sm"
              w={110}
              prefix="$"
              value={defaultFormula.flatAdd}
              onChange={(v) =>
                setDefaultFormula((f) => ({ ...f, flatAdd: Number(v) || 0 }))
              }
            />
            <NumberInput
              label="Minimum ($)"
              size="sm"
              w={110}
              prefix="$"
              placeholder="None"
              value={defaultFormula.minimumCost ?? ""}
              onChange={(v) =>
                setDefaultFormula((f) => ({
                  ...f,
                  minimumCost: v === "" ? undefined : Number(v),
                }))
              }
            />
            <NumberInput
              label="Undrafted player cost ($)"
              size="sm"
              w={170}
              prefix="$"
              placeholder="Manual entry"
              value={defaultFormula.undraftedCost ?? ""}
              onChange={(v) =>
                setDefaultFormula((f) => ({
                  ...f,
                  undraftedCost: v === "" ? undefined : Number(v),
                }))
              }
            />
          </Group>
        </Stack>
      </Card>

      <Card withBorder padding="sm">
        <Switch
          label="Track consecutive years kept"
          description="Shows a Yrs Kept field on the Keepers tab for reviewing/correcting each keeper's streak. Turn off if your league doesn't track this."
          checked={trackConsecutiveYears}
          onChange={(e) => setTrackConsecutiveYears(e.currentTarget.checked)}
        />
      </Card>

      <Card withBorder padding="sm">
        <Group gap="sm" wrap="wrap">
          <NumberInput
            label="Max keepers per team"
            size="sm"
            w={170}
            min={0}
            placeholder="Unlimited"
            value={maxKeepersPerTeam ?? ""}
            onChange={(v) =>
              setMaxKeepersPerTeam(v === "" ? undefined : Number(v))
            }
          />
          <NumberInput
            label="Max consecutive years kept"
            size="sm"
            w={200}
            min={1}
            placeholder="Unlimited"
            value={maxConsecutiveYears ?? ""}
            onChange={(v) =>
              setMaxConsecutiveYears(v === "" ? undefined : Number(v))
            }
          />
        </Group>
      </Card>

      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="md" fw={500}>
            Tiers (exempt lists)
          </Text>
          <Button
            size="xs"
            variant="default"
            leftSection={<Plus size={14} />}
            onClick={addTier}
          >
            Add tier
          </Button>
        </Group>
        {tierDrafts.length === 0 ? (
          <Text size="xs" c="dimmed">
            No tiers - every player uses the default formula above.
          </Text>
        ) : (
          tierDrafts.map((tier) => {
            const liveFpids =
              keeperRules.tiers.find((t) => t.id === tier.id)?.fpids ?? [];
            return (
              <Card key={tier.id} withBorder padding="sm">
                <Stack gap="xs">
                  <Group gap="sm" wrap="wrap" align="flex-end">
                    <TextInput
                      label="Tier name"
                      size="sm"
                      w={200}
                      value={tier.name}
                      onChange={(e) =>
                        updateTier(tier.id, {
                          name: e.currentTarget.value,
                        })
                      }
                    />
                    <NumberInput
                      label="Max size"
                      size="sm"
                      w={110}
                      min={1}
                      placeholder="Unlimited"
                      value={tier.maxSize ?? ""}
                      onChange={(v) =>
                        updateTier(tier.id, {
                          maxSize: v === "" ? undefined : Number(v),
                        })
                      }
                    />
                    <NumberInput
                      label="Multiplier"
                      size="sm"
                      w={100}
                      step={0.1}
                      value={tier.formula.multiplier}
                      onChange={(v) =>
                        updateTier(tier.id, {
                          formula: {
                            ...tier.formula,
                            multiplier: Number(v) || 0,
                          },
                        })
                      }
                    />
                    <NumberInput
                      label="Flat add ($)"
                      size="sm"
                      w={100}
                      prefix="$"
                      value={tier.formula.flatAdd}
                      onChange={(v) =>
                        updateTier(tier.id, {
                          formula: { ...tier.formula, flatAdd: Number(v) || 0 },
                        })
                      }
                    />
                    <NumberInput
                      label="Minimum ($)"
                      size="sm"
                      w={100}
                      prefix="$"
                      placeholder="None"
                      value={tier.formula.minimumCost ?? ""}
                      onChange={(v) =>
                        updateTier(tier.id, {
                          formula: {
                            ...tier.formula,
                            minimumCost: v === "" ? undefined : Number(v),
                          },
                        })
                      }
                    />
                    <ActionIcon
                      variant="default"
                      color="red"
                      size={36}
                      onClick={() => removeTier(tier.id)}
                      aria-label={`Remove ${tier.name}`}
                    >
                      <Trash2 size={14} />
                    </ActionIcon>
                  </Group>
                  <Text size="xs" c="dimmed">
                    Players ({liveFpids.length}
                    {tier.maxSize !== undefined ? `/${tier.maxSize}` : ""})
                  </Text>
                  <KeeperTierPlayerPicker
                    fpids={liveFpids}
                    maxSize={tier.maxSize}
                    otherTiersFpids={otherTiersFpids(tier.id)}
                    nameByFpid={nameByFpid}
                    searchResults={searchResultsForTier(tier.id)}
                    search={tierSearch[tier.id] ?? ""}
                    onSearchChange={(value) =>
                      setTierSearch((current) => ({
                        ...current,
                        [tier.id]: value,
                      }))
                    }
                    onToggle={(fpid) => handleToggleTierPlayer(tier.id, fpid)}
                  />
                </Stack>
              </Card>
            );
          })
        )}
      </Stack>

      {error && (
        <Text c="red" size="sm">
          {error}
        </Text>
      )}
      <Group gap="xs">
        <Button
          size="md"
          onClick={handleSave}
          loading={isSaving}
          disabled={!isDirty}
        >
          Save Keeper Rules
        </Button>
        <Badge variant="light" color={isDirty ? "yellow" : "teal"}>
          {isDirty ? "Unsaved changes" : "All changes saved"}
        </Badge>
      </Group>
    </Stack>
  );
}
