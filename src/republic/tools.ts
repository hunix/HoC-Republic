/**
 * Republic Platform — Republic Agent Tools
 *
 * Barrel module that assembles the full tool registry from domain-specific
 * sub-modules. Each domain file (core, profession, dev, extended) contains
 * a focused subset of tools.
 *
 * In Phase 2, these tools are invoked by the agent runtime
 * when a citizen decides to act. In Phase 4, they become
 * MCP-compatible tool definitions.
 */

// (types previously imported here are used in sub-modules, not in this barrel)

// Re-export the tool interface from types for backward compatibility
export type { RepublicTool } from "./types.js";

import type { RepublicTool } from "./types.js";
import { ADVANCED_TOOLS } from "./tools/advanced.js";
import { AGI_TOOLS } from "./tools/agi.js";
// Domain tool arrays
import { CORE_TOOLS } from "./tools/core.js";
import { CREATIVE_TOOLS } from "./tools/creative-production.js";
import { DEV_TOOLS } from "./tools/dev.js";
import { DOCKER_TOOLS } from "./tools/docker.js";
import { EXTENDED_TOOLS } from "./tools/extended.js";
import { INTEL_TOOLS } from "./tools/intel.js";
import { PROFESSION_TOOLS } from "./tools/profession.js";
import { SCIENTIFIC_TOOLS } from "./tools/scientific.js";
import { SYSTEM_CONTROL_TOOLS } from "./tools/system-control.js";
import { FOREX_TOOLS } from "./tools/forex.js";
import { META_LEARNING_TOOLS } from "./tools/meta-learning.js";
import { CIVILIZATION_TOOLS } from "./tools/civilization-tools.js";
import { CINEMATIC_TOOLS } from "./tools/cinematic-tools.js";
import { CLAWHUB_TOOLS } from "./tools/clawhub-tools.js";

// ─── Tool Registry ──────────────────────────────────────────────

export const REPUBLIC_TOOLS: RepublicTool[] = [
  ...CORE_TOOLS,
  ...PROFESSION_TOOLS,
  ...DEV_TOOLS,
  ...EXTENDED_TOOLS,
  ...CREATIVE_TOOLS,
  ...SCIENTIFIC_TOOLS,
  ...ADVANCED_TOOLS,
  ...AGI_TOOLS,
  ...SYSTEM_CONTROL_TOOLS,
  ...INTEL_TOOLS,
  ...DOCKER_TOOLS,
  ...FOREX_TOOLS,
  ...META_LEARNING_TOOLS,
  ...CIVILIZATION_TOOLS,
  ...CINEMATIC_TOOLS,
  ...CLAWHUB_TOOLS,
];


// ─── Tool Lookup ────────────────────────────────────────────────

const toolMap = new Map(REPUBLIC_TOOLS.map((t) => [t.name, t]));

/** Get a tool by name. */
export function getTool(name: string): RepublicTool | undefined {
  return toolMap.get(name);
}

/** Get all tool names for use in prompts. */
export function getToolNames(): string[] {
  return REPUBLIC_TOOLS.map((t) => t.name);
}

/** Build a tool description string for LLM prompts. */
export function buildToolDescriptions(): string {
  return REPUBLIC_TOOLS.map((t) => {
    const params = Object.entries(t.parameters)
      .map(
        ([name, p]) => `  - ${name} (${p.type}${p.required ? ", required" : ""}): ${p.description}`,
      )
      .join("\n");
    return `${t.name}: ${t.description}\n${params}`;
  }).join("\n\n");
}
