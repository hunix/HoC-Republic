/**
 * Parallel Mini-Loop — Lightweight agent executor for sub-tasks.
 *
 * Runs a focused, budget-constrained mini agent loop for a single sub-task.
 * Used by the parallel dispatcher to execute independent research/analysis
 * tasks concurrently.
 *
 * Design:
 *   - Much simpler than the full orchestrator (no dual-model, no reflexion,
 *     no parallel dispatch within parallel, no session checkpoints)
 *   - Shares the same sandbox filesystem with sibling sub-agents
 *   - Each sub-agent gets its own message history
 *   - Budget-constrained: max iterations from the sub-task's iterationBudget
 *   - Returns a structured result with output text, token count, and status
 */

import type { AgentProvider, AgentBroadcaster } from "../agent-providers/index.js";
import type { TOOLS as ToolsDef } from "../sandbox-tool-defs.js";
import type { SubTask, SubTaskResult } from "./parallel-dispatch.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  initMessageHistories,
  dispatchToProvider,
  createBoundToolRunner,
  appendTurnToHistory,
  executeCodeActBlocks,
  type LoopState,
} from "../sandbox-agent-loop/iteration.js";

const _logger = createSubsystemLogger("parallel-miniloop");

// ─── Sub-Agent System Prompt ────────────────────────────────────

function buildSubAgentPrompt(subTask: SubTask, parentTaskDescription: string): string {
  return [
    `You are a focused research sub-agent working on a specific part of a larger task.`,
    ``,
    `## Parent Task Context`,
    `${parentTaskDescription}`,
    ``,
    `## Your Assignment`,
    `**Phase:** ${subTask.phase}`,
    `**Description:** ${subTask.description}`,
    ``,
    `## Instructions`,
    `- Focus ONLY on your assigned phase. Do not attempt the full task.`,
    `- Use the available tools to gather information, write files, or execute code.`,
    `- Be concise and factual in your output.`,
    `- Save any results to /workspace/${subTask.id}/ directory.`,
    `- When you have completed your assignment, provide a clear summary of findings.`,
    `- You have a limited iteration budget (${subTask.iterationBudget} iterations). Be efficient.`,
  ].join("\n");
}

// ─── Mini-Loop Executor ─────────────────────────────────────────

/**
 * Run a lightweight mini agent loop for a single sub-task.
 * Returns a structured result with the sub-agent's findings.
 */
export async function runMiniLoop(
  subTask: SubTask,
  parentTaskDescription: string,
  provider: AgentProvider,
  modelId: string,
  tools: typeof ToolsDef,
  broadcaster: AgentBroadcaster,
  abortSignal?: AbortSignal,
): Promise<SubTaskResult> {
  const startMs = Date.now();
  const maxIter = Math.min(subTask.iterationBudget, 10); // Cap sub-agent at 10 iters
  let totalTokens = 0;
  let finalOutput = "";
  let iterations = 0;

  const systemPrompt = buildSubAgentPrompt(subTask, parentTaskDescription);
  const userMessage = `Execute: ${subTask.description}`;

  // Create independent message histories for this sub-agent
  const { anthropicMessages, openaiMessages, geminiContents } = initMessageHistories(
    systemPrompt,
    userMessage,
  );

  // Create a scoped broadcaster that prefixes messages with the sub-task ID
  const scopedBroadcaster: AgentBroadcaster = {
    send: (msg: string) => {
      broadcaster.send(`  [${subTask.phase}] ${msg}`);
    },
    toolEvent: broadcaster.toolEvent
      ? (event) => {
          broadcaster.toolEvent?.({
            ...event,
            description: `[${subTask.phase}] ${event.description}`,
          });
        }
      : undefined,
  };

  // Minimal loop state for the tool runner
  const state: LoopState = {
    provider,
    modelId,
    label: `${provider}/${modelId}`,
    baseProvider: provider,
    baseModelId: modelId,
    dualModePrefix: "",
    dualModelConfig: {
      hasDualModels: false,
      thinkProvider: null,
      thinkModel: null,
      execProvider: null,
      execModel: null,
    },
    systemPrompt,
    effectiveTools: tools,
    broadcaster: scopedBroadcaster,
    abortSignal,
    iterations: 0,
    totalTokens: 0,
    finalResponse: "",
    previewUrl: null,
    consecutiveApiErrors: 0,
    totalToolErrors: 0,
    approxHistoryBytes: 0,
    toolsUsedInLoop: [],
  };

  const toolRunner = createBoundToolRunner(state);

  try {
    for (let i = 0; i < maxIter; i++) {
      iterations = i + 1;
      state.iterations = iterations;

      if (abortSignal?.aborted) {
        break;
      }

      const iteration = await dispatchToProvider(
        provider,
        modelId,
        anthropicMessages,
        openaiMessages,
        geminiContents,
        scopedBroadcaster,
        tools,
        systemPrompt,
        abortSignal,
      );

      if (!iteration) {
        state.consecutiveApiErrors++;
        if (state.consecutiveApiErrors >= 2) {
          break;
        }
        continue;
      }

      state.consecutiveApiErrors = 0;
      totalTokens += iteration.inputTokens + iteration.outputTokens;

      // Collect text output
      for (const text of iteration.textBlocks) {
        if (text) {
          finalOutput += text + "\n";
        }
      }

      // CodeAct
      await executeCodeActBlocks(iteration.textBlocks, scopedBroadcaster);

      // Done check
      if (iteration.done || iteration.toolCalls.length === 0) {
        break;
      }

      // Execute tools
      const toolResults = await toolRunner.runToolsInParallel(iteration.toolCalls);

      // Append to history
      appendTurnToHistory(
        provider,
        anthropicMessages,
        openaiMessages,
        geminiContents,
        iteration,
        toolResults,
      );
    }

    return {
      id: subTask.id,
      phase: subTask.phase,
      success: finalOutput.trim().length > 0,
      output: finalOutput.trim().slice(0, 5000), // Cap output size
      iterations,
      tokensUsed: totalTokens,
      durationMs: Date.now() - startMs,
    };
  } catch (err) {
    return {
      id: subTask.id,
      phase: subTask.phase,
      success: false,
      output: finalOutput.trim().slice(0, 2000),
      iterations,
      tokensUsed: totalTokens,
      durationMs: Date.now() - startMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
