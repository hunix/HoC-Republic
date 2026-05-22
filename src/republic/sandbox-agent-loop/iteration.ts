/**
 * Sandbox Agent Loop — Iteration Logic
 *
 * Contains the per-iteration dispatch, safety checks (abort, wall-clock, health,
 * token/cost budget), dual-model switching, CodeAct execution, and tool result
 * appending. Called in a for-loop by the main orchestrator.
 */

import type { TOOLS as ToolsDef } from "../sandbox-tool-defs.js";
import type { DualModelConfig } from "./provider-setup.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { extractPythonBlocks } from "../agent-loop/helpers.js";
import { pruneMessageHistory } from "../agent-loop/message-pruning.js";
import { createToolRunner, type ToolResult } from "../agent-loop/tool-runner.js";
import {
  type AgentProvider,
  type AgentBroadcaster,
  type LoopIteration,
  type AnthropicMessage,
  type OpenAiMessage,
  type GeminiContent,
  getOpenAiCompatConfig,
  providerModelId,
  providerLabel,
  nextAgentProvider,
  runAnthropicLoop,
  appendAnthropicTurn,
  runOpenAiLoop,
  appendOpenAiTurn,
  runGeminiLoop,
  appendGeminiTurn,
} from "../agent-providers/index.js";
import { sandboxExec, isContainerRunning } from "../agent-sandbox.js";
import { createToolLoopSession } from "../openclaw/tool-loop-detection.js";
import { AGENT_TIMEOUT_MS, MAX_RETRIES } from "./config.js";

const logger = createSubsystemLogger("sandbox-agent");

// ─── Loop State ─────────────────────────────────────────────────

export interface LoopState {
  provider: AgentProvider;
  modelId: string;
  label: string;
  baseProvider: AgentProvider;
  baseModelId: string;
  dualModePrefix: string;
  dualModelConfig: DualModelConfig;
  systemPrompt: string;
  effectiveTools: typeof ToolsDef;
  broadcaster: AgentBroadcaster;
  abortSignal?: AbortSignal;
  // Mutable counters
  iterations: number;
  totalTokens: number;
  finalResponse: string;
  previewUrl: string | null;
  consecutiveApiErrors: number;
  totalToolErrors: number;
  approxHistoryBytes: number;
  toolsUsedInLoop: string[];
}

// ─── History Initialization ─────────────────────────────────────

