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
import type * as draftSettings from "../draftSettings.js";
import type * as draftValues from "../draftValues.js";
import type * as fantasyPros_client from "../fantasyPros/client.js";
import type * as fantasyPros_injuries from "../fantasyPros/injuries.js";
import type * as fantasyPros_news from "../fantasyPros/news.js";
import type * as fantasyPros_playerPoints from "../fantasyPros/playerPoints.js";
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
  draftSettings: typeof draftSettings;
  draftValues: typeof draftValues;
  "fantasyPros/client": typeof fantasyPros_client;
  "fantasyPros/injuries": typeof fantasyPros_injuries;
  "fantasyPros/news": typeof fantasyPros_news;
  "fantasyPros/playerPoints": typeof fantasyPros_playerPoints;
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
