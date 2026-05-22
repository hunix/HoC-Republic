/**
 * Sandbox Agent Loop — Provider Selection & Dual-Mode Setup
 *
 * Handles provider auto-selection, [THINK]/[EXEC] prefix routing,
 * dual-model orchestration, MCP server loading, and tool compilation.
 */

import path from "node:path";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { getHandlerMap, allSummaries } from "../agent-loop/tool-executor.js";
import {
  type AgentProvider,
  type AgentBroadcaster,
  key,
  selectAgentProvider,
  providerModelId,
  providerLabel,
  PROVIDER_MAP,
  parseProviderModel,
} from "../agent-providers/index.js";
import { mcpManager } from "../mcp-client.js";
import { getSandboxTools } from "../registries/tool-def-registry.js";
import { recallKnowledge } from "../sandbox-knowledge-bridge.js";
import { SYSTEM_PROMPT } from "../sandbox-system-prompt.js";
import { TOOLS as STATIC_TOOLS } from "../sandbox-tool-defs.js";
import { isMcpLoaded, markMcpLoaded, type SandboxAgentLoopOpts } from "./config.js";

const logger = createSubsystemLogger("sandbox-agent");

// ─── Provider Setup Result ──────────────────────────────────────

export interface ProviderSetupResult {
  provider: AgentProvider;
  modelId: string;
  label: string;
  effectiveTools: typeof STATIC_TOOLS;
  compiledTools: typeof STATIC_TOOLS;
  systemPrompt: string;
  userMessage: string;
  dualModePrefix: string;
  thinkProvider: AgentProvider | null;
  thinkModel: string | null;
  execProvider: AgentProvider | null;
  execModel: string | null;
  hasDualModels: boolean;
}

// ─── Provider Selection ─────────────────────────────────────────

/**
 * Select the initial provider based on user override or automatic detection.
 */
export function resolveProvider(opts?: SandboxAgentLoopOpts): AgentProvider | null {
  if (opts?.modelOverride?.provider && opts.modelOverride.modelId) {
    const p = opts.modelOverride.provider.toLowerCase();
    return PROVIDER_MAP[p] ?? selectAgentProvider();
  }
  return selectAgentProvider();
}

/**
 * Resolve the model ID from user override or provider default.
 */
export function resolveModelId(provider: AgentProvider, opts?: SandboxAgentLoopOpts): string {
  if (opts?.modelOverride?.provider && opts.modelOverride.modelId && provider) {
    return opts.modelOverride.modelId;
  }
  return providerModelId(provider);
}

// ─── MCP & Tool Loading ─────────────────────────────────────────

/**
 * Load MCP servers (one-time) and refresh handler maps.
 * Returns the compiled tool list (static + MCP + dynamic registry).
 */
export async function loadToolsAndMcp(): Promise<{
  compiledTools: typeof STATIC_TOOLS;
  handlers: Record<string, unknown>;
}> {
  // Auto-load MCP Config (one-time)
  if (!isMcpLoaded()) {
    await mcpManager.loadConfig(path.join(process.cwd(), "mcp-servers.json")).catch(() => {});
    markMcpLoaded();
  }

  // Refresh MCP handlers (every loop — handlers may change after reconnect)
  const handlers = await getHandlerMap();
  try {
    const mcpLlmToolsList = await mcpManager.getAllLlmTools();
    if (mcpLlmToolsList.length > 0) {
      for (const serverId of (
        mcpManager as unknown as { clients: Map<string, unknown> }
      ).clients.keys()) {
        const { handlers: mcpH, summaries: mcpS } = await mcpManager.exportHandlers(
          serverId as string,
        );
        Object.assign(handlers, mcpH);
        Object.assign(allSummaries, mcpS);
      }
    }
  } catch {
    /* Ignored if no MCP servers connected */
  }

  // Load tools from Dynamic Registry (UI-editable) with static fallback
  let TOOLS: typeof STATIC_TOOLS;
  try {
    const dynamicTools = await getSandboxTools();
    TOOLS = dynamicTools.length > 0 ? (dynamicTools as typeof STATIC_TOOLS) : STATIC_TOOLS;
  } catch {
    TOOLS = STATIC_TOOLS;
  }

  const mcpLlmTools = await mcpManager.getAllLlmTools();
  const compiledTools = [...TOOLS, ...mcpLlmTools] as typeof STATIC_TOOLS;

  return { compiledTools, handlers: handlers as Record<string, unknown> };
}

// ─── Dual-Mode Prefix Routing ───────────────────────────────────

/**
 * Handle [THINK]/[EXEC] prefixes: route to specific providers and filter tools.
 */
