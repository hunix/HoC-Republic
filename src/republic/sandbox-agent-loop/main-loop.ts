/**
 * Sandbox Agent Loop — Main iteration loop.
 * Post-iteration processors delegated to ./post-iteration.ts per DDD limits.
 */

import type { LoopIntelligenceEngine, IterationSignals } from "../agent-loop-intelligence.js";
import type { PhaseRoute } from "../agent-loop/model-router.js";
import type { SpeculativeEngine } from "../agent-loop/speculative-engine.js";
import type { TaskMemory } from "../agent-loop/task-memory.js";
import type { TaskTracker } from "../agent-loop/task-tracker.js";
import type { TaskPlan } from "../agent-strategy-planner.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { focusTools, getRecentTools } from "../agent-loop/attention-focus.js";
import {
  executeParallel,
  mergeParallelResults,
  type ParallelPlan,
} from "../agent-loop/parallel-dispatch.js";
import { runMiniLoop } from "../agent-loop/parallel-miniloop.js";
import { matchPlaybook, executeAutoFix } from "../agent-loop/recovery-playbook.js";
import {
  startIteration,
  completeIteration,
  recordToolCall,
  recordFallback,
} from "../agent-telemetry.js";
import {
  checkAbort,
  checkWallClock,
  checkContainerHealth,
  checkTokenBudget,
  switchDualModel,
  executeCodeActBlocks,
  dispatchToProvider,
  tryProviderFallback,
  pruneMessageHistory,
  appendTurnToHistory,
  type LoopState,
  type AnthropicMessage,
  type OpenAiMessage,
  type GeminiContent,
} from "./iteration.js";
import {
  runIntelligenceAssessment,
  runReflexion,
  runCheckpoint,
  runSpeculativePreWarm,
  applyPhaseRouting,
  runContextCompression,
  processToolResults,
} from "./post-iteration.js";

const logger = createSubsystemLogger("sandbox-agent");

export interface MainLoopParams {
  state: LoopState;
  plan: TaskPlan;
  intelligence: LoopIntelligenceEngine;
  effectiveMaxIter: number;
  systemPrompt: string;
  anthropicMessages: AnthropicMessage[];
  openaiMessages: OpenAiMessage[];
  geminiContents: GeminiContent[];
  parallelPlan: ParallelPlan;
  phaseRoutes: PhaseRoute[];
  specEngine: SpeculativeEngine;
  taskMemory: TaskMemory;
  tracker: TaskTracker;
  telemetrySessionId: string;
  loopStartMs: number;
  skippedProviders: Set<import("../agent-providers/index.js").AgentProvider>;
  toolRunner: ReturnType<typeof import("./iteration.js").createBoundToolRunner>;
  userMessage: string;
  abortSignal?: AbortSignal;
}

/**
 * Execute the parallel dispatch pre-phase (Manus Wide Mode).
 */
export async function runParallelPrePhase(params: MainLoopParams): Promise<void> {
  const { parallelPlan, state, anthropicMessages, openaiMessages, geminiContents, tracker } =
    params;

  if (!parallelPlan.eligible || parallelPlan.independentTasks.length < 2) {
    return;
  }

  params.state.broadcaster.send(
    `\n⚡ **Entering parallel mode** — ${parallelPlan.independentTasks.length} concurrent sub-agents\n`,
  );
  const parallelResults = await executeParallel(
    parallelPlan.independentTasks,
    async (subTask) => {
      return runMiniLoop(
        subTask,
        params.userMessage,
        state.provider,
        state.modelId,
        state.effectiveTools,
        state.broadcaster,
        params.abortSignal,
      );
    },
    state.broadcaster,
  );

  // Merge results into the message history
  const mergedContext = mergeParallelResults(parallelResults);
  if (mergedContext.length > 50) {
    const mergeMsg = `[PARALLEL RESEARCH RESULTS]\n${mergedContext}`;
    anthropicMessages.push({ role: "user", content: mergeMsg });
    openaiMessages.push({ role: "system", content: mergeMsg });
    geminiContents.push({ role: "user", parts: [{ text: mergeMsg }] });
    state.approxHistoryBytes += mergeMsg.length + 50;
    state.totalTokens += parallelResults.reduce((s, r) => s + r.tokensUsed, 0);
  }

  // Mark parallel phases as done in tracker
  for (const r of parallelResults) {
    if (r.success) {
      await tracker.completeStep(r.phase);
    } else {
      await tracker.failStep(r.phase, r.error);
    }
  }

  state.broadcaster.send(`\n📋 **Continuing with synthesis phase**\n`);
}

