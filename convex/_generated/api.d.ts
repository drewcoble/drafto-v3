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
import type * as draft_picks from "../draft/picks.js";
import type * as draft_plan from "../draft/plan.js";
import type * as draft_slots from "../draft/slots.js";
import type * as draft_tags from "../draft/tags.js";
import type * as draft_teams from "../draft/teams.js";
import type * as draftSettings from "../draftSettings.js";
import type * as draftValues from "../draftValues.js";
import type * as fantasyPros_client from "../fantasyPros/client.js";
import type * as fantasyPros_news from "../fantasyPros/news.js";
import type * as fetchAllData from "../fetchAllData.js";
import type * as http from "../http.js";
import type * as injuries from "../injuries.js";
import type * as news from "../news.js";
import type * as playerPoints from "../playerPoints.js";
import type * as players from "../players.js";
import type * as positions from "../positions.js";
import type * as projections from "../projections.js";
import type * as rankings from "../rankings.js";
import type * as scoring from "../scoring.js";
import type * as sleeper_client from "../sleeper/client.js";
import type * as sleeper_playerPoints from "../sleeper/playerPoints.js";
import type * as sleeper_projections from "../sleeper/projections.js";
import type * as users from "../users.js";

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
  "draft/picks": typeof draft_picks;
  "draft/plan": typeof draft_plan;
  "draft/slots": typeof draft_slots;
  "draft/tags": typeof draft_tags;
  "draft/teams": typeof draft_teams;
  draftSettings: typeof draftSettings;
  draftValues: typeof draftValues;
  "fantasyPros/client": typeof fantasyPros_client;
  "fantasyPros/news": typeof fantasyPros_news;
  fetchAllData: typeof fetchAllData;
  http: typeof http;
  injuries: typeof injuries;
  news: typeof news;
  playerPoints: typeof playerPoints;
  players: typeof players;
  positions: typeof positions;
  projections: typeof projections;
  rankings: typeof rankings;
  scoring: typeof scoring;
  "sleeper/client": typeof sleeper_client;
  "sleeper/playerPoints": typeof sleeper_playerPoints;
  "sleeper/projections": typeof sleeper_projections;
  users: typeof users;
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
