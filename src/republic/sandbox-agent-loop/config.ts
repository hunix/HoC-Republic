/**
 * Sandbox Agent Loop — Types & Configuration Constants
 */

import type { AgentLoopResult } from "../agent-providers/index.js";

// ─── Configuration ──────────────────────────────────────────────

export const MAX_ITERATIONS = 500;
export const AGENT_TIMEOUT_MS = 120_000;
export const MAX_TOTAL_TOKENS = 500_000;
export const MAX_COST_USD = 5.0;
/** Max total wall-clock time for the entire agent loop (30 min) */
export const MAX_WALL_CLOCK_MS = 30 * 60 * 1_000;
/** Context budget warning threshold (warn LLM when approaching limit) */
export const TOKEN_BUDGET_WARNING_THRESHOLD = 0.75; // warn at 75% of budget
export const MAX_RETRIES = 2;

/**
 * Approximate cost per million tokens by provider (input + output blended).
 * Used for cost budget governor.
 */
export const PROVIDER_COST_PER_M: Record<string, number> = {
  gemini: 0.3,
  openai: 5.0,
  anthropic: 6.0,
  deepseek: 0.55,
  groq: 0.05,
  nvidia: 0.5,
  openrouter: 2.0,
  lmstudio: 0,
  ollama: 0,
};

// ─── Loop State ─────────────────────────────────────────────────

/** Active loop counter for observability */
let _activeLoops = 0;

/** Returns the number of currently running agent loops (for dashboards) */
export function getActiveLoopCount(): number {
  return _activeLoops;
}

export function incrementActiveLoops(): void {
  _activeLoops++;
}

export function decrementActiveLoops(): void {
  _activeLoops = Math.max(0, _activeLoops - 1);
}

// ─── Pre-Warming ────────────────────────────────────────────────

let _preWarmed = false;

/** Pre-warm the sandbox container + handler map + LLM connections so the first chat request is instant. */
export async function preWarmSandbox(): Promise<void> {
  if (_preWarmed) {
    return;
  }
  _preWarmed = true;
  try {
    // 1. Initialize HTTP connection pool for LLM providers (keep-alive, 6 connections/origin)
    const { initConnectionPool, warmConnections } =
      await import("../cloud-inference/connection-pool.js");
    initConnectionPool();

    // 2. Pre-warm sandbox container + tool handler map
    const { ensureContainerRunning } = await import("../agent-sandbox.js");
    const { getHandlerMap } = await import("../agent-loop/tool-executor.js");
    await ensureContainerRunning();
    await getHandlerMap();

    // 3. Fire-and-forget TLS warming to LLM provider origins
    warmConnections().catch(() => {});

    const { createSubsystemLogger } = await import("../../logging/subsystem.js");
    createSubsystemLogger("sandbox-agent").info(
      "[AgentLoop] Sandbox pre-warmed — container + tools + connection pool ready",
    );
  } catch {
    _preWarmed = false; // Allow retry on first request
  }
}

// ─── MCP State ──────────────────────────────────────────────────

let _mcpServersLoaded = false;

export function isMcpLoaded(): boolean {
  return _mcpServersLoaded;
}

export function markMcpLoaded(): void {
  _mcpServersLoaded = true;
}

// ─── Result Factory ─────────────────────────────────────────────

/** Create a failed AgentLoopResult with the given error message. */
export function failResult(response: string): AgentLoopResult {
  return {
    success: false,
    response,
    previewUrl: null,
    iterations: 0,
    totalTokens: 0,
    snapshotBase64: null,
    artifactType: "unknown",
    artifactFiles: [],
  };
}

// ─── RunSandboxAgentLoop Options Type ──────────────────────────

export interface SandboxAgentLoopOpts {
  modelOverride?: { provider: string; modelId: string };
  thinkModelId?: string; // format: "provider/modelId" e.g. "google/gemini-3.1-pro-preview"
  execModelId?: string; // format: "provider/modelId"
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  abortSignal?: AbortSignal;
}
