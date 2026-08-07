import { POSITIONS } from "../positions";
import type { RosterSlotCounts } from "./slots";
import { assignPicksToSlots, expandRosterSlots } from "./slots";

type Position = (typeof POSITIONS)[number];

export interface LineupPick {
  fpid: number;
  position: Position;
  points: number;
  planSlotKey?: string;
  sequence: number;
}

export interface LineupResult {
  optimalPoints: number;
  actualPoints: number;
  // Positive = points left on the bench (actual lineup underperforms the
  // best possible one built from the same roster).
  delta: number;
  // actualPoints / optimalPoints, clamped to [0, 1] - 1 when a team has no
  // startable points at all (nothing to optimize away from).
  efficiencyPct: number;
  startersOptimalFpids: number[];
  startersActualFpids: number[];
  // In the optimal lineup but benched in the actual one.
  shouldBeStartingFpids: number[];
  // Starting in the actual lineup but not part of the optimal one.
  shouldBeBenchedFpids: number[];
}

// Best-possible starting lineup for one team's already-drafted roster, vs.
// what they're actually starting (per convex/draft/slots.ts's
// assignPicksToSlots, the same slot-assignment logic the live draft UI
// already uses for display). Tiered greedy: dedicated-position slots first
// (each position's own top-N by points), then a pooled FLEX tier, then a
// pooled SUPERFLEX tier - mirrors the FLEX-then-SUPERFLEX pooling
// convex/draftValues.ts's computeDraftValues already does league-wide
// (lines ~158-215), just applied to one team's fixed roster instead of a
// replacement-level computation across the whole player pool.
//
// This greedy tiering is optimal for the single-flex-tier case (fill each
// dedicated slot with that position's own best players, then pool the
// leftovers for the one shared flex tier by raw points); a fully general
// assignment-problem solver would be needed to guarantee global optimality
// across two *dependent* flex tiers in pathological cases, which is
// intentionally out of scope here.
export function optimizeLineup(
  teamPicks: LineupPick[],
  rosterSlots: RosterSlotCounts,
  flexPositions: readonly Position[],
  superflexPositions: readonly Position[],
): LineupResult {
  const slots = expandRosterSlots(rosterSlots);
  const flexSlotCount = slots.filter((slot) =>
    slot.label.startsWith("FLEX"),
  ).length;
  const superflexSlotCount = slots.filter((slot) =>
    slot.label.startsWith("SFLEX"),
  ).length;

  const byPosition = new Map<Position, LineupPick[]>();
  for (const pick of teamPicks) {
    const list = byPosition.get(pick.position) ?? [];
    list.push(pick);
    byPosition.set(pick.position, list);
  }
  for (const list of byPosition.values()) {
    list.sort((a, b) => b.points - a.points);
  }

  const used = new Set<number>();
  const optimalStarters: LineupPick[] = [];

  for (const position of POSITIONS) {
    const dedicatedCount = rosterSlots[position];
    if (dedicatedCount <= 0) continue;
    const candidates = byPosition.get(position) ?? [];
    for (const pick of candidates.slice(0, dedicatedCount)) {
      optimalStarters.push(pick);
      used.add(pick.fpid);
    }
  }

  const flexPool = teamPicks
    .filter((pick) => !used.has(pick.fpid) && flexPositions.includes(pick.position))
    .sort((a, b) => b.points - a.points);
  for (const pick of flexPool.slice(0, flexSlotCount)) {
    optimalStarters.push(pick);
    used.add(pick.fpid);
  }

  const superflexPool = teamPicks
    .filter(
      (pick) => !used.has(pick.fpid) && superflexPositions.includes(pick.position),
    )
    .sort((a, b) => b.points - a.points);
  for (const pick of superflexPool.slice(0, superflexSlotCount)) {
    optimalStarters.push(pick);
    used.add(pick.fpid);
  }

  const optimalPoints = optimalStarters.reduce((sum, p) => sum + p.points, 0);

  const pointsByFpid = new Map(teamPicks.map((p) => [p.fpid, p.points]));
  const actualBySlot = assignPicksToSlots(
    [...teamPicks].sort((a, b) => a.sequence - b.sequence),
    rosterSlots,
    flexPositions,
    superflexPositions,
  );
  const actualStarters: LineupPick[] = [];
  for (const [slotKey, pick] of actualBySlot) {
    if (!slotKey.startsWith("BN")) actualStarters.push(pick);
  }
  const actualPoints = actualStarters.reduce(
    (sum, p) => sum + (pointsByFpid.get(p.fpid) ?? 0),
    0,
  );

  const optimalFpidSet = new Set(optimalStarters.map((p) => p.fpid));
  const actualFpidSet = new Set(actualStarters.map((p) => p.fpid));

  return {
    optimalPoints,
    actualPoints,
    delta: optimalPoints - actualPoints,
    efficiencyPct: optimalPoints > 0 ? Math.min(actualPoints / optimalPoints, 1) : 1,
    startersOptimalFpids: [...optimalFpidSet],
    startersActualFpids: [...actualFpidSet],
    shouldBeStartingFpids: [...optimalFpidSet].filter(
      (fpid) => !actualFpidSet.has(fpid),
    ),
    shouldBeBenchedFpids: [...actualFpidSet].filter(
      (fpid) => !optimalFpidSet.has(fpid),
    ),
  };
}
