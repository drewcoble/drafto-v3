import type { Id } from "../_generated/dataModel";

// Format-agnostic team rotation math - originally built (and still used) for
// auction's "nomination order in snake mode" (see nominationOrder.ts's
// nextNominator, which is now a thin re-export of stepPickOrder below), but
// the same bounce-at-the-boundary algorithm is exactly what a real snake
// draft's "whose turn is it to pick" needs too (SNAKE_DRAFT.md §3.1) -
// extracted here so both call sites share one implementation instead of
// drifting into two copies of the same math.

// Single, unchecked step - given the configured order/mode and who's
// currently up, computes who's up next with no regard for roster capacity.
// Kept separate from stepPickOrder so the capacity-skipping loop below can
// call it repeatedly without re-deriving the linear/snake math each time.
//
// Linear is a plain round-robin. Snake bounces at each end of the order
// instead of wrapping - when the next step would go out of range, the same
// team is returned again (unchanged) with direction flipped, so that team
// gets two consecutive turns before the order reverses. That's what makes a
// classic snake draft "snake"-shaped: e.g. with 4 teams the sequence is
// A,B,C,D,D,C,B,A,A,B,C,D,... - team D and team A each nominate twice in a
// row at the turns where the direction reverses.
export function rawStep(
  order: readonly Id<"seasonTeams">[],
  mode: "linear" | "snake",
  currentTeamId: Id<"seasonTeams">,
  direction: 1 | -1,
): { teamId: Id<"seasonTeams">; direction: 1 | -1 } {
  const index = order.indexOf(currentTeamId);
  if (index === -1) {
    // Current team fell out of the order (e.g. order was reconfigured) -
    // simplest safe recovery is to restart at the top.
    return { teamId: order[0]!, direction: 1 };
  }
  if (mode === "linear") {
    return { teamId: order[(index + 1) % order.length]!, direction: 1 };
  }
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= order.length) {
    return { teamId: order[index]!, direction: direction === 1 ? -1 : 1 };
  }
  return { teamId: order[nextIndex]!, direction };
}

// Given the configured order/mode and who's currently up, computes who's up
// next - skipping any team isTeamFull reports as having no open roster
// slots left, since a team with a full roster (bench included) has nothing
// left to draft/nominate for. Exported so it stays trivially testable/
// reasoned-about in isolation from either call site's DB plumbing.
//
// Repeatedly applies rawStep rather than jumping straight to "the next
// non-full team in list order" so snake's bounce-at-the-boundary behavior
// (see rawStep) is preserved exactly - a full team sitting at the boundary
// just gets its would-be repeat turn skipped, without disturbing anyone
// else's place in the sequence.
export function stepPickOrder(
  order: readonly Id<"seasonTeams">[],
  mode: "linear" | "snake",
  currentTeamId: Id<"seasonTeams">,
  direction: 1 | -1,
  isTeamFull: (teamId: Id<"seasonTeams">) => boolean,
): { teamId: Id<"seasonTeams"> | null; direction: 1 | -1 } {
  if (order.length === 0) {
    throw new Error("Draft order is empty.");
  }
  let candidate = rawStep(order, mode, currentTeamId, direction);
  // (teamId, direction) is a finite state space of order.length * 2 - if we
  // haven't found an open team within that many steps, every team is full
  // and we're just cycling, so stop and report "nobody left."
  const maxSteps = order.length * 2;
  for (let step = 0; step < maxSteps; step++) {
    if (!isTeamFull(candidate.teamId)) {
      return candidate;
    }
    candidate = rawStep(order, mode, candidate.teamId, candidate.direction);
  }
  return { teamId: null, direction: candidate.direction };
}
