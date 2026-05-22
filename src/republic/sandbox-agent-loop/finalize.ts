/**
 * Sandbox Agent Loop — Post-loop finalization.
 *
 * Handles artifact collection, verification, confidence gating,
 * task tracker finalization, and telemetry/learning persistence.
 */

import type { CostOracle } from "../agent-loop/cost-oracle.js";
import type { SpeculativeEngine } from "../agent-loop/speculative-engine.js";
import type { TaskMemory } from "../agent-loop/task-memory.js";
import type { TaskTracker } from "../agent-loop/task-tracker.js";
import type { AgentBroadcaster, AgentLoopResult } from "../agent-providers/index.js";
import type { TaskPlan } from "../agent-strategy-planner.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { collectArtifactManifest } from "../agent-loop/artifact-collector.js";
import { runAutoFixLoop, checkHallucination } from "../agent-loop/auto-fix.js";
import { assessConfidence } from "../agent-loop/confidence-gate.js";
import { verifyOutput } from "../agent-loop/output-verifier.js";
import { recordStrategyOutcome } from "../agent-strategy-planner.js";
import { completeSession } from "../agent-telemetry.js";
import { captureKnowledge } from "../sandbox-knowledge-bridge.js";
import { AGENT_TIMEOUT_MS, MAX_RETRIES } from "./config.js";
import { extractKeywords } from "./helpers.js";
import {
  type LoopState,
  type AnthropicMessage,
  type OpenAiMessage,
  type GeminiContent,
} from "./iteration.js";

const logger = createSubsystemLogger("sandbox-agent");

export interface FinalizeParams {
  state: LoopState;
  plan: TaskPlan;
  effectiveMaxIter: number;
  broadcaster: AgentBroadcaster;
  systemPrompt: string;
  anthropicMessages: AnthropicMessage[];
  openaiMessages: OpenAiMessage[];
  geminiContents: GeminiContent[];
  userMessage: string;
  telemetrySessionId: string;
  loopStartMs: number;
  costOracle: CostOracle;
  specEngine: SpeculativeEngine;
  taskMemory: TaskMemory;
  tracker: TaskTracker;
  abortSignal?: AbortSignal;
}

/**
 * Post-loop finalization: artifacts, verification, confidence, learning.
 * Returns the final AgentLoopResult.
 */
