export type Position = "QB" | "RB" | "WR" | "TE" | "DST" | "K";

export type TabValue = "league" | "players" | "data";

export const POSITIONS: readonly Position[] = [
  "QB",
  "RB",
  "WR",
  "TE",
  "DST",
  "K",
];

export type ScoringFormat = "STD" | "HALF" | "PPR";

// The canonical shape of one row from draftValues.getDraftValues - shared by
// PlayersTable and the Draft Room instead of each declaring it inline.
export interface DraftValueRow {
  fpid: number;
  name: string;
  team: string | null;
  position: Position;
  points: number;
  positionRank: number;
  replacementPoints: number;
  usedFallback: boolean;
  valueOverReplacement: number;
  dollarValue: number;
}

// Sub-tabs within the live Draft Room (a separate mode from the pre-draft
// settings app's TabValue above).
export type DraftSubTab = "budget" | "draft" | "myTeam" | "players" | "league";

// One row from draft.board.getDraftBoard - draftValues.getDraftValues plus
// tier. Deliberately does NOT include live pick status: this query's read
// dependencies (draftSettings + projections) are stable for the duration of
// a draft, so it's not invalidated/recomputed on every pick the way a
// picks-joined version would be.
export interface DraftTierRow extends DraftValueRow {
  tier: number;
  tierLabel: string;
}

// DraftTierRow + live drafted status, joined client-side from a
// listDraftPicks subscription (see PlayersLeftTab) - cheap to recompute on
// every pick, unlike the VBD valuation in DraftTierRow.
export interface DraftBoardRow extends DraftTierRow {
  drafted: boolean;
  draftedByTeamId?: string;
  draftedPrice?: number;
}

export type OverspendBehavior = "bench" | "spread" | "ask";

// Manual per-player "target"/"avoid" annotation, scoped to one draft. No
// row/no entry means no opinion.
export type PlayerTag = "target" | "avoid";
