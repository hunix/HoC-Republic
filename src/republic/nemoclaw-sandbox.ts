/**
 * Republic NemoClaw Sandbox Policy Engine
 *
 * Ports the declarative network policy concept from NVIDIA NemoClaw's
 * openclaw-sandbox.yaml into HoC's Republic infrastructure.
 *
 * Provides per-tool egress whitelists — each tool type from real-execution.ts
 * maps to a set of allowed endpoints. The exec-approval system can query
 * this engine to enforce or advise on network access.
 *
 * On Windows this is advisory-only (Landlock requires Linux 5.13+).
 * The real value is making policy data visible to operators via the UI.
 *
 * Architecture:
 *   Tool Execution → checkEgressPolicy() → allow / deny / prompt-operator
 *   UI / RPC → getActivePolicies() / updatePolicy() → runtime management
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("republic:nemoclaw-sandbox");

// ─── Types ──────────────────────────────────────────────────────

export interface EgressEndpoint {
  /** Hostname (e.g. "api.github.com") */
  host: string;
  /** Port (e.g. 443) */
  port: number;
  /** Allowed HTTP methods (empty = all) */
  methods?: string[];
  /** Allowed URL path prefixes (empty = all) */
  pathPrefixes?: string[];
}

export interface SandboxPolicy {
  /** Policy identifier (e.g. "github", "npm_registry") */
  id: string;
  /** Human-readable label */
  label: string;
  /** Tool names this policy applies to (from real-execution.ts) */
  toolNames: string[];
  /** Allowed egress endpoints */
  endpoints: EgressEndpoint[];
  /** Whether this policy is currently active */
  enabled: boolean;
  /** Policy source (builtin or user-defined) */
  source: "builtin" | "custom";
  /** When the policy was last modified */
  updatedAt: string;
}

export interface EgressCheckResult {
  allowed: boolean;
  policyId: string | null;
  reason: string;
}

// ─── Built-in Policies ──────────────────────────────────────────
// Modeled after NemoClaw's openclaw-sandbox.yaml baseline policy

const BUILTIN_POLICIES: SandboxPolicy[] = [
  {
    id: "github",
    label: "GitHub (Git + REST API)",
    toolNames: ["git_clone", "git_push", "git_pull", "github_api", "execute_command"],
    endpoints: [
      { host: "github.com", port: 443 },
      { host: "api.github.com", port: 443, methods: ["GET", "POST", "PATCH", "PUT", "DELETE"] },
    ],
    enabled: true,
    source: "builtin",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "npm_registry",
    label: "npm Registry (read-only)",
    toolNames: ["npm_install", "npm_publish", "execute_command"],
    endpoints: [
      { host: "registry.npmjs.org", port: 443, methods: ["GET"] },
    ],
    enabled: true,
    source: "builtin",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "nvidia_nim",
    label: "NVIDIA NIM Inference",
    toolNames: ["llm_inference", "cloud_inference"],
    endpoints: [
      { host: "integrate.api.nvidia.com", port: 443 },
      { host: "inference-api.nvidia.com", port: 443 },
    ],
    enabled: true,
    source: "builtin",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "anthropic",
    label: "Anthropic Claude API",
    toolNames: ["llm_inference", "cloud_inference"],
    endpoints: [
      { host: "api.anthropic.com", port: 443 },
      { host: "statsig.anthropic.com", port: 443 },
    ],
    enabled: true,
    source: "builtin",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "openai",
    label: "OpenAI API",
    toolNames: ["llm_inference", "cloud_inference"],
    endpoints: [
      { host: "api.openai.com", port: 443 },
    ],
    enabled: true,
    source: "builtin",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "google_ai",
    label: "Google Gemini API",
    toolNames: ["llm_inference", "cloud_inference"],
    endpoints: [
      { host: "generativelanguage.googleapis.com", port: 443 },
    ],
    enabled: true,
    source: "builtin",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "groq",
    label: "Groq Inference API",
    toolNames: ["llm_inference", "cloud_inference"],
    endpoints: [
      { host: "api.groq.com", port: 443 },
    ],
    enabled: true,
    source: "builtin",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "openrouter",
    label: "OpenRouter Multi-Model API",
    toolNames: ["llm_inference", "cloud_inference"],
    endpoints: [
      { host: "openrouter.ai", port: 443 },
    ],
    enabled: true,
    source: "builtin",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "web_search",
    label: "Web Search Engines",
    toolNames: ["web_search", "web_browse"],
    endpoints: [
      { host: "html.duckduckgo.com", port: 443, methods: ["GET"] },
      { host: "www.google.com", port: 443, methods: ["GET"] },
      { host: "api.search.brave.com", port: 443, methods: ["GET"] },
    ],
    enabled: true,
    source: "builtin",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "clawhub",
    label: "ClawHub Skill Registry",
    toolNames: ["clawhub_install", "clawhub_search"],
    endpoints: [
      { host: "clawhub.com", port: 443, methods: ["GET", "POST"] },
    ],
    enabled: true,
    source: "builtin",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "local_inference",
    label: "Local Inference (unrestricted)",
    toolNames: ["llm_inference", "local_inference"],
    endpoints: [
      { host: "127.0.0.1", port: 1234 },  // LM Studio
      { host: "127.0.0.1", port: 11434 }, // Ollama
      { host: "localhost", port: 1234 },
      { host: "localhost", port: 11434 },
    ],
    enabled: true,
    source: "builtin",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "telegram",
    label: "Telegram Bot API",
    toolNames: ["send_message", "telegram_bot"],
    endpoints: [
      { host: "api.telegram.org", port: 443, methods: ["GET", "POST"], pathPrefixes: ["/bot"] },
    ],
    enabled: true,
    source: "builtin",
    updatedAt: new Date().toISOString(),
  },
];