/**
 * Run the core iteration loop. Modifies `state` in-place.
 */
export async function runIterationLoop(params: MainLoopParams): Promise<void> {
  const {
    state,
    plan,
    intelligence,
    effectiveMaxIter,
    systemPrompt,
    anthropicMessages,
    openaiMessages,
    geminiContents,
    phaseRoutes,
    specEngine,
    taskMemory,
    tracker,
    telemetrySessionId,
    loopStartMs,
    skippedProviders,
    toolRunner,
    userMessage,
  } = params;
  const broadcaster = state.broadcaster;

  let lastPhase = "";

  for (let i = 0; i < effectiveMaxIter; i++) {
    state.iterations = i + 1;

    // ── Safety checks ─────────────────────────────────────────
    const abortMsg = checkAbort(params.abortSignal, state.iterations, broadcaster);
    if (abortMsg) {
      state.finalResponse += abortMsg;
      break;
    }

    const wallMsg = checkWallClock(loopStartMs, broadcaster);
    if (wallMsg) {
      state.finalResponse += wallMsg;
      break;
    }

    const healthMsg = await checkContainerHealth(i, state.totalToolErrors, broadcaster);
    if (healthMsg) {
      state.finalResponse += healthMsg;
      break;
    }

    // ── Message pruning ───────────────────────────────────────
    pruneMessageHistory(
      state.provider,
      anthropicMessages,
      openaiMessages,
      geminiContents,
      state.approxHistoryBytes,
    );

    try {
      // ── Phase transition announcement ─────────────────────
      const currentPhaseInfo = intelligence.resolvePhaseInfo(i);

      if (currentPhaseInfo.phase !== lastPhase && plan.decomposition.length > 1) {
        lastPhase = currentPhaseInfo.phase;
        broadcaster.send(
          `\n📌 **Phase ${currentPhaseInfo.index + 1}/${plan.decomposition.length}: ` +
            `${currentPhaseInfo.phase}** (${currentPhaseInfo.progressPct}% complete)\n`,
        );
        await tracker.advanceToPhase(currentPhaseInfo.phase);

        if (currentPhaseInfo.directive) {
          const phaseMsg = `[SYSTEM] ${currentPhaseInfo.directive}`;
          openaiMessages.push({ role: "system", content: phaseMsg });
          geminiContents.push({ role: "user", parts: [{ text: phaseMsg }] });
          anthropicMessages.push({ role: "user", content: phaseMsg });
          state.approxHistoryBytes += phaseMsg.length + 50;
        }
      }

      logger.info(
        `[AgentLoop][${state.provider}] Iteration ${state.iterations}/${effectiveMaxIter} ` +
          `[${currentPhaseInfo.phase}] (${currentPhaseInfo.progressPct}%)`,
      );
      broadcaster.send(`\n⏱️ _Iteration ${state.iterations}/${effectiveMaxIter}_\n`);
      broadcaster.toolEvent?.({
        toolName: "thinking",
        status: "start",
        description: `Reasoning (iteration ${state.iterations}/${effectiveMaxIter})`,
        stepIndex: -1,
      });

      // ── Telemetry: start iteration trace ──────────────────
      const iterTrace = startIteration(
        telemetrySessionId,
        state.iterations,
        state.provider,
        state.modelId,
      );

      // ── Dual-model switching ──────────────────────────────
      switchDualModel(state, geminiContents, openaiMessages);

      // ── Attention Focus: dynamic tool filtering ──────────
      const phaseForTools = plan.decomposition[currentPhaseInfo.index];
      const focusResult = focusTools(state.effectiveTools, {
        strategy: plan.strategy,
        currentPhase: currentPhaseInfo.phase,
        phaseTools: phaseForTools?.tools ?? [],
        recentlyUsed: getRecentTools(state.toolsUsedInLoop),
        recentlyFailed: [],
        iteration: i,
        maxIterations: effectiveMaxIter,
      });
      const iterationTools = focusResult.focusedTools;

      // ── Dispatch to provider ──────────────────────────────
      const iteration = await dispatchToProvider(
        state.provider,
        state.modelId,
        anthropicMessages,
        openaiMessages,
        geminiContents,
        broadcaster,
        iterationTools,
        systemPrompt,
        params.abortSignal,
      );

      if (!iteration) {
        state.consecutiveApiErrors++;
        completeIteration(iterTrace, 0, 0);
        if (state.consecutiveApiErrors >= 2) {
          const prevProvider = state.provider;
          if (!tryProviderFallback(state, skippedProviders)) {
            break;
          }
          recordFallback(telemetrySessionId, prevProvider, state.provider);
        }
        continue;
      }

      state.consecutiveApiErrors = 0;
      state.totalTokens += iteration.inputTokens + iteration.outputTokens;
      completeIteration(iterTrace, iteration.inputTokens, iteration.outputTokens);

      // ── Token/cost budget check ─────────────────────────
      const budgetMsg = checkTokenBudget(
        state.totalTokens,
        state.iterations,
        state.provider,
        broadcaster,
      );
      if (budgetMsg) {
        state.finalResponse += budgetMsg;
        break;
      }

      broadcaster.toolEvent?.({
        toolName: "thinking",
        status: "done",
        description: `Reasoning (iteration ${state.iterations}/${effectiveMaxIter})`,
        stepIndex: -1,
      });

      // ── Broadcast text ──────────────────────────────────
      let iterResponseText = "";
      for (const text of iteration.textBlocks) {
        if (text) {
          broadcaster.send(text);
          state.finalResponse += text + "\n";
          iterResponseText += text;
          if (state.finalResponse.length > 50_000) {
            state.finalResponse =
              state.finalResponse.slice(0, 5_000) +
              "\n...[pruned]...\n" +
              state.finalResponse.slice(-45_000);
          }
        }
      }

      // ── CodeAct hybrid execution ────────────────────────
      await executeCodeActBlocks(iteration.textBlocks, broadcaster);

      // ── Done check ──────────────────────────────────────
      if (iteration.done || iteration.toolCalls.length === 0) {
        logger.info(
          `Agent loop complete: ${state.iterations} iterations, ${state.totalTokens} tokens`,
        );
        break;
      }

      // ── Execute tools ──────────────────────────────────
      const toolStartMs = Date.now();
      const toolResults = await toolRunner.runToolsInParallel(iteration.toolCalls);
      const totalToolTimeMs = Date.now() - toolStartMs;

      const { totalToolOutputBytes, hadToolErrors, toolsUsed } = processToolResults(
        {
          state,
          toolResults,
          totalToolTimeMs,
          specEngine,
          taskMemory,
          iterTrace,
          recordToolCallFn: recordToolCall,
        },
        matchPlaybook,
        executeAutoFix,
      );

      appendTurnToHistory(
        state.provider,
        anthropicMessages,
        openaiMessages,
        geminiContents,
        iteration,
        toolResults,
      );

      // ── Speculative pre-warming ────────────────────────
      runSpeculativePreWarm(specEngine);

      // ── Per-phase model routing ────────────────────────
      applyPhaseRouting(state, currentPhaseInfo.phase, phaseRoutes);

      // ── Progressive context compression ────────────────
      runContextCompression(state, plan, openaiMessages, currentPhaseInfo.index, i, broadcaster);

      // Update byte tracker
      for (const r of toolResults) {
        state.approxHistoryBytes += r.content.length + 50;
      }
      for (const t of iteration.textBlocks) {
        state.approxHistoryBytes += t.length + 20;
      }

      // ── Intelligence: closed-loop assessment ──────────
      const signals: IterationSignals = {
        toolCallCount: toolResults.length,
        textBlockCount: iteration.textBlocks.filter((t) => t.length > 0).length,
        toolOutputBytes: totalToolOutputBytes,
        hadToolErrors,
        toolsUsed,
        llmDone: iteration.done,
        totalTokensSoFar: state.totalTokens,
        currentProvider: state.provider,
      };

      const shouldContinue = runIntelligenceAssessment({
        state,
        intelligence,
        anthropicMessages,
        openaiMessages,
        geminiContents,
        iterResponseText,
        signals,
      });
      if (!shouldContinue) break;

      // ── Self-Reflection (Manus Reflexion) ──────────────
      runReflexion({
        state,
        plan,
        iterIndex: i,
        effectiveMaxIter,
        anthropicMessages,
        openaiMessages,
        geminiContents,
      });

      // ── Session Checkpoint (continuity) ─────────────
      await runCheckpoint({
        iterIndex: i,
        telemetrySessionId,
        state,
        plan,
        userMessage,
        currentPhaseIndex: currentPhaseInfo.index,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Agent loop error at iteration ${state.iterations}: ${errMsg}`);
      broadcaster.send(`\n⚠️ Agent error: ${errMsg}\n`);
      state.consecutiveApiErrors++;
      if (state.consecutiveApiErrors >= 3) {
        state.finalResponse += `\nAgent stopped due to repeated errors: ${errMsg}`;
        break;
      }
    }
  }
}
