import type { Position, ScoringFormat } from "../types";
import type { KeeperRules } from "../lib/keeperCost";

export const ROSTER_SLOT_KEYS = [
  "QB",
  "SUPERFLEX",
  "RB",
  "WR",
  "FLEX",
  "TE",
  "DST",
  "K",
  "BENCH",
] as const;

export const SCORING_OPTIONS: Array<{ label: string; value: ScoringFormat }> = [
  { label: "No PPR", value: "STD" },
  { label: "Half PPR", value: "HALF" },
  { label: "PPR", value: "PPR" },
];

export interface LeagueSettingsFormValues {
  name: string;
  teamCount: number;
  salaryCap: number;
  scoring: ScoringFormat;
  rosterSlots: Record<(typeof ROSTER_SLOT_KEYS)[number], number>;
  flexPositions: Position[];
  superflexPositions: Position[];
}

export const DEFAULT_FORM: LeagueSettingsFormValues = {
  name: "Default $200/12-team",
  teamCount: 12,
  salaryCap: 200,
  scoring: "PPR",
  rosterSlots: {
    QB: 1,
    SUPERFLEX: 0,
    RB: 2,
    WR: 2,
    FLEX: 1,
    TE: 1,
    DST: 1,
    K: 0,
    BENCH: 8,
  },
  flexPositions: ["RB", "WR", "TE"],
  superflexPositions: ["QB", "RB", "WR", "TE"],
};

export const DEFAULT_KEEPER_RULES: KeeperRules = {
  defaultFormula: { multiplier: 1, flatAdd: 0 },
  tiers: [],
};
