/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as aiConfig from "../aiConfig.js";
import type * as aiRuntime from "../aiRuntime.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as cases from "../cases.js";
import type * as events from "../events.js";
import type * as evidence from "../evidence.js";
import type * as game from "../game.js";
import type * as http from "../http.js";
import type * as messages from "../messages.js";
import type * as publicErrors from "../publicErrors.js";
import type * as reveal from "../reveal.js";
import type * as roleTurns from "../roleTurns.js";
import type * as sessions from "../sessions.js";
import type * as voice from "../voice.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  aiConfig: typeof aiConfig;
  aiRuntime: typeof aiRuntime;
  audit: typeof audit;
  auth: typeof auth;
  cases: typeof cases;
  events: typeof events;
  evidence: typeof evidence;
  game: typeof game;
  http: typeof http;
  messages: typeof messages;
  publicErrors: typeof publicErrors;
  reveal: typeof reveal;
  roleTurns: typeof roleTurns;
  sessions: typeof sessions;
  voice: typeof voice;
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
