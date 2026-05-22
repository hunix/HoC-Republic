/**
 * tool-def-registry.ts — Dynamic Tool Definition Registry
 *
 * Unifies sandbox-tool-defs.ts (Anthropic format, ~40 tools) and
 * tool-executor.ts (ToolDefinition format, ~130 tools) into one
 * searchable, UI-editable registry.
 *
 * Domains:
 *   "sandbox-tools"  — Anthropic-format schemas for sandbox agent loop
 *   "republic-tools"  — ToolDefinition-format schemas for citizen tool executor
 */

import {
  registryGet,
  registryList,
  registryUpsert,
  registryRemove,
  registrySearch,
  registrySeedIfEmpty,
  REGISTRY_DOMAINS,
  type RegistryEntry,
  type RegistryListOptions,
} from "../dynamic-registry.js";

// ─── Tool Entry Types ───────────────────────────────────────────

/** Anthropic-format tool schema (used by sandbox agent loop) */
export interface SandboxToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/** Republic tool definition (used by citizen tool executor) */
export interface RepublicToolDef {
  toolId: string;
  name: string;
  description: string;
  tier: 0 | 1 | 2 | 3;
  category: "internal" | "filesystem" | "network" | "financial" | "computation" | "communication";
  parameters: Array<{ name: string; type: string; required: boolean; description: string }>;
  timeoutMs: number;
  estimatedCost: { tokens?: number; credits?: number; computeMs?: number };
  executorRef?: string; // function name in execution-tools/ modules
}

// ─── Sandbox Tools (Anthropic format) ───────────────────────────

const SANDBOX_DOMAIN = REGISTRY_DOMAINS.TOOLS_SANDBOX;

/**
 * Get all enabled sandbox tools (Anthropic format).
 * This is the drop-in replacement for importing `TOOLS` from sandbox-tool-defs.ts.
 */
export async function getSandboxTools(): Promise<SandboxToolSchema[]> {
  const entries = await registryList<SandboxToolSchema>({
    domain: SANDBOX_DOMAIN,
    enabled: true,
    orderBy: "priority",
    orderDir: "asc",
  });
  return entries.map((e) => e.data);
}

/**
 * Get a single sandbox tool by name.
 */
export async function getSandboxTool(
  name: string,
): Promise<RegistryEntry<SandboxToolSchema> | null> {
  return registryGet<SandboxToolSchema>(name, SANDBOX_DOMAIN);
}

/**
 * List sandbox tools with filtering.
 */
export async function listSandboxTools(
  opts?: Omit<RegistryListOptions, "domain">,
): Promise<RegistryEntry<SandboxToolSchema>[]> {
  return registryList<SandboxToolSchema>({ ...opts, domain: SANDBOX_DOMAIN });
}

/**
 * Create or update a sandbox tool definition.
 */
export async function upsertSandboxTool(entry: {
  name: string;
  data: SandboxToolSchema;
  category?: string;
  priority?: number;
  tags?: string[];
  description?: string;
  createdBy?: string;
}): Promise<RegistryEntry<SandboxToolSchema>> {
  return registryUpsert<SandboxToolSchema>({
    id: entry.name,
    domain: SANDBOX_DOMAIN,
    category: entry.category ?? "sandbox",
    priority: entry.priority,
    data: entry.data,
    metadata: {
      tags: entry.tags ?? [],
      description: entry.description ?? entry.data.description.slice(0, 200),
      createdBy: entry.createdBy ?? "system",
    },
  });
}

/**
 * Seed sandbox tools from the existing TOOLS array.
 * Accepts the same format as sandbox-tool-defs.ts exports.
 */
export async function seedSandboxTools(tools: SandboxToolSchema[]): Promise<number> {
  const seeds = tools.map((t, i) => ({
    id: t.name,
    category: "sandbox",
    priority: i * 10,
    data: t,
    tags: [t.name],
    description: t.description.slice(0, 200),
  }));

  return registrySeedIfEmpty<SandboxToolSchema>(SANDBOX_DOMAIN, seeds);
}

