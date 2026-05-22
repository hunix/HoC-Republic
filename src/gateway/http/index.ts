/**
 * Gateway HTTP sub-package
 *
 * Re-exports all HTTP transport modules:
 * - server-http.ts          — main REST/HTTP server and request routing
 * - openai-http.ts          — OpenAI-compatible HTTP endpoint
 * - openresponses-http.ts   — OpenAI /responses API endpoint
 * - http-common.ts          — shared HTTP middleware and utilities
 * - http-utils.ts           — HTTP helper functions (parsing, CORS, etc.)
 *
 * Import from here for the canonical domain path:
 *   import { startHttpServer } from "../../gateway/http/index.js"
 */

export * from "../server-http.js";
export * from "../openai-http.js";
export * from "../openresponses-http.js";
export * from "../http-common.js";
export * from "../http-utils.js";
