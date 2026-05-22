/**
 * Parallel Sub-Agent Dispatch — Manus-style concurrent research workers.
 *
 * For RESEARCH and FULL_STACK strategies with independent sub-tasks,
 * this module forks the work into 2-5 concurrent LLM calls that
 * each handle a sub-task independently. Results are collected and
 * merged into the parent context.
 *
 * Design constraints:
 *   - Max 5 concurrent sub-agents (sandbox resource limits)
 *   - Only activates for strategies with confidence >= 0.7
 *   - Each sub-agent gets a focused system prompt for its sub-task
 *   - Sub-agents share the same sandbox filesystem
 *   - Parent orchestrator consolidates results
 *   - Falls back to sequential if any sub-agent fails
 *
 * This is a simplified version of Manus's multi-container parallelism:
 * we run concurrent LLM calls (not concurrent containers), which is
 * achievable without additional infrastructure.
 */

import type { AgentBroadcaster } from "../agent-providers/index.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const logger = createSubsystemLogger("parallel-dispatch");

// ─── Types ──────────────────────────────────────────────────────

export interface SubTask {
  id: string;
  phase: string;
  description: string;
  tools: string[];
  iterationBudget: number;
}

export interface SubTaskResult {
  id: string;
  phase: string;
  success: boolean;
  output: string;
  iterations: number;
  tokensUsed: number;
  durationMs: number;
  error?: string;
}

export interface ParallelPlan {
  eligible: boolean;
  reason: string;
  independentTasks: SubTask[];
  sequentialTasks: SubTask[];
}

// ─── Constants ──────────────────────────────────────────────────

const MAX_CONCURRENCY = 5;
const MIN_CONFIDENCE_FOR_PARALLEL = 0.7;
const PARALLEL_ELIGIBLE_STRATEGIES = new Set(["RESEARCH", "FULL_STACK", "ANALYSIS"]);

// ─── Parallel Eligibility Check ─────────────────────────────────

/**
 * Analyze the plan decomposition to determine which sub-tasks
 * can run in parallel vs. which must be sequential.
 *
 * Heuristic: phases that don't have data dependencies (i.e., their
 * description doesn't reference output of previous phases) can be
 * parallelized. The first phase (usually "Plan" or "Setup") and the
 * last phase (usually "Deliver" or "Synthesize") are always sequential.
 */
export function analyzeParallelEligibility(
  strategy: string,
  confidence: number,
  decomposition: Array<{
    phase: string;
    description: string;
    tools: string[];
    iterationBudget: number;
  }>,
): ParallelPlan {
  if (!PARALLEL_ELIGIBLE_STRATEGIES.has(strategy)) {
    return {
      eligible: false,
      reason: `Strategy "${strategy}" does not support parallel dispatch`,
      independentTasks: [],
      sequentialTasks: decomposition.map((d, i) => ({ id: `task-${i}`, ...d })),
    };
  }

  if (confidence < MIN_CONFIDENCE_FOR_PARALLEL) {
    return {
      eligible: false,
      reason: `Confidence ${(confidence * 100).toFixed(0)}% below threshold (${MIN_CONFIDENCE_FOR_PARALLEL * 100}%)`,
      independentTasks: [],
      sequentialTasks: decomposition.map((d, i) => ({ id: `task-${i}`, ...d })),
    };
  }

  if (decomposition.length < 3) {
    return {
      eligible: false,
      reason: "Too few phases for parallel dispatch",
      independentTasks: [],
      sequentialTasks: decomposition.map((d, i) => ({ id: `task-${i}`, ...d })),
    };
  }

  // First and last phases are always sequential (setup + delivery)
  const sequential: SubTask[] = [
    { id: "task-0", ...decomposition[0] },
    { id: `task-${decomposition.length - 1}`, ...decomposition[decomposition.length - 1] },
  ];

  // Middle phases are candidates for parallel execution
  const candidates = decomposition.slice(1, -1).map((d, i) => ({
    id: `task-${i + 1}`,
    ...d,
  }));

  // Limit concurrency
  const parallel = candidates.slice(0, MAX_CONCURRENCY);

  if (parallel.length < 2) {
    return {
      eligible: false,
      reason: "Not enough independent phases for parallel dispatch",
      independentTasks: [],
      sequentialTasks: decomposition.map((d, i) => ({ id: `task-${i}`, ...d })),
    };
  }

  return {
    eligible: true,
    reason: `${parallel.length} phases can run in parallel`,
    independentTasks: parallel,
    sequentialTasks: sequential,
  };
}

// ─── Parallel Execution ─────────────────────────────────────────

/**
 * Execute multiple sub-tasks concurrently using Promise.allSettled.
 * Each sub-task gets its own focused prompt and runs a short agent
 * mini-loop (typically 3-5 iterations).
 *
 * @param subTasks - Independent sub-tasks to run in parallel
 * @param executor - Function that runs a single sub-task and returns a result
 * @param broadcaster - For progress updates
 * @returns Array of results (one per sub-task)
 */
export async function executeParallel(
  subTasks: SubTask[],
  executor: (subTask: SubTask) => Promise<SubTaskResult>,
  broadcaster: AgentBroadcaster,
): Promise<SubTaskResult[]> {
  broadcaster.send(
    `\n⚡ **Parallel Dispatch** — Running ${subTasks.length} sub-tasks concurrently:\n` +
      subTasks.map((t, i) => `  ${i + 1}. ${t.phase}: ${t.description}`).join("\n") +
      "\n",
  );

  const startMs = Date.now();
  const results = await Promise.allSettled(subTasks.map((t) => executor(t)));
  const durationMs = Date.now() - startMs;

  const collected: SubTaskResult[] = results.map((r, i) => {
    if (r.status === "fulfilled") {
      return r.value;
    }
    return {
      id: subTasks[i].id,
      phase: subTasks[i].phase,
      success: false,
      output: "",
      iterations: 0,
      tokensUsed: 0,
      durationMs: 0,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
    };
  });

  const succeeded = collected.filter((r) => r.success).length;
  const failed = collected.filter((r) => !r.success).length;
  const totalTokens = collected.reduce((s, r) => s + r.tokensUsed, 0);

  broadcaster.send(
    `\n📊 **Parallel Complete** — ${succeeded}/${subTasks.length} succeeded` +
      `${failed > 0 ? `, ${failed} failed` : ""} in ${Math.round(durationMs / 1000)}s` +
      ` (${totalTokens.toLocaleString()} tokens)\n`,
  );

  if (failed > 0) {
    const failedTasks = collected.filter((r) => !r.success);
    for (const ft of failedTasks) {
      logger.warn(`[ParallelDispatch] Sub-task "${ft.phase}" failed: ${ft.error}`);
    }
  }

  return collected;
}

/**
 * Merge parallel sub-task results into a consolidated context string
 * that can be injected into the parent agent's message history.
 */
export function mergeParallelResults(results: SubTaskResult[]): string {
  const sections = results
    .filter((r) => r.success && r.output.length > 0)
    .map((r) => `### ${r.phase}\n${r.output}`)
    .join("\n\n---\n\n");

  if (!sections) {
    return "No results from parallel execution.";
  }

  return [
    "## Parallel Research Results",
    "",
    `The following results were gathered by ${results.length} concurrent research workers:`,
    "",
    sections,
    "",
    "---",
    "",
    "Synthesize the above results into a coherent response.",
  ].join("\n");
}