// ─── Republic Tools (ToolDefinition format) ─────────────────────

const REPUBLIC_DOMAIN = REGISTRY_DOMAINS.TOOLS_REPUBLIC;

/**
 * Get all enabled republic tools.
 * Drop-in replacement for `getEnabledTools()` in tool-executor.ts.
 */
export async function getRepublicTools(): Promise<RepublicToolDef[]> {
  const entries = await registryList<RepublicToolDef>({
    domain: REPUBLIC_DOMAIN,
    enabled: true,
    orderBy: "priority",
    orderDir: "asc",
  });
  return entries.map((e) => e.data);
}

/**
 * Get a single republic tool by ID.
 */
export async function getRepublicTool(
  toolId: string,
): Promise<RegistryEntry<RepublicToolDef> | null> {
  return registryGet<RepublicToolDef>(toolId, REPUBLIC_DOMAIN);
}

/**
 * List republic tools with filtering.
 */
export async function listRepublicTools(
  opts?: Omit<RegistryListOptions, "domain">,
): Promise<RegistryEntry<RepublicToolDef>[]> {
  return registryList<RepublicToolDef>({ ...opts, domain: REPUBLIC_DOMAIN });
}

/**
 * Create or update a republic tool definition.
 */
export async function upsertRepublicTool(entry: {
  toolId: string;
  data: RepublicToolDef;
  category?: string;
  priority?: number;
  tags?: string[];
  description?: string;
  createdBy?: string;
  source?: "builtin" | "user" | "plugin" | "citizen";
}): Promise<RegistryEntry<RepublicToolDef>> {
  return registryUpsert<RepublicToolDef>({
    id: entry.toolId,
    domain: REPUBLIC_DOMAIN,
    category: entry.category ?? entry.data.category,
    priority: entry.priority,
    data: entry.data,
    metadata: {
      tags: entry.tags ?? [entry.data.category, `tier-${entry.data.tier}`],
      description: entry.description ?? entry.data.description.slice(0, 200),
      createdBy: entry.createdBy ?? "system",
      source: entry.source ?? "builtin",
    },
  });
}

/**
 * Remove a republic tool.
 */
export async function removeRepublicTool(toolId: string): Promise<boolean> {
  return registryRemove(toolId, REPUBLIC_DOMAIN);
}

/**
 * Search tool definitions across both sandbox and republic domains.
 */
export async function searchTools(
  query: string,
  opts?: { domain?: string; limit?: number },
): Promise<RegistryEntry<SandboxToolSchema | RepublicToolDef>[]> {
  return registrySearch<SandboxToolSchema | RepublicToolDef>(query, {
    domain: opts?.domain,
    limit: opts?.limit,
  });
}

/**
 * Seed republic tools from the existing ToolDefinition[] array.
 * Accepts the same format as initializeDefaultTools() produces.
 */
export async function seedRepublicTools(
  tools: Array<{
    id: string;
    name: string;
    description: string;
    tier: 0 | 1 | 2 | 3;
    category: string;
    parameters: Array<{ name: string; type: string; required: boolean; description: string }>;
    enabled: boolean;
    timeoutMs: number;
    estimatedCost: { tokens?: number; credits?: number; computeMs?: number };
  }>,
): Promise<number> {
  const seeds = tools.map((t, i) => ({
    id: t.id,
    category: t.category,
    priority: i,
    data: {
      toolId: t.id,
      name: t.name,
      description: t.description,
      tier: t.tier as 0 | 1 | 2 | 3,
      category: t.category as RepublicToolDef["category"],
      parameters: t.parameters,
      timeoutMs: t.timeoutMs,
      estimatedCost: t.estimatedCost,
    } satisfies RepublicToolDef,
    tags: [t.category, `tier-${t.tier}`, t.id],
    description: t.description.slice(0, 200),
  }));

  return registrySeedIfEmpty<RepublicToolDef>(REPUBLIC_DOMAIN, seeds);
}