export function initMessageHistories(
  systemPrompt: string,
  userMessage: string,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
): {
  anthropicMessages: AnthropicMessage[];
  openaiMessages: OpenAiMessage[];
  geminiContents: GeminiContent[];
} {
  const anthropicMessages: AnthropicMessage[] = [
    ...(history ?? []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const openaiMessages: OpenAiMessage[] = [
    { role: "system", content: systemPrompt },
    ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const geminiContents: GeminiContent[] = [
    ...(history ?? []).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  return { anthropicMessages, openaiMessages, geminiContents };
}

// ─── TLS Pre-Warm ───────────────────────────────────────────────

export function preWarmTls(provider: AgentProvider): void {
  const urls: Record<string, string> = {
    gemini: "https://generativelanguage.googleapis.com/",
    anthropic: "https://api.anthropic.com/",
    openai: "https://api.openai.com/",
  };
  const url = urls[provider ?? ""];
  if (url) {
    fetch(url, { method: "HEAD", signal: AbortSignal.timeout(3000) }).catch(() => {});
  }
}

// ─── Safety Checks (re-exported from dedicated module) ─────────

export {
  checkAbort,
  checkWallClock,
  checkContainerHealth,
  checkTokenBudget,
} from "./safety-checks.js";

// ─── Dual-Model Switching ───────────────────────────────────────

export function switchDualModel(
  state: LoopState,
  geminiContents: GeminiContent[],
  openaiMessages: OpenAiMessage[],
): void {
  const { dualModelConfig, dualModePrefix, baseProvider, baseModelId } = state;
  if (!dualModelConfig.hasDualModels || dualModePrefix) {
    return;
  }

  if (state.iterations === 1 && dualModelConfig.thinkProvider && dualModelConfig.thinkModel) {
    state.provider = dualModelConfig.thinkProvider;
    state.modelId = dualModelConfig.thinkModel;
  } else if (state.iterations > 1 && dualModelConfig.execProvider && dualModelConfig.execModel) {
    // Carry think-phase context into exec-phase
    if (state.iterations === 2 && state.finalResponse.trim()) {
      const thinkContext = `[PLANNING CONTEXT from think model]\n${state.finalResponse.trim()}\n[END PLANNING CONTEXT]\n\nNow execute the plan above. Use tools to build, write files, and generate assets.`;
      if (
        dualModelConfig.execProvider === "gemini" ||
        dualModelConfig.execProvider === baseProvider
      ) {
        geminiContents.push({ role: "user", parts: [{ text: thinkContext }] });
      }
      if (dualModelConfig.execProvider !== "gemini") {
        openaiMessages.push({ role: "user", content: thinkContext });
      }
    }
    state.provider = dualModelConfig.execProvider;
    state.modelId = dualModelConfig.execModel;
  } else {
    state.provider = baseProvider;
    state.modelId = baseModelId;
  }
}

// ─── CodeAct Execution ──────────────────────────────────────────

export async function executeCodeActBlocks(
  textBlocks: string[],
  broadcaster: AgentBroadcaster,
): Promise<void> {
  const fullText = textBlocks.join("\n");
  const codeActBlocks = extractPythonBlocks(fullText);
  if (codeActBlocks.length === 0 || !isContainerRunning()) {
    return;
  }

  for (const block of codeActBlocks) {
    broadcaster.send(`\n⚡ **CodeAct** — auto-executing Python block...\n`);
    broadcaster.toolEvent?.({
      toolName: "codeact_python",
      status: "start",
      description: `Executing ${block.length} chars of Python`,
      stepIndex: -2,
    });
    try {
      const caResult = await sandboxExec(`python3 -c ${JSON.stringify(block)}`, "/workspace", 30);
      const caOutput = (caResult.stdout || caResult.stderr || "(no output)").slice(0, 2000);
      broadcaster.send(`\`\`\`\n${caOutput}\n\`\`\`\n`);
      broadcaster.toolEvent?.({
        toolName: "codeact_python",
        status: caResult.exitCode === 0 ? "done" : "error",
        description: caResult.exitCode === 0 ? "Python executed" : `Exit code ${caResult.exitCode}`,
        stepIndex: -2,
      });
    } catch (caErr) {
      broadcaster.send(
        `\n⚠️ CodeAct error: ${caErr instanceof Error ? caErr.message : String(caErr)}\n`,
      );
      broadcaster.toolEvent?.({
        toolName: "codeact_python",
        status: "error",
        description: caErr instanceof Error ? caErr.message : String(caErr),
        stepIndex: -2,
      });
    }
  }
}

// ─── Provider Dispatch ──────────────────────────────────────────

export async function dispatchToProvider(
  provider: AgentProvider,
  modelId: string,
  anthropicMessages: AnthropicMessage[],
  openaiMessages: OpenAiMessage[],
  geminiContents: GeminiContent[],
  broadcaster: AgentBroadcaster,
  effectiveTools: typeof ToolsDef,
  systemPrompt: string,
  userAbort?: AbortSignal,
): Promise<LoopIteration | null> {
  const typedTools = effectiveTools as typeof ToolsDef;
  if (provider === "anthropic") {
    return runAnthropicLoop(
      anthropicMessages,
      modelId,
      broadcaster,
      MAX_RETRIES,
      typedTools,
      systemPrompt,
      AGENT_TIMEOUT_MS,
      userAbort,
    );
  }
  if (provider === "gemini") {
    return runGeminiLoop(
      geminiContents,
      modelId,
      broadcaster,
      MAX_RETRIES,
      typedTools,
      systemPrompt,
      AGENT_TIMEOUT_MS,
      userAbort,
    );
  }
  // All OpenAI-compatible providers
  const compatConfig = getOpenAiCompatConfig(provider, modelId);
  return runOpenAiLoop(
    openaiMessages,
    modelId,
    broadcaster,
    MAX_RETRIES,
    compatConfig ?? undefined,
    typedTools,
    AGENT_TIMEOUT_MS,
    userAbort,
  );
}

// ─── Provider Fallback ──────────────────────────────────────────

export function tryProviderFallback(
  state: LoopState,
  skippedProviders: Set<AgentProvider>,
): boolean {
  const fallback = nextAgentProvider(state.provider, skippedProviders);
  if (!fallback) {
    state.finalResponse += "\nAgent stopped: all configured providers exhausted.";
    state.broadcaster.send("\n❌ All providers failed. Add API keys to your .env file.\n");
    return false;
  }
  skippedProviders.add(state.provider);
  const fallbackModel = providerModelId(fallback);
  state.broadcaster.send(
    `\n⚠️ ${providerLabel(state.provider, state.modelId)} failed — switching to **${providerLabel(fallback, fallbackModel)}**...\n`,
  );
  logger.warn(`[AgentLoop] Provider ${state.provider} exhausted, switching to ${fallback}`);
  state.provider = fallback;
  state.modelId = fallbackModel;
  state.label = providerLabel(state.provider, state.modelId);
  state.broadcaster.send(`📋 Provider: **${state.label}** | continuing...\n`);
  state.consecutiveApiErrors = 0;
  return true;
}

// ─── Tool Runner Factory ────────────────────────────────────────

export function createBoundToolRunner(
  state: LoopState,
  opts?: { getToolTimeoutMs?: (name: string, defaultMs: number) => number },
) {
  return createToolRunner({
    broadcaster: state.broadcaster,
    toolLoopSession: createToolLoopSession(),
    toolResultCache: new Map<string, string>(),
    toolsUsedInLoop: state.toolsUsedInLoop,
    abortSignal: state.abortSignal,
    getIterations: () => state.iterations,
    setPreviewUrl: (url) => {
      state.previewUrl = url;
    },
    getToolTimeoutMs: opts?.getToolTimeoutMs,
  });
}

// ─── Append Turn to History ─────────────────────────────────────

export function appendTurnToHistory(
  provider: AgentProvider,
  anthropicMessages: AnthropicMessage[],
  openaiMessages: OpenAiMessage[],
  geminiContents: GeminiContent[],
  iteration: LoopIteration,
  toolResults: ToolResult[],
): void {
  if (provider === "anthropic") {
    appendAnthropicTurn(anthropicMessages, iteration, toolResults);
  } else if (provider === "gemini") {
    appendGeminiTurn(geminiContents, iteration, toolResults);
  } else {
    appendOpenAiTurn(openaiMessages, iteration, toolResults);
  }
}

export { pruneMessageHistory, type AnthropicMessage, type OpenAiMessage, type GeminiContent };