// ─── State ──────────────────────────────────────────────────────

const policies: Map<string, SandboxPolicy> = new Map();
let initialized = false;

// ─── Lifecycle ──────────────────────────────────────────────────

/** Initialize the policy engine with built-in policies */
export function initSandboxPolicies(): void {
  if (initialized) {return;}
  for (const policy of BUILTIN_POLICIES) {
    policies.set(policy.id, { ...policy });
  }
  initialized = true;
  logger.info(`Sandbox policy engine initialized with ${policies.size} policies`);
}

// Auto-init on import
initSandboxPolicies();

// ─── Policy Queries ─────────────────────────────────────────────

/**
 * Check if an egress request is allowed by active policies.
 *
 * @param toolName - The tool attempting the request (from real-execution.ts)
 * @param targetHost - Target hostname
 * @param targetPort - Target port
 * @returns Check result with allow/deny and reason
 */
export function checkEgressPolicy(
  toolName: string,
  targetHost: string,
  targetPort: number,
): EgressCheckResult {
  // Find all active policies that cover this tool
  const matchingPolicies = [...policies.values()].filter(
    (p) => p.enabled && p.toolNames.includes(toolName),
  );

  if (matchingPolicies.length === 0) {
    // No policy covers this tool — default deny (or allow for uncategorized)
    return {
      allowed: false,
      policyId: null,
      reason: `No active policy covers tool "${toolName}" — egress blocked by default`,
    };
  }

  // Check if any matching policy allows this endpoint
  for (const policy of matchingPolicies) {
    for (const ep of policy.endpoints) {
      if (ep.host === targetHost && ep.port === targetPort) {
        return {
          allowed: true,
          policyId: policy.id,
          reason: `Allowed by policy "${policy.label}"`,
        };
      }
    }
  }

  return {
    allowed: false,
    policyId: matchingPolicies[0].id,
    reason: `Endpoint ${targetHost}:${targetPort} not whitelisted for tool "${toolName}"`,
  };
}

/**
 * Get all active policies.
 */
export function getActivePolicies(): SandboxPolicy[] {
  return [...policies.values()];
}

/**
 * Get a specific policy by ID.
 */
export function getPolicy(id: string): SandboxPolicy | undefined {
  return policies.get(id);
}

/**
 * Update a policy (add/remove endpoints, enable/disable).
 */
export function updatePolicy(
  id: string,
  updates: Partial<Pick<SandboxPolicy, "endpoints" | "enabled" | "toolNames" | "label">>,
): SandboxPolicy | null {
  const existing = policies.get(id);
  if (!existing) {return null;}

  const updated: SandboxPolicy = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  policies.set(id, updated);
  logger.info(`Updated sandbox policy "${id}"`, { enabled: updated.enabled });
  return updated;
}

/**
 * Create a new custom policy.
 */
export function createPolicy(policy: Omit<SandboxPolicy, "source" | "updatedAt">): SandboxPolicy {
  const full: SandboxPolicy = {
    ...policy,
    source: "custom",
    updatedAt: new Date().toISOString(),
  };
  policies.set(full.id, full);
  logger.info(`Created custom sandbox policy "${full.id}"`);
  return full;
}

/**
 * Delete a custom policy. Built-in policies can only be disabled, not deleted.
 */
export function deletePolicy(id: string): boolean {
  const existing = policies.get(id);
  if (!existing) {return false;}
  if (existing.source === "builtin") {
    logger.warn(`Cannot delete built-in policy "${id}" — use updatePolicy to disable it`);
    return false;
  }
  policies.delete(id);
  logger.info(`Deleted custom sandbox policy "${id}"`);
  return true;
}

/**
 * Get summary stats for the sandbox policy engine.
 */
export function getSandboxPolicyStats(): {
  totalPolicies: number;
  activePolicies: number;
  builtinPolicies: number;
  customPolicies: number;
  totalEndpoints: number;
  toolsCovered: string[];
} {
  const all = [...policies.values()];
  const active = all.filter((p) => p.enabled);
  const toolSet = new Set<string>();
  let totalEps = 0;

  for (const p of active) {
    for (const t of p.toolNames) {toolSet.add(t);}
    totalEps += p.endpoints.length;
  }

  return {
    totalPolicies: all.length,
    activePolicies: active.length,
    builtinPolicies: all.filter((p) => p.source === "builtin").length,
    customPolicies: all.filter((p) => p.source === "custom").length,
    totalEndpoints: totalEps,
    toolsCovered: [...toolSet].toSorted(),
  };
}
