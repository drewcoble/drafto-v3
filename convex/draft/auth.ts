import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

// Every convex/draft/* function is scoped to one draftSettings row, and every
// one of them needs the same "signed in + owns this draft" check that
// convex/draftSettings.ts currently inlines at its two call sites - worth
// extracting here given how many call sites this directory has.
export async function requireDraftOwner(
  ctx: QueryCtx | MutationCtx,
  draftSettingsId: Id<"draftSettings">,
): Promise<Doc<"draftSettings">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("You must be signed in.");
  }
  const draftSettings = await ctx.db.get(draftSettingsId);
  if (!draftSettings) {
    throw new Error("League not found.");
  }
  if (draftSettings.ownerId !== userId) {
    throw new Error("Not authorized to access this draft.");
  }
  return draftSettings;
}