export async function finalizeLoop(params: FinalizeParams): Promise<AgentLoopResult> {
  const {
    state,
    plan,
    effectiveMaxIter,
    broadcaster,
    systemPrompt,
    anthropicMessages,
    openaiMessages,
    geminiContents,
    userMessage,
    costOracle,
    specEngine,
    taskMemory,
    tracker,
  } = params;

  if (state.iterations >= effectiveMaxIter) {
    broadcaster.send(
      `\n⚠️ Reached ${plan.strategy} iteration budget (${effectiveMaxIter}). Stopping.\n`,
    );
  }

  // ── Collect artifact manifest ────────────────────────────────
  let { snapshotBase64, artifactType, artifactFiles } = await collectArtifactManifest(
    state.previewUrl,
  );

  // ── Verification Agent (post-loop quality gate) ──────────────
  const autoFixResult = await runAutoFixLoop(
    {
      provider: state.provider,
      modelId: state.modelId,
      broadcaster,
      systemPromptStr: systemPrompt,
      effectiveTools: state.effectiveTools,
      anthropicMessages,
      openaiMessages,
      geminiContents,
      previewUrl: state.previewUrl,
      abortSignal: params.abortSignal,
      agentTimeoutMs: AGENT_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    },
    userMessage,
    state.finalResponse,
    state.totalTokens,
    state.iterations,
    snapshotBase64,
    artifactFiles,
  );
  state.finalResponse = autoFixResult.finalResponse;
  state.totalTokens = autoFixResult.totalTokens;
  state.iterations = autoFixResult.iterations;
  snapshotBase64 = autoFixResult.snapshotBase64;
  artifactFiles = autoFixResult.artifactFiles;

  // ── Anti-hallucination guard ─────────────────────────────────
  state.finalResponse = checkHallucination(state.finalResponse, artifactFiles, broadcaster);

  // ── Output Verifier: automated QA checks ─────────────────────
  const verification = verifyOutput({
    response: state.finalResponse,
    userMessage,
    strategy: plan.strategy,
    totalToolErrors: state.totalToolErrors,
    iterations: state.iterations,
    maxIterations: effectiveMaxIter,
  });
  if (!verification.overallPassed) {
    broadcaster.send(`\n⚠️ ${verification.summary}\n`);
  }

  // ── Confidence Gate: self-assess before delivery ──────────────
  const confidence = assessConfidence({
    response: state.finalResponse,
    userMessage,
    iterations: state.iterations,
    maxIterations: effectiveMaxIter,
    totalToolErrors: state.totalToolErrors,
    toolsUsed: state.toolsUsedInLoop,
    strategy: plan.strategy,
    hasPreview: !!state.previewUrl,
    artifactCount: artifactFiles.length,
  });
  if (confidence.action === "qualify" && confidence.qualification) {
    state.finalResponse += `\n\n---\n_${confidence.qualification}_`;
  }
  broadcaster.send(
    `\n📊 **Confidence**: ${Math.round(confidence.overall * 100)}% ` +
      `(${confidence.tier}) | Cost: $${costOracle.totalCost.toFixed(4)}\n`,
  );
  logger.info(
    `[AgentLoop] Confidence=${Math.round(confidence.overall * 100)}% tier=${confidence.tier} ` +
      `cost=$${costOracle.totalCost.toFixed(4)}`,
  );

  // ── Finalize task tracker + clear checkpoint ──────────────────
  const wasSuccessful = state.finalResponse.trim().length > 0;
  await tracker.finalize(wasSuccessful);
  const { clearCheckpoint } = await import("../agent-loop/session-resume.js");
  await clearCheckpoint();

  // ── Persist speculative engine + task memory ──────────────────
  specEngine.persist().catch(() => {});
  taskMemory.recordToolSequence(state.toolsUsedInLoop, wasSuccessful);
  taskMemory.recordStrategyOutcome(
    plan.strategy,
    state.provider,
    state.modelId,
    state.iterations,
    state.totalTokens,
    wasSuccessful,
    extractKeywords(userMessage),
  );
  taskMemory.recordSessionComplete();
  taskMemory.persist().catch(() => {});

  return {
    success: wasSuccessful,
    response: state.finalResponse.trim(),
    previewUrl: state.previewUrl,
    iterations: state.iterations,
    totalTokens: state.totalTokens,
    snapshotBase64,
    artifactType,
    artifactFiles,
  };
}

/**
 * Finalize telemetry and learning in the `finally` block.
 * Called whether the loop succeeds or throws.
 */
export function finalizeCleanup(params: {
  state: LoopState;
  plan: TaskPlan;
  telemetrySessionId: string;
  loopStartMs: number;
  userMessage: string;
}): void {
  const { state, plan, telemetrySessionId, loopStartMs, userMessage } = params;
  const loopDurationMs = Date.now() - loopStartMs;
  const wasSuccessful = state.finalResponse.trim().length > 0;

  // ── Telemetry: complete session ────────────────────────────
  completeSession(telemetrySessionId, wasSuccessful, state.finalResponse.length, 0);

  // ── Strategy learning: feed outcome back to the planner ───
  const uniqueTools = [...new Set(state.toolsUsedInLoop)];
  const failedTools =
    state.totalToolErrors > 0
      ? uniqueTools.filter((t) => {
          return state.toolsUsedInLoop.filter((u) => u === t).length > 1;
        })
      : [];
  recordStrategyOutcome(
    plan.strategy,
    state.iterations,
    wasSuccessful,
    loopDurationMs,
    uniqueTools,
    failedTools.length > 0 ? failedTools : undefined,
  );

  captureKnowledge(userMessage, state.finalResponse, state.toolsUsedInLoop, {
    iterations: state.iterations,
    provider: state.provider ?? undefined,
    success: wasSuccessful,
  }).catch(() => {});
}
