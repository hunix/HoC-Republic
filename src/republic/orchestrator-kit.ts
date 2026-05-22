/**
 * OrchestratorKit — Shared Base for All HoC Orchestrators
 *
 * Provides a reusable framework that all orchestrators (Kali, Deep Research,
 * Docker, n8n, Project, Dev, etc.) can build upon:
 *
 * 1. TOON Prompt Loading — each orchestrator has its own tool-prompts.json
 * 2. DAG Execution — dependency-aware task execution with parallel batches
 * 3. Error Isolation — single tool failure doesn't break the chain
 * 4. Task Supervision — adaptive timeouts via TaskSupervisor
 * 5. RAG Integration — semantic context injection for tool prompts
 *
 * Usage:
 *   const kit = createOrchestrator({ name: "kali", promptsPath: "kali-prompts/tool-prompts.json", ... });
 *   const plan = kit.buildPlan(target, scope);
 *   const results = await kit.executePlan(plan);
 */

import { getLogger } from "../logging.js";
import {
  registerTask,
  reportOutput,
  completeTask,
  cancelTask,
  getActiveTasks,
  formatTaskStatus,
  estimateTimeout,
  buildScopeHints,
  type TaskExecution,
} from "./task-supervisor.js";

const logger = getLogger();

// ─── Types ──────────────────────────────────────────────────────

export interface OrchestratorConfig {
  /** Unique name for this orchestrator (e.g., "kali", "deep-research", "n8n") */
  name: string;

  /** Path to TOON tool-prompts.json relative to republic/ */
  promptsPath?: string;

  /** Container type if this orchestrator uses a sandbox */
  containerType?: string;

  /** Default timeout in seconds */
  defaultTimeout: number;

  /** Maximum concurrent tool executions */
  maxConcurrent: number;

  /** Error isolation strategy */
  errorIsolation: "per-tool" | "per-phase";

  /** Whether RAG/semantic search is enabled */
  ragEnabled: boolean;

  /** Function to execute a command (provided by each orchestrator) */
  executor: (command: string, timeout: number) => Promise<ExecutionResult>;
}

export interface ExecutionResult {
  ok: boolean;
  stdout: string;
  stderr?: string;
  exitCode: number;
}

export interface ToolDefinition {
  id: string;
  cmd: string;
  prompt: string;
  args: Record<string, string>;
  output: Record<string, unknown>;
  timeout?: number;
  category?: string;
  depends?: string[];
}

export interface DAGNode {
  id: string;
  tool: string;
  command: string;
  phase: number;
  depends: string[];
  status: "pending" | "running" | "done" | "failed" | "skipped";
  result?: ExecutionResult;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  taskId?: string;   // TaskSupervisor task ID
}

export interface DAGPlan {
  id: string;
  target: string;
  nodes: DAGNode[];
  phases: number;
  createdAt: number;
}

export interface DAGExecutionResult {
  planId: string;
  target: string;
  totalNodes: number;
  completed: number;
  failed: number;
  skipped: number;
  results: Array<{ tool: string; status: string; output?: string; error?: string }>;
  durationMs: number;
}

// ─── TOON Prompt Loader ─────────────────────────────────────────

const promptCaches = new Map<string, { tools: Record<string, ToolDefinition>; patterns: Record<string, unknown> }>();

/**
 * Load TOON tool definitions from a JSON file.
 * Caches after first load.
 */
export function loadToolPrompts(
  promptsPath: string,
): { tools: Record<string, ToolDefinition>; patterns: Record<string, unknown> } {
  const cached = promptCaches.get(promptsPath);
  if (cached) { return cached; }

  try {
    // Dynamic import not needed — we parse JSON at runtime via fs
    const fs = require("node:fs");
    const path = require("node:path");
    const fullPath = path.resolve(
      typeof __dirname !== "undefined" ? __dirname : ".",
      promptsPath,
    );

    if (!fs.existsSync(fullPath)) {
      logger.warn(`[OrchestratorKit] Prompts file not found: ${fullPath}`);
      return { tools: {}, patterns: {} };
    }

    const raw = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
    const result = { tools: raw.tools ?? {}, patterns: raw.patterns ?? {} };
    promptCaches.set(promptsPath, result);
    return result;
  } catch (err) {
    logger.warn(`[OrchestratorKit] Failed to load prompts: ${err instanceof Error ? err.message : String(err)}`);
    return { tools: {}, patterns: {} };
  }
}

// ─── DAG Executor ───────────────────────────────────────────────

/**
 * Execute a DAG plan with error isolation and adaptive timeouts.
 *
 * - Tasks within the same phase run in parallel (up to maxConcurrent)
 * - If errorIsolation is "per-tool", a failed tool doesn't block its phase
 * - If errorIsolation is "per-phase", a failed tool skips remaining nodes in that phase
 * - TaskSupervisor handles timeout management for each node
 */
