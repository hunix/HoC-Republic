/**
 * Gateway channels sub-package
 *
 * Re-exports all messaging channel modules:
 * - server-channels.ts — channel lifecycle (WhatsApp, Telegram, Email, etc.)
 *
 * Import from here for the canonical domain path:
 *   import { ... } from "../../gateway/channels/index.js"
 */

export * from "../server-channels.js";
