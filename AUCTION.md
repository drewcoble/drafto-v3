# Auction Draft — Architecture Map

Committed to git (unlike `SNAKE_DRAFT.md`/`YAHOO.md`/etc.) so every worktree/checkout has it automatically. Companion to [SNAKE.md](SNAKE.md) (snake/linear). Read this file before researching or changing auction-specific code; check both files' "Shared" sections for anything that touches `draftPicks`, team management, keeper rules, Sleeper/Yahoo sync, or league settings.

Format is resolved via `resolveDraftType(season, draft)` in `convex/draftType.ts`: `draft?.draftType ?? season.draftType ?? "auction"` — **auction is the default when unset**. `src/` can't import Convex runtime code, so every frontend file re-derives this inline as `(settings.draftType ?? "auction") === "auction"` (usually named `isAuction`). Auction has no feature flag — it's always available (snake/linear is gated behind `VITE_ENABLE_SNAKE_DRAFT`, see [SNAKE.md](SNAKE.md)).

## Convex schema (auction-only)

- `draftNominations` — the single "on the block" nomination + `currentBid`
- `draftBudgetPlans` / `draftLiveBudgetOverrides` — pre-draft $ allocation per roster slot + live in-draft overrides
- `drafts.nominationOrder` / `drafts.nominationOrderMode` (`"linear"|"snake"`) — a **soft, always-overridable** nomination-order suggestion. Distinct from snake/linear's authoritative `drafts.draftOrder`, even though both share the same rotation math.
- `draftPicks.price` (optional) — dollar cost; unset for snake/linear picks
- `draftPicks.planSlotKey` — which budget-plan slot ("RB2" etc.) a pick fills
- `seasons.salaryCap` / `seasonTeams.salaryCapOverride` — cap dollars (⚠ still read unconditionally by `draftValues.ts` regardless of format — see Gaps)
- `seasons.keeperRules.costMode: "dollar"` + `defaultFormula` + `tiers[].formula` — active when `costMode` is absent/`"dollar"`

## Convex functions (auction-only)

- **`convex/draft/picks.ts`**: `nominate`, `bumpNominationBid`, `setNominationBid`, `passNomination`, `undoNomination`, `resolvePick` (the write path for a won bid), `applySleeperSyncedPicks` (internal — live Sleeper *auction*-draft polling; always writes `price`, never `round`)
- **`convex/draft/nominationOrder.ts`** (whole file): `nextNominator`, `getCurrentNominator(Public)`, `getNominationConfig(Public)`, `setNominationOrder`, `clearNominationOrder`, `setCurrentNominator` — shares the `draftNominationTurns` table with snake/linear's turn-tracking
- **`convex/draft/plan.ts`** (whole file): `getBudgetPlan`, `getLiveBudgetPlan`, `upsertBudgetPlan`, `upsertLiveBudgetOverrides`, `resetLiveBudgetPlan`
- **`convex/draft/budgetAutoAdjust.ts`** (whole file): `computeAutoAdjustedOverrides`, `autoAdjustLiveBudgetForPick` — only called from `resolvePick`
- **`convex/draft/reportCard.ts`** (whole file) + **`convex/gemini/reportSummary.ts`** — Report Card is auction-only by design: grades teams on $ surplus/VOR/starters-strength (`pick.price ?? 0`). See Gap #4 — nothing stops it from also running for snake/linear.
- Branch-only spots in shared functions: `convex/leagues.ts`'s `importPreviousSeasonHistory` (non-round path writes `price: player.price ?? 1`); `convex/sleeper/league.ts`'s `fetchPreviousSeasonPreview` (auction branch builds `priceByPlayerId`)

## Frontend (auction-only)

