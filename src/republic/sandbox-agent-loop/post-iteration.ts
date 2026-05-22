/**
 * Sandbox Agent Loop — Post-Iteration Processors
 *
 * Contains the intelligence assessment, reflexion, checkpoint, speculative
 * pre-warming, and context compression logic that runs after each tool execution.
 *
 * Extracted from main-loop.ts per DDD file limits (400L max for gateway logic).
 */

import type { LoopIntelligenceEngine, IterationSignals } from "../agent-loop-intelligence.js";
import type { RecoveryPlaybook } from "../agent-loop/recovery-playbook.js";
import type { SpeculativeEngine } from "../agent-loop/speculative-engine.js";
import type { TaskMemory } from "../agent-loop/task-memory.js";
import type { TaskTracker } from "../agent-loop/task-tracker.js";
import type { AgentBroadcaster } from "../agent-providers/index.js";
import type { TaskPlan } from "../agent-strategy-planner.js";
import type { IterationTrace } from "../agent-telemetry.js";
import type { LoopState, AnthropicMessage, OpenAiMessage, GeminiContent } from "./iteration.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { shouldCompress, compressOpenAiPhase } from "../agent-loop/context-compressor.js";
import { getPhaseRoute, type PhaseRoute } from "../agent-loop/model-router.js";
import { shouldReflect, buildReflectionPrompt } from "../agent-loop/reflexion.js";
import { shouldCheckpoint, saveCheckpoint, buildCheckpoint } from "../agent-loop/session-resume.js";

const logger = createSubsystemLogger("sandbox-agent");

// ─── Intelligence Assessment ────────────────────────────────────

export interface IntelligenceContext {
  state: LoopState;
  intelligence: LoopIntelligenceEngine;
  anthropicMessages: AnthropicMessage[];
  openaiMessages: OpenAiMessage[];
  geminiContents: GeminiContent[];
  iterResponseText: string;
  signals: IterationSignals;
}

/**
 * Run the closed-loop intelligence assessment and inject corrective actions.
 * Returns true if the loop should continue, false to break.
 */
export function runIntelligenceAssessment(ctx: IntelligenceContext): boolean {
  const {
    state,
    intelligence,
    anthropicMessages,
    openaiMessages,
    geminiContents,
    iterResponseText,
    signals,
  } = ctx;
  const broadcaster = state.broadcaster;

  const postIntel = intelligence.assess(state.iterations, signals, iterResponseText);

  if (postIntel.isStalling) {
    logger.warn(
      `[AgentLoop] STALL detected: ${postIntel.stallCount} consecutive no-progress ` +
        `(velocity: ${Math.round(postIntel.velocity * 100)}%)`,
    );
    broadcaster.send(
      `\n⚠️ _Low progress detected (${postIntel.stallCount} iterations without advancement)_\n`,
    );
  }

  if (postIntel.tokenBudgetWarning) {
    const budgetNudge = `[SYSTEM] ${postIntel.tokenBudgetWarning}`;
    openaiMessages.push({ role: "system", content: budgetNudge });
    geminiContents.push({ role: "user", parts: [{ text: budgetNudge }] });
    anthropicMessages.push({ role: "user", content: budgetNudge });
    state.approxHistoryBytes += budgetNudge.length + 50;
    broadcaster.send(
      `\n📊 _Token budget: ${Math.round(postIntel.tokenBudgetRatio * 100)}% consumed_\n`,
    );
  }

  if (postIntel.providerSwitchHint) {
    logger.info(`[AgentLoop] ${postIntel.providerSwitchHint}`);
    broadcaster.send(`\n${postIntel.providerSwitchHint}\n`);
  }

  if (postIntel.correctiveInjection) {
    const nudge = `[SYSTEM] ${postIntel.correctiveInjection}`;
    anthropicMessages.push({ role: "user", content: nudge });
    openaiMessages.push({ role: "system", content: nudge });
    geminiContents.push({ role: "user", parts: [{ text: nudge }] });
    state.approxHistoryBytes += nudge.length + 50;
  }

  if (!postIntel.shouldContinue) {
    logger.info(`[AgentLoop] Intelligence stop: ${postIntel.stopReason}`);
    broadcaster.send(`\n🛑 ${postIntel.stopReason}\n`);
    return false;
  }

  return true;
}

// ─── Self-Reflection (Manus Reflexion) ──────────────────────────

export interface ReflexionContext {
  state: LoopState;
  plan: TaskPlan;
  iterIndex: number;
  effectiveMaxIter: number;
  anthropicMessages: AnthropicMessage[];
  openaiMessages: OpenAiMessage[];
  geminiContents: GeminiContent[];
}

export function runReflexion(ctx: ReflexionContext): void {
  const {
    state,
    plan,
    iterIndex,
    effectiveMaxIter,
    anthropicMessages,
    openaiMessages,
    geminiContents,
  } = ctx;

  const reflectionCheck = shouldReflect(iterIndex, effectiveMaxIter, plan.strategy);
  if (!reflectionCheck.shouldReflect || !reflectionCheck.checkpoint) {
    return;
  }

  const reflection = buildReflectionPrompt(
    reflectionCheck.checkpoint,
    plan,
    iterIndex,
    effectiveMaxIter,
    state.toolsUsedInLoop,
    state.totalToolErrors > 0,
  );
  const reflectMsg = `[SYSTEM] ${reflection.content}`;
  anthropicMessages.push({ role: "user", content: reflectMsg });
  openaiMessages.push({ role: "system", content: reflectMsg });
  geminiContents.push({ role: "user", parts: [{ text: reflectMsg }] });
  state.approxHistoryBytes += reflectMsg.length + 50;
  state.broadcaster.send(
    `\n🪞 **Self-Reflection** (${reflectionCheck.checkpoint} checkpoint at ${reflectionCheck.progressPct}%)\n`,
  );
}

