/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as draft_auth from "../draft/auth.js";
import type * as draft_board from "../draft/board.js";
import type * as draft_fetchHelpers from "../draft/fetchHelpers.js";
import type * as draft_history from "../draft/history.js";
import type * as draft_keeperRules from "../draft/keeperRules.js";
import type * as draft_nominationOrder from "../draft/nominationOrder.js";
import type * as draft_picks from "../draft/picks.js";
import type * as draft_plan from "../draft/plan.js";
import type * as draft_playerDetail from "../draft/playerDetail.js";
import type * as draft_slots from "../draft/slots.js";
import type * as draft_tags from "../draft/tags.js";
import type * as draft_teams from "../draft/teams.js";
import type * as draft_tiers from "../draft/tiers.js";
import type * as draftValues from "../draftValues.js";
import type * as fantasyPros_client from "../fantasyPros/client.js";
import type * as fantasyPros_news from "../fantasyPros/news.js";
import type * as fetchAllData from "../fetchAllData.js";
import type * as http from "../http.js";
import type * as injuries from "../injuries.js";
import type * as injurySnapshots from "../injurySnapshots.js";
import type * as leagues from "../leagues.js";
import type * as news from "../news.js";
import type * as nflState from "../nflState.js";
import type * as playerPoints from "../playerPoints.js";
import type * as players from "../players.js";
import type * as positions from "../positions.js";
import type * as projections from "../projections.js";
import type * as rankings from "../rankings.js";
import type * as scoring from "../scoring.js";
import type * as season_faabValues from "../season/faabValues.js";
import type * as season_rosterPlayers from "../season/rosterPlayers.js";
import type * as sleeper_client from "../sleeper/client.js";
import type * as sleeper_league from "../sleeper/league.js";
import type * as sleeper_leagueSettingsMapping from "../sleeper/leagueSettingsMapping.js";
import type * as sleeper_playerPoints from "../sleeper/playerPoints.js";
import type * as sleeper_projections from "../sleeper/projections.js";
import type * as sleeper_state from "../sleeper/state.js";
import type * as users from "../users.js";
import type * as valueGaps from "../valueGaps.js";
import type * as yahoo_client from "../yahoo/client.js";
import type * as yahoo_league from "../yahoo/league.js";
import type * as yahoo_oauth from "../yahoo/oauth.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  "draft/auth": typeof draft_auth;
  "draft/board": typeof draft_board;
  "draft/fetchHelpers": typeof draft_fetchHelpers;
  "draft/history": typeof draft_history;
  "draft/keeperRules": typeof draft_keeperRules;
  "draft/nominationOrder": typeof draft_nominationOrder;
  "draft/picks": typeof draft_picks;
  "draft/plan": typeof draft_plan;
  "draft/playerDetail": typeof draft_playerDetail;
  "draft/slots": typeof draft_slots;
  "draft/tags": typeof draft_tags;
  "draft/teams": typeof draft_teams;
  "draft/tiers": typeof draft_tiers;
  draftValues: typeof draftValues;
  "fantasyPros/client": typeof fantasyPros_client;
  "fantasyPros/news": typeof fantasyPros_news;
  fetchAllData: typeof fetchAllData;
  http: typeof http;
  injuries: typeof injuries;
  injurySnapshots: typeof injurySnapshots;
  leagues: typeof leagues;
  news: typeof news;
  nflState: typeof nflState;
  playerPoints: typeof playerPoints;
  players: typeof players;
  positions: typeof positions;
  projections: typeof projections;
  rankings: typeof rankings;
  scoring: typeof scoring;
  "season/faabValues": typeof season_faabValues;
  "season/rosterPlayers": typeof season_rosterPlayers;
  "sleeper/client": typeof sleeper_client;
  "sleeper/league": typeof sleeper_league;
  "sleeper/leagueSettingsMapping": typeof sleeper_leagueSettingsMapping;
  "sleeper/playerPoints": typeof sleeper_playerPoints;
  "sleeper/projections": typeof sleeper_projections;
  "sleeper/state": typeof sleeper_state;
  users: typeof users;
  valueGaps: typeof valueGaps;
  "yahoo/client": typeof yahoo_client;
  "yahoo/league": typeof yahoo_league;
  "yahoo/oauth": typeof yahoo_oauth;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
