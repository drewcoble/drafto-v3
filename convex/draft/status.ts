import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { isDraftComplete } from "./slots";
import { scoringConfigFromSeason } from "../scoring";

// Mirrors src/constants/general.ts's WEEK - no shared module across the
// convex/ bundler boundary (same duplication convention as
// expandRosterSlots/isEligibleForSlot elsewhere in this file's siblings).
// The Report Card is always evaluated at the pre-season week.
const REPORT_CARD_WEEK = "0";

// Keeps drafts.status in sync with startedAt + actual pick count - called at
// the end of every mutation that changes draftPicks row count (resolvePick,
// addKeeper, removePick, removeKeeper, undoLastPick in convex/draft/
// picks.ts) as well as convex/draft/lifecycle.ts's startDraft/reopenSetup.
// Driving this off every pick write rather than just resolvePick makes it
// self-healing: a commissioner correction via the League tab that drops a
// team below a full roster automatically reverts status from "complete"
// back to "in_progress", instead of leaving a stale flag that no longer
// matches reality. Gates convex/draft/reportCard.ts's getDraftReportCard.
//
// Status is NOT derived from pick count alone - a draft with startedAt unset
// is always "setup" regardless of how many keepers have been added (keepers
// are just draftPicks rows with isKeeper: true, and adding one pre-draft
// must not look like the auction has begun).
export async function syncDraftStatus(
  ctx: MutationCtx,
  draftId: Id<"drafts">,
): Promise<void> {
  const draft = await ctx.db.get(draftId);
  if (!draft) return;
  const season = await ctx.db.get(draft.seasonId);
  if (!season) return;

  let newStatus: "setup" | "in_progress" | "complete";
  if (draft.startedAt === undefined) {
    newStatus = "setup";
  } else {
    const picks = await ctx.db
      .query("draftPicks")
      .withIndex("by_draft", (q) => q.eq("draftId", draftId))
      .collect();
    const complete = isDraftComplete(
      season.rosterSlots,
      season.teamCount,
      picks.length,
    );
    newStatus = complete ? "complete" : "in_progress";
  }

  if (draft.status !== newStatus) {
    await ctx.db.patch(draftId, { status: newStatus });

    // Only fire on the actual transition into "complete" (not every
    // idempotent re-check), and only for real drafts - mock drafts are
    // practice/testing and shouldn't burn a Gemini call. generateReportSummary
    // itself re-derives Pro access and no-ops if the league owner isn't Pro,
    // so this doesn't need to check that here.
    if (newStatus === "complete" && draft.kind === "real") {
      await ctx.scheduler.runAfter(
        0,
        internal.gemini.reportSummary.generateReportSummary,
        {
          draftId,
          week: REPORT_CARD_WEEK,
          scoringConfig: scoringConfigFromSeason(season),
        },
      );
    }
  }
}
