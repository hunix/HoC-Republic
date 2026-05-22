/**
 * Sandbox Tool Definitions — Barrel re-export
 *
 * The original 3,806-line monolith has been decomposed into category-specific
 * modules under `sandbox-tool-defs/`. This barrel reconstructs the single
 * `TOOLS` array and re-exports the `ToolInput` interface for backward
 * compatibility.
 *
 * Modules:
 *   types.ts        — ToolInput interface
 *   sandbox-core.ts — File system, exec, install (5 tools)
 *   web-browser.ts  — Web scraping, browser automation (6 tools)
 *   documents.ts    — Document creation, archiving (8 tools)
 *   devops.ts       — CI/CD, deploy, testing, Supabase, linting (56 tools)
 *   creative.ts     — GPU, image/video gen, TTS, data viz (12 tools)
 *   extended.ts     — Memory, knowledge, integrations, utilities (31 tools)
 *   sovereign.ts   — Vision, search+RAG, knowledge, code interpreter, voice (7 tools)
 */

import { CREATIVE_TOOLS } from "./sandbox-tool-defs/creative.js";
import { DEVOPS_TOOLS } from "./sandbox-tool-defs/devops.js";
import { DOCUMENTS_TOOLS } from "./sandbox-tool-defs/documents.js";
import { EXTENDED_TOOLS } from "./sandbox-tool-defs/extended.js";
import { SANDBOX_CORE_TOOLS } from "./sandbox-tool-defs/sandbox-core.js";
import { SOVEREIGN_TOOLS } from "./sandbox-tool-defs/sovereign.js";
import { WEB_BROWSER_TOOLS } from "./sandbox-tool-defs/web-browser.js";

export type { ToolInput } from "./sandbox-tool-defs/types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tool schemas have heterogeneous shapes
export const TOOLS = [
  // oxlint-disable-next-line no-explicit-any
  ...(SANDBOX_CORE_TOOLS as any[]),
  // oxlint-disable-next-line no-explicit-any
  ...(WEB_BROWSER_TOOLS as any[]),
  // oxlint-disable-next-line no-explicit-any
  ...(DOCUMENTS_TOOLS as any[]),
  // oxlint-disable-next-line no-explicit-any
  ...(DEVOPS_TOOLS as any[]),
  // oxlint-disable-next-line no-explicit-any
  ...(CREATIVE_TOOLS as any[]),
  // oxlint-disable-next-line no-explicit-any
  ...(EXTENDED_TOOLS as any[]),
  // oxlint-disable-next-line no-explicit-any
  ...(SOVEREIGN_TOOLS as any[]),
] as {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}[];