// ─── Session Checkpoint ─────────────────────────────────────────

export interface CheckpointContext {
  iterIndex: number;
  telemetrySessionId: string;
  state: LoopState;
  plan: TaskPlan;
  userMessage: string;
  currentPhaseIndex: number;
}

export async function runCheckpoint(ctx: CheckpointContext): Promise<void> {
  const { iterIndex, telemetrySessionId, state, plan, userMessage, currentPhaseIndex } = ctx;

  if (!shouldCheckpoint(iterIndex)) {
    return;
  }

  const completedPhases = plan.decomposition
    .filter((_: unknown, pi: number) => pi < (currentPhaseIndex ?? 0))
    .map((d) => d.phase);

  await saveCheckpoint(
    buildCheckpoint(
      telemetrySessionId,
      iterIndex,
      state.totalTokens,
      state.provider,
      state.modelId,
      plan.strategy,
      completedPhases,
      state.toolsUsedInLoop,
      userMessage,
      state.finalResponse,
    ),
  );
}

// ─── Speculative Pre-Warming ────────────────────────────────────

export function runSpeculativePreWarm(specEngine: SpeculativeEngine): void {
  const prediction = specEngine.predict();
  if (prediction && prediction.confidence >= 0.6) {
    const action = specEngine.getPreWarmAction(prediction);
    specEngine.executePreWarm(action).catch(() => {});
  }
}

// ─── Phase Route Switching ──────────────────────────────────────

export function applyPhaseRouting(
  state: LoopState,
  currentPhase: string,
  phaseRoutes: PhaseRoute[],
): void {
  const phaseRoute = getPhaseRoute(currentPhase, phaseRoutes);
  if (
    phaseRoute &&
    (phaseRoute.provider !== state.provider || phaseRoute.modelId !== state.modelId)
  ) {
    if (!state.dualModelConfig.hasDualModels) {
      state.provider = phaseRoute.provider;
      state.modelId = phaseRoute.modelId;
    }
  }
}

// ─── Progressive Context Compression ────────────────────────────

export function runContextCompression(
  state: LoopState,
  plan: TaskPlan,
  openaiMessages: OpenAiMessage[],
  currentPhaseIndex: number,
  iterIndex: number,
  broadcaster: AgentBroadcaster,
): void {
  if (!shouldCompress(state.approxHistoryBytes) || currentPhaseIndex <= 0) {
    return;
  }

  const prevPhase = plan.decomposition[currentPhaseIndex - 1];
  if (!prevPhase) {
    return;
  }

  const result = compressOpenAiPhase(
    openaiMessages,
    prevPhase.phase,
    2,
    openaiMessages.length - 6,
    iterIndex,
  );

  if (result.savedBytes > 0) {
    state.approxHistoryBytes -= result.savedBytes;
    broadcaster.send(
      `🗜️ _Context compressed: ${Math.round(result.savedBytes / 1024)}KB recovered_\n`,
    );
  }
}

// ─── Tool Result Processing ─────────────────────────────────────

export interface ToolResultsContext {
  state: LoopState;
  toolResults: Array<{ name: string; content: string; isError: boolean }>;
  totalToolTimeMs: number;
  specEngine: SpeculativeEngine;
  taskMemory: TaskMemory;
  iterTrace: IterationTrace;
  recordToolCallFn: (
    trace: IterationTrace,
    name: string,
    ms: number,
    success: boolean,
    bytes: number,
    error?: string,
  ) => void;
}

export interface ToolResultsOutput {
  totalToolOutputBytes: number;
  hadToolErrors: boolean;
  toolsUsed: string[];
}

/**
 * Process tool results: update error counters, run recovery playbooks,
 * record telemetry, and record spec engine / task memory data.
 */
export function processToolResults(
  ctx: ToolResultsContext,
  matchPlaybook: (
    name: string,
    content: string,
  ) => { matched: boolean; playbook?: RecoveryPlaybook; enrichedError: string },
  executeAutoFix: (playbook: RecoveryPlaybook) => Promise<unknown>,
): ToolResultsOutput {
  const {
    state,
    toolResults,
    totalToolTimeMs,
    specEngine,
    taskMemory,
    iterTrace,
    recordToolCallFn,
  } = ctx;
  let totalToolOutputBytes = 0;
  let hadToolErrors = false;
  const toolsUsed: string[] = [];

  for (const r of toolResults) {
    if (r.isError) {
      state.totalToolErrors++;
      hadToolErrors = true;

      const recovery = matchPlaybook(r.name, r.content);
      if (recovery.matched && recovery.playbook) {
        r.content = recovery.enrichedError;
        if (recovery.playbook.autoFixCommands) {
          executeAutoFix(recovery.playbook).catch(() => {});
        }
      }
    }
    totalToolOutputBytes += r.content.length;
    toolsUsed.push(r.name);

    const perToolMs = Math.round(totalToolTimeMs / toolResults.length);
    specEngine.recordToolCall(r.name, perToolMs);

    if (r.isError) {
      taskMemory.recordError(r.content.slice(0, 200), r.name, "", false);
    }

    recordToolCallFn(
      iterTrace,
      r.name,
      perToolMs,
      !r.isError,
      r.content.length,
      r.isError ? r.content : undefined,
    );
  }

  return { totalToolOutputBytes, hadToolErrors, toolsUsed };
}