export async function executePlan(
  plan: DAGPlan,
  config: OrchestratorConfig,
  onProgress?: (node: DAGNode, allNodes: DAGNode[]) => void,
): Promise<DAGExecutionResult> {
  const startMs = Date.now();
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  const results: DAGExecutionResult["results"] = [];

  // Group nodes by phase
  const phases = new Map<number, DAGNode[]>();
  for (const node of plan.nodes) {
    const phaseNodes = phases.get(node.phase) ?? [];
    phaseNodes.push(node);
    phases.set(node.phase, phaseNodes);
  }

  // Execute phase by phase
  const sortedPhases = [...phases.keys()].toSorted((a, b) => a - b);

  for (const phaseNum of sortedPhases) {
    const phaseNodes = phases.get(phaseNum) ?? [];
    let phaseHadFailure = false;

    // Check dependencies — skip nodes whose deps failed
    for (const node of phaseNodes) {
      const depsFailed = node.depends.some(depId => {
        const depNode = plan.nodes.find(n => n.id === depId);
        return depNode?.status === "failed";
      });
      if (depsFailed) {
        node.status = "skipped";
        skipped++;
        results.push({ tool: node.tool, status: "skipped", error: "dependency failed" });
        onProgress?.(node, plan.nodes);
        continue;
      }
    }

    // Execute non-skipped nodes in parallel batches
    const runnableNodes = phaseNodes.filter(n => n.status === "pending");
    const batches = chunkArray(runnableNodes, config.maxConcurrent);

    for (const batch of batches) {
      if (phaseHadFailure && config.errorIsolation === "per-phase") {
        // Skip remaining batches in this phase
        for (const node of batch) {
          node.status = "skipped";
          skipped++;
          results.push({ tool: node.tool, status: "skipped", error: "phase aborted" });
          onProgress?.(node, plan.nodes);
        }
        continue;
      }

      const promises = batch.map(async (node) => {
        node.status = "running";
        node.startedAt = Date.now();
        onProgress?.(node, plan.nodes);

        // Register with TaskSupervisor for adaptive timeout
        const scope = buildScopeHints(plan.target);
        const task = registerTask(
          node.tool,
          node.command,
          plan.target,
          scope,
          (t: TaskExecution) => {
            if (t.status === "needs_user") {
              logger.warn(`[OrchestratorKit] ${node.tool} needs user decision — ${formatTaskStatus(t)}`);
            }
          },
        );
        node.taskId = task.id;

        try {
          const timeout = estimateTimeout(node.tool, scope);
          const result = await config.executor(node.command, timeout);

          // Report output to TaskSupervisor
          reportOutput(task.id, result.stdout.length + (result.stderr?.length ?? 0));
          completeTask(task.id, result);

          node.result = result;
          node.completedAt = Date.now();

          if (result.ok && result.exitCode === 0) {
            node.status = "done";
            completed++;
            results.push({
              tool: node.tool,
              status: "done",
              output: result.stdout.slice(0, 2000),
            });
          } else {
            node.status = "failed";
            node.error = result.stderr ?? `Exit code: ${result.exitCode}`;
            failed++;
            phaseHadFailure = true;
            results.push({
              tool: node.tool,
              status: "failed",
              error: node.error,
              output: result.stdout.slice(0, 500),
            });
          }
        } catch (err) {
          cancelTask(task.id);
          node.status = "failed";
          node.error = err instanceof Error ? err.message : String(err);
          node.completedAt = Date.now();
          failed++;
          phaseHadFailure = true;
          results.push({ tool: node.tool, status: "failed", error: node.error });
        }

        onProgress?.(node, plan.nodes);
      });

      await Promise.allSettled(promises);
    }
  }

  return {
    planId: plan.id,
    target: plan.target,
    totalNodes: plan.nodes.length,
    completed,
    failed,
    skipped,
    results,
    durationMs: Date.now() - startMs,
  };
}

// ─── Utilities ──────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Create an orchestrator instance with bound configuration.
 */
export function createOrchestrator(config: OrchestratorConfig) {
  const prompts = config.promptsPath ? loadToolPrompts(config.promptsPath) : { tools: {}, patterns: {} };

  return {
    config,
    prompts,

    /** Get all tool definitions */
    getTools(): ToolDefinition[] {
      return Object.values(prompts.tools);
    },

    /** Get a specific tool by ID */
    getTool(id: string): ToolDefinition | undefined {
      return prompts.tools[id];
    },

    /** Get scan patterns */
    getPatterns(): Record<string, unknown> {
      return prompts.patterns;
    },

    /** Execute a DAG plan */
    execute(plan: DAGPlan, onProgress?: (node: DAGNode, allNodes: DAGNode[]) => void) {
      return executePlan(plan, config, onProgress);
    },

    /** Get all currently active tasks */
    getActiveTasks() {
      return getActiveTasks().filter(t =>
        t.tool.startsWith(config.name) || prompts.tools[t.tool],
      );
    },

    /** Format a task status for display */
    formatStatus(task: TaskExecution) {
      return formatTaskStatus(task);
    },

    /** Cancel a running task */
    cancelTask(taskId: string) {
      return cancelTask(taskId);
    },
  };
}
