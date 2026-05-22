/**
 * Gateway auth sub-package
 *
 * Re-exports all authentication, authorization, origin-check,
 * device-auth, and pairing-request modules from the gateway root.
 *
 * Import from here for the canonical domain path:
 *   import { authorizeGatewayConnect } from "../../gateway/auth/index.js"
 *
 * The original root files remain as the source of truth; this file makes
 * the gateway directory browsable by domain without moving anything.
 */

export * from "../auth.js";
export * from "../origin-check.js";
export * from "../device-auth.js";
export * from "../pair-request-store.js";