export function applyDualModePrefix(
  userMessage: string,
  provider: AgentProvider,
  modelId: string,
  compiledTools: typeof STATIC_TOOLS,
  broadcaster: AgentBroadcaster,
): {
  userMessage: string;
  provider: AgentProvider;
  modelId: string;
  effectiveTools: typeof STATIC_TOOLS;
  dualModePrefix: string;
  label: string;
} {
  if (userMessage.startsWith("[THINK]")) {
    const msg = userMessage.slice(7).trim();
    let p = provider;
    let m = modelId;
    if (key("ANTHROPIC_API_KEY")) {
      p = "anthropic";
      m = "claude-sonnet-4-6-20260217";
    } else if (key("GEMINI_API_KEY")) {
      p = "gemini";
      m = "gemini-3.1-pro-preview";
    }
    const effectiveTools = compiledTools.filter(
      (t) =>
        t.name === "agent_memory" ||
        t.name === "web_search" ||
        t.name === "deerflow_research" ||
        t.name === "knowledge_graph_query" ||
        t.name === "knowledge_store",
    ) as typeof STATIC_TOOLS;
    const label = `🧠 THINK → ${providerLabel(p, m)}`;
    broadcaster.send(
      `🧠 **THINK MODE** — ${providerLabel(p, m)} | ${effectiveTools.length} tools (research only)\n`,
    );
    return {
      userMessage: `[PLANNING MODE — Think step-by-step, plan thoroughly, do NOT execute or write code yet]\n\n${msg}`,
      provider: p,
      modelId: m,
      effectiveTools,
      dualModePrefix: "[THINK]",
      label,
    };
  }

  if (userMessage.startsWith("[EXEC]")) {
    const msg = userMessage.slice(6).trim();
    let p = provider;
    let m = modelId;
    if (key("GEMINI_API_KEY")) {
      p = "gemini";
      m = "gemini-3.1-pro-preview";
    }
    const label = `⚡ EXEC → ${providerLabel(p, m)}`;
    broadcaster.send(`⚡ **EXEC MODE** — ${providerLabel(p, m)} | ${compiledTools.length} tools\n`);
    return {
      userMessage: `[EXECUTION MODE — Execute efficiently, use tools to build, write files, generate assets. Be thorough.]\n\n${msg}`,
      provider: p,
      modelId: m,
      effectiveTools: compiledTools,
      dualModePrefix: "[EXEC]",
      label,
    };
  }

  // No prefix — return as-is
  return {
    userMessage,
    provider,
    modelId,
    effectiveTools: compiledTools,
    dualModePrefix: "",
    label: providerLabel(provider, modelId),
  };
}

// ─── Dual-Model Config ──────────────────────────────────────────

export interface DualModelConfig {
  thinkProvider: AgentProvider | null;
  thinkModel: string | null;
  execProvider: AgentProvider | null;
  execModel: string | null;
  hasDualModels: boolean;
}

/**
 * Parse dual-model configuration from opts (thinkModelId / execModelId).
 */
export function parseDualModelConfig(
  opts: SandboxAgentLoopOpts | undefined,
  dualModePrefix: string,
): DualModelConfig {
  let thinkProvider: AgentProvider | null = null;
  let thinkModel: string | null = null;
  let execProvider: AgentProvider | null = null;
  let execModel: string | null = null;

  if (!dualModePrefix && opts?.thinkModelId) {
    const parsed = parseProviderModel(opts.thinkModelId);
    if (parsed) {
      thinkProvider = parsed.provider;
      thinkModel = parsed.model;
    }
  }
  if (!dualModePrefix && opts?.execModelId) {
    const parsed = parseProviderModel(opts.execModelId);
    if (parsed) {
      execProvider = parsed.provider;
      execModel = parsed.model;
    }
  }

  return {
    thinkProvider,
    thinkModel,
    execProvider,
    execModel,
    hasDualModels: !!(thinkProvider && thinkModel) || !!(execProvider && execModel),
  };
}

// ─── Knowledge Recall ───────────────────────────────────────────

/**
 * Recall relevant knowledge from the memory graph. Never blocks on failure.
 */
export async function loadKnowledgeContext(
  userMessage: string,
  broadcaster: AgentBroadcaster,
): Promise<string> {
  try {
    const ctx = await recallKnowledge(userMessage);
    if (ctx) {
      broadcaster.send("🧠 Recalled relevant knowledge from memory graph\n");
      logger.info(`[AgentLoop] Knowledge recall: ${ctx.length} chars injected`);
    }
    return ctx;
  } catch {
    return "";
  }
}

/**
 * Build the system prompt, optionally enriched with knowledge context.
 */
export function buildSystemPrompt(knowledgeContext: string): string {
  return knowledgeContext ? `${SYSTEM_PROMPT}\n${knowledgeContext}` : SYSTEM_PROMPT;
}