- `/league/$leagueId/budget` → `src/components/BudgetTab.tsx` — tab hidden entirely for snake/linear by `route.tsx`
- `/league/$leagueId/draft` → `src/pages/DraftRoom/DraftTab.tsx` (dispatched only when `draftType === "auction"`) — recommended-nominations panel + Recent Picks / Targets tables
- `DraftTopBar.tsx` — persistent nominate/bid/resolve bar, mounted only `isStarted && isAuction`
- `NominationPanel.tsx` / `MobileNomination.tsx` — desktop card / mobile sheet nominate+bid UI
- `RecommendedNominations.tsx` — bidding-strategy suggestions (`src/lib/nominationStrategies.ts`)
- `RecentPicksTable.tsx`, `ShortlistTable.tsx` — show `pick.price` directly
- `StatTile.tsx`, `MobileStatsRow.tsx` — $ stat cards (Remaining/Max Bid/Budget±/Empty Spots)
- `BudgetStats.tsx` (in `DraftBoard.tsx`'s auction branch) — max bid / empty spots stat block on the TV board
- `src/hooks/useTeamBudget.ts`, `usePlanSlots.ts`; `src/lib/teamBudget.ts`, `budgetCategories.ts`, `budgetPresets.ts`, `unallocatedBadge.ts`; `src/constants/budget.ts` — $ budget math/UI plumbing

## Shared / must maintain both

**Schema**: `draftPicks` (core fields — `draftId`, `sequence`, `fpid`, `position`, `teamId`, `isKeeper`, `keeperStreak`, `teamAssignmentConfirmed`, `createdAt`; format-specific fields `price` vs `round`/`pickInRound`/`overallPick` sit side-by-side, exactly one set populated per format); `draftNominationTurns` (single "whose turn" pointer — soft suggestion for auction, authoritative for snake/linear); `seasonTeams`, `rosterPlayers`, `leagues`, `seasons` (minus costMode-specific keeper fields), `drafts` (status/startedAt/kind/historySource/sleeperSync*); players/projections/rankings/playerPoints/injuries/standardValues; `valueGaps`/`draftValues` caches; `preDraftInsights`; billing/OAuth tables.

**Functions**:
- `convex/draftType.ts`'s `resolveDraftType` — the one resolver every format-aware function/component calls
- `convex/draft/auth.ts` — `requireSeasonOwner`, `requireRealDraft`, `requireDraftOwner`, `requireDraftNotStarted`, `requireDraftStarted`
- `convex/draft/pickOrder.ts` — `rawStep`/`stepPickOrder`/`resolveTeamPositionInRound`, the shared rotation engine both `nominationOrder.ts` (auction) and `draftOrder.ts`/`pickSlots.ts`/`draftPick` (snake/linear) call into. **This math never gets duplicated client-side** — every frontend consumer reads pre-resolved data.
- `convex/draft/picks.ts` shared surface: `listDraftPicks(Public)`, `addKeeper` (explicit branch: auction needs `price`, snake/linear needs `round` + `resolveRoundConflict` — the model pattern for a properly-shared function), `removeKeeper`, `setKeeperStreak`, `setKeeperPrice` (⚠ not gated, see Gaps), `setKeeperTeam` (explicit branch on round presence), `removePick`, `undoLastPick`
- `convex/draft/keeperRules.ts` — `setKeeperRules`/`setKeeperTierPlayers`, persists the whole mixed-shape `keeperRules` object without itself branching (readers discriminate via `costMode`)
- `convex/draft/teams.ts`, `lifecycle.ts`, `status.ts` (`syncDraftStatus`), `slots.ts`, `board.ts`, `tags.ts`, `tiers.ts`, `history.ts`, `manualHistory.ts`, `playerDetail.ts`, `lineupOptimizer.ts`, `customPlayers.ts`, `consistency.ts`, `insights.ts`
- `convex/leagues.ts` — `listSeasons`, `getSeasonPublic`, `createLeague`, `updateSeason`, `importPreviousSeasonHistory` (branches internally), `setUseKeepers`, `setDraftType` (dedicated post-creation format-correction mutation; pre-draft + zero-picks only), Sleeper/Yahoo link setters, `deleteLeague`
- `convex/draftValues.ts`, `convex/valueGaps.ts` — VBD/points/ADP-gap caches computed for every format (⚠ `dollarValue` specifically is auction-flavored but computed unconditionally — see Gaps)
- Sleeper/Yahoo sync (`convex/sleeper/league.ts`, `convex/yahoo/league.ts`), billing (`convex/billing/*`), Gemini (`convex/gemini/*` minus `reportSummary`), rankings/projections/players/scoring/positions

**Frontend**:
- `src/routes/index.tsx` (Dashboard), `route.tsx` (LeagueLayout — computes `isAuction` once, hides Budget tab / `DraftTopBar` accordingly), `settings.tsx` → `LeagueDetails.tsx` (heaviest branching page: draft-type control, salary-cap stat, `TeamsPanel`/`PickSlotsPanel` props), `keepers.tsx` → `KeepersTab.tsx` (computes `isSnakeOrLinear` once, threads into every keeper subcomponent), `league.tsx` → `LeagueTab.tsx`, `myTeam.tsx` → `MyTeamTab.tsx`, `players.tsx` (dispatches on `phase.isStarted`, **not** format), `injuries.tsx`, `/reportCard/$leagueId` (fully format-agnostic), `/season/$leagueId/*` (post-draft, fully shared)
- `src/pages/DraftBoard/DraftBoard.tsx` — the format dispatcher itself (`isAuction` → early-return `SnakeDraftBoard`)
- `src/hooks/useFitScale.ts` (used by both TV boards), `useDraftPhase.ts`, `useSelfTeam.ts`
- `src/constants/leagueSettings.ts` — `DRAFT_TYPE_OPTIONS`, `DEFAULT_FORM`, `DEFAULT_KEEPER_RULES`
- `src/lib/featureFlags.ts` — `SNAKE_DRAFT_ENABLED`

**Critical invariant**: `costMode` (written by `KeeperRulesPanel.handleSave` as `isSnakeOrLinear ? "round" : "dollar"`) is the schema source of truth for $-vs-round keeper formula, but every frontend reader (`KeeperSearchForm`, `RecommendedKeepers`, `SleeperKeeperSuggestions`, `KeeperCardList`, `KeeperPriceCell`) independently re-derives `isSnakeOrLinear` from `settings.draftType` rather than reading `costMode`. **These two must never drift** — nothing enforces agreement if `draftType` and `keeperRules.costMode` are ever changed independently.

## Known gaps / landmines

1. `nominate`/`bumpNominationBid`/`setNominationBid`/`passNomination`/`undoNomination`/`resolvePick` have **no `resolveDraftType` check** — nothing server-side stops calling them against a snake/linear season. Only the frontend not calling them protects this boundary (contrast with `draftPick`, which explicitly throws for auction).
2. `setKeeperPrice` patches `price` unconditionally, with no check the season is actually auction-typed.
3. `setTeamSalaryCap` has no format guard; `dollarValue`/`totalCapDollars` are computed unconditionally in `draftValues.ts` regardless of format.
4. **Biggest cross-cutting risk**: `syncDraftStatus` (`convex/draft/status.ts`) unconditionally schedules `snapshotReportCard` + `generateReportSummary` whenever **any** real draft reaches `status: "complete"` — no `draftType` check. Report Card defaults every pick's price via `pick.price ?? 0`, so a completed snake/linear draft gets a Gemini-generated recap of nonsense and meaningless surplus grades (every non-keeper pick's surplus = full `dollarValue`). Needs either a guard in `syncDraftStatus`/`reportCard.ts`, or a real product decision to build a round/ADP-based Report Card analog for snake/linear.
5. `applySleeperSyncedPicks` (live Sleeper sync) always writes `price`, never `round` — live-sync only actually supports auction today, silently.
