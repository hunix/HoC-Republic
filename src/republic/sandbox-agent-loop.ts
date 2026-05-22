/**
 * Sandbox Agent Loop — Autonomous Polymath Tool-Calling Engine
 *
 * Multi-turn agent loop that uses the best available LLM provider to autonomously
 * plan, research, code, build, test, and deploy any project.
 *
 * Provider priority (auto-selected based on configured API keys):
 *   1. Google Gemini (GEMINI_API_KEY)  — cheapest, 1M context
 *   2. OpenAI GPT (OPENAI_API_KEY)     — strong tool-calling
 *   3. Anthropic Claude (ANTHROPIC_API_KEY) — native tool_use format
 *
 * Flow:
 *   User prompt → Strategy → LLM + tools → intelligence → ... → final output
 *
 * This module is called from chat.ts when it detects a project/build/research intent.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Architecture: This file is the thin ORCHESTRATOR — it imports from:
 *   - sandbox-agent-loop/setup.ts       — Session initialization
 *   - sandbox-agent-loop/main-loop.ts   — Core iteration cycle
 *   - sandbox-agent-loop/finalize.ts    — Post-loop verification & cleanup
 *   - sandbox-agent-loop/config.ts      — Constants, cost tables, state
 *   - sandbox-agent-loop/provider-setup.ts — Provider selection, MCP, tools
 *   - sandbox-agent-loop/iteration.ts   — Per-iteration dispatch & safety
 *   - sandbox-agent-loop/helpers.ts     — Utility functions
 *   - agent-loop-intelligence.ts        — Closed-loop adaptive controller
 *   - agent-strategy-planner.ts         — Pre-execution task classification
 *   - agent-telemetry.ts               — Observability metrics engine
 *   - agent-loop/                       — Tool executor, runner, auto-fix
 *   - agent-providers/                  — Anthropic, OpenAI, Gemini API adapters
 * ────────────────────────────────────────────────────────────────────────
 */

import {
  decrementActiveLoops,
  failResult,
  type SandboxAgentLoopOpts,
} from "./sandbox-agent-loop/config.js";
import { finalizeCleanup, finalizeLoop } from "./sandbox-agent-loop/finalize.js";
import { runIterationLoop, runParallelPrePhase } from "./sandbox-agent-loop/main-loop.js";
import { setupAgentLoop } from "./sandbox-agent-loop/setup.js";

// ── Re-exports for external consumers (chat.ts) ────────────────
export { isProjectBuildIntent } from "./sandbox-intent.js";
export { getActiveLoopCount, preWarmSandbox } from "./sandbox-agent-loop/config.js";
export type { AgentBroadcaster, AgentLoopResult, ToolEvent } from "./agent-providers/index.js";

// ─── Main Agent Loop (provider-agnostic) ────────────────────────

/**
 * Run the autonomous agent loop for a user request.
 * Auto-selects the best available LLM provider, falling back on failure.
 */
export async function runSandboxAgentLoop(
  userMessage: string,
  broadcaster: import("./agent-providers/index.js").AgentBroadcaster,
  opts?: SandboxAgentLoopOpts,
): Promise<import("./agent-providers/index.js").AgentLoopResult> {
  // ── Setup (provider, tools, strategy, intelligence, memory) ──
  const setup = await setupAgentLoop(userMessage, broadcaster, opts);
  if (!setup) {
    // Setup returns null when no provider or container is available
    const { isContainerRunning } = await import("./agent-sandbox.js");
    const { resolveProvider } = await import("./sandbox-agent-loop/provider-setup.js");
    if (!resolveProvider(opts)) {
      return failResult(
        "No LLM API key configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY, GROQ_API_KEY, NVIDIA_API_KEY, or OPENROUTER_API_KEY in your .env file — or set LMSTUDIO_MODEL or OLLAMA_MODEL for local inference.",
      );
    }
    if (!isContainerRunning()) {
      return failResult(
        "Sandbox container is not running. Start it via the Agent Desktop, then try again.",
      );
    }
    return failResult("Agent loop setup failed.");
  }

  try {
    // ── Parallel Dispatch (Manus Wide Mode) ─────────────────
    await runParallelPrePhase(setup);

    // ── Main Iteration Loop ─────────────────────────────────
    await runIterationLoop(setup);

    // ── Post-loop Finalization ───────────────────────────────
    return await finalizeLoop({
      state: setup.state,
      plan: setup.plan,
      effectiveMaxIter: setup.effectiveMaxIter,
      broadcaster,
      systemPrompt: setup.systemPrompt,
      anthropicMessages: setup.anthropicMessages,
      openaiMessages: setup.openaiMessages,
      geminiContents: setup.geminiContents,
      userMessage: setup.userMessage,
      telemetrySessionId: setup.telemetrySessionId,
      loopStartMs: setup.loopStartMs,
      costOracle: setup.costOracle,
      specEngine: setup.specEngine,
      taskMemory: setup.taskMemory,
      tracker: setup.tracker,
      abortSignal: opts?.abortSignal,
    });
  } finally {
    decrementActiveLoops();

    // ── Cleanup (telemetry, strategy learning, knowledge capture) ──
    finalizeCleanup({
      state: setup.state,
      plan: setup.plan,
      telemetrySessionId: setup.telemetrySessionId,
      loopStartMs: setup.loopStartMs,
      userMessage: setup.userMessage,
    });
  }
}
