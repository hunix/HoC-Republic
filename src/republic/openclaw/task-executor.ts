/**
 * OpenClaw Task Executor — Adapted for HoC Republic
 *
 * Bridges task-registry records into the real-execution pipeline:
 *   1. Dequeues highest-priority task from the registry
 *   2. Resolves it to a Republic tool action
 *   3. Executes via real-execution.ts
 *   4. Reports result back to the registry
 *
 * Also supports flow-aware execution:
 *   - Links child tasks to parent flows
 *   - Propagates cancellation across flow trees
 *   - Emits events to intelligence-bus
 *
 * Ported from upstream openclaw/src/tasks/task-executor.ts
 */

import type { TaskRecord, CreateTaskOptions } from "./task-registry.js";
import { taskFlowRegistry } from "./task-flow-registry.js";
import { taskRegistry } from "./task-registry.js";

// ─── Executor Config ─────────────────────────────────────────────

export interface TaskExecutorConfig {
  /** Max concurrent tasks */
  concurrency: number;
  /** Default TTL for tasks without explicit TTL (ms) */
  defaultTtlMs: number;
  /** Polling interval for dequeuing tasks (ms) */
  pollIntervalMs: number;
  /** Whether to auto-start the poll loop */
  autoStart: boolean;
}

const DEFAULT_CONFIG: TaskExecutorConfig = {
  concurrency: 5,
  defaultTtlMs: 60_000,
  pollIntervalMs: 2_000,
  autoStart: false,
};

// ─── Task-to-Tool Mapping ────────────────────────────────────────

/**
 * Maps task names to Republic tool names and parameter transformers.
 * Extend this to support new task types.
 */
/** Identity passthrough — most tasks use the same params. */
const id = (p: Record<string, unknown>) => p;

const TASK_TOOL_MAP: Record<
  string,
  {
    toolName: string;
    transformParams: (params: Record<string, unknown>) => Record<string, unknown>;
  }
> = {
  // ── Code Development ──────────────────────────────────────────
  "code.write": { toolName: "write_code", transformParams: id },
  "code.create": { toolName: "create_file", transformParams: id },
  "code.review": { toolName: "code_review", transformParams: id },
  "code.test": { toolName: "run_tests", transformParams: id },
  "code.debug": { toolName: "debug_code", transformParams: id },
  "code.lint": { toolName: "lint_code", transformParams: id },
  "code.write_test": { toolName: "write_test", transformParams: id },
  "code.scaffold": { toolName: "scaffold_project", transformParams: id },
  "code.deploy": { toolName: "deploy_app", transformParams: id },
  "code.commit": { toolName: "git_commit", transformParams: id },
  "code.schema": { toolName: "write_schema", transformParams: id },
  // ── Agentic Development ───────────────────────────────────────
  "agentic.develop": { toolName: "develop", transformParams: id },
  "agentic.debug": { toolName: "agentic_debug", transformParams: id },
  // ── Automation ────────────────────────────────────────────────
  "browse.web": { toolName: "browse_web", transformParams: id },
  "desktop.control": { toolName: "control_desktop", transformParams: id },
  "research.topic": { toolName: "research_topic", transformParams: id },
  // ── Docker Operations ─────────────────────────────────────────
  "docker.run": { toolName: "docker_run", transformParams: id },
  "docker.ps": { toolName: "docker_ps", transformParams: id },
  "docker.stop": { toolName: "docker_stop", transformParams: id },
  "docker.exec": { toolName: "docker_exec", transformParams: id },
  "docker.build": { toolName: "docker_build", transformParams: id },
  "docker.compile": { toolName: "docker_compile", transformParams: id },
  "docker.list_containers": { toolName: "docker_list_containers", transformParams: id },
  "docker.provision_backend": { toolName: "docker_provision_backend", transformParams: id },
  "docker.stop_container": { toolName: "docker_stop_container", transformParams: id },
  "docker.exec_in_container": { toolName: "docker_exec_in_container", transformParams: id },
  "docker.get_logs": { toolName: "docker_get_logs", transformParams: id },
  // ── Media Production ──────────────────────────────────────────
  "media.image": { toolName: "create_art", transformParams: id },
  "media.video": { toolName: "generate_video", transformParams: id },
  "media.video_clip": { toolName: "generate_video_clip", transformParams: id },
  "media.music": { toolName: "generate_music_track", transformParams: id },
  // ── Sandbox ───────────────────────────────────────────────────
  "sandbox.exec": { toolName: "sandbox_exec", transformParams: id },
  "sandbox.browse": { toolName: "sandbox_browse", transformParams: id },
  "sandbox.build_project": { toolName: "sandbox_build_project", transformParams: id },
  "web.scrape": { toolName: "web_scrape", transformParams: id },
  // ── Cyber/Scanning ────────────────────────────────────────────
  "cyber.scan": { toolName: "kali_scan", transformParams: id },
  // ── ComfyUI ───────────────────────────────────────────────────
  "comfyui.generate": { toolName: "comfyui_generate", transformParams: id },
  "comfyui.status": { toolName: "comfyui_status", transformParams: id },
  // ── LLM Operations ────────────────────────────────────────────
  "llm.train": { toolName: "llm_ops_train", transformParams: id },
  "llm.quantize": { toolName: "llm_ops_quantize", transformParams: id },
  "llm.deploy": { toolName: "llm_ops_deploy", transformParams: id },
  "llm.download": { toolName: "download_local_llm", transformParams: id },
  "llm.start": { toolName: "start_local_llm", transformParams: id },
  // ── Machine Learning ──────────────────────────────────────────
  "ml.predict": { toolName: "ml_predict", transformParams: id },
  "ml.classify": { toolName: "ml_classify", transformParams: id },
  "ml.detect_anomalies": { toolName: "ml_detect_anomalies", transformParams: id },
  // ── Forex Trading ─────────────────────────────────────────────
  "forex.get_rates": { toolName: "forex_get_rates", transformParams: id },
  "forex.analyze_pair": { toolName: "forex_analyze_pair", transformParams: id },
  "forex.place_trade": { toolName: "forex_place_trade", transformParams: id },
  "forex.get_positions": { toolName: "forex_get_positions", transformParams: id },
  "forex.backtest_strategy": { toolName: "forex_backtest_strategy", transformParams: id },
  "forex.economic_calendar": { toolName: "forex_economic_calendar", transformParams: id },
  // ── Infrastructure ────────────────────────────────────────────
  "gateway.clone_node": { toolName: "gateway_clone_node", transformParams: id },
  "gateway.form_cluster": { toolName: "gateway_form_cluster", transformParams: id },
  // ── Memory / Cognition ────────────────────────────────────────
  "memory.chain_of_thought": { toolName: "memory_chain_of_thought", transformParams: id },
  "memory.tree_of_thought": { toolName: "memory_tree_of_thought", transformParams: id },
  // ── Skills ────────────────────────────────────────────────────
  "skill.forge": { toolName: "skill_forge_create", transformParams: id },
  "citizen.broadcast": { toolName: "citizen_broadcast_awareness", transformParams: id },
  "civilization.sync": { toolName: "civilization_sync_state", transformParams: id },
};

// ─── Executor Implementation ─────────────────────────────────────

class TaskExecutor {
  private config: TaskExecutorConfig;
  private activeCount = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config?: Partial<TaskExecutorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (this.config.autoStart) {
      this.start();
    }
  }

  /**
   * Start the poll-based execution loop.
   */
  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.pollTimer = setInterval(() => this.pollAndExecute(), this.config.pollIntervalMs);
    if (this.pollTimer.unref) {
      this.pollTimer.unref();
    }
  }

  /**
   * Stop the execution loop.
   */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Submit a task for execution. Creates in registry and optionally links to flow.
   */
  submit(opts: CreateTaskOptions): TaskRecord {
    const task = taskRegistry.create({
      ...opts,
      ttlMs: opts.ttlMs ?? this.config.defaultTtlMs,
    });

    // Link to flow if specified
    if (task.flowId) {
      const flow = taskFlowRegistry.get(task.flowId);
      if (flow) {
        taskFlowRegistry.addChild(task.flowId, task.id);
      }
    }

    return task;
  }

  /**
   * Submit and immediately execute a task (bypass queue).
   */
  async submitAndExecute(opts: CreateTaskOptions): Promise<TaskRecord> {
    const task = this.submit(opts);
    await this.executeTask(task);
    return taskRegistry.get(task.id) ?? task;
  }

  /**
   * Cancel all tasks in a flow (cascading cancellation).
   */
  cancelFlow(flowId: string, reason = "flow cancelled"): number {
    const tasks = taskRegistry.getByFlow(flowId);
    let cancelled = 0;
    for (const task of tasks) {
      if (task.state === "queued" || task.state === "running") {
        taskRegistry.cancel(task.id, reason);
        cancelled++;
      }
    }
    taskFlowRegistry.fail(flowId, reason);
    return cancelled;
  }

  /**
   * Get executor status for diagnostics.
   */
  getStatus(): {
    running: boolean;
    activeCount: number;
    concurrency: number;
    registryStats: ReturnType<typeof taskRegistry.getStats>;
  } {
    return {
      running: this.running,
      activeCount: this.activeCount,
      concurrency: this.config.concurrency,
      registryStats: taskRegistry.getStats(),
    };
  }

  // ─── Internal ────────────────────────────────────────────────────

  private async pollAndExecute(): Promise<void> {
    if (this.activeCount >= this.config.concurrency) {
      return;
    }

    const slotsAvailable = this.config.concurrency - this.activeCount;
    const queued = taskRegistry.listQueued(slotsAvailable);

    for (const task of queued) {
      if (this.activeCount >= this.config.concurrency) {
        break;
      }
      // Fire and forget — don't block the poll loop
      this.executeTask(task).catch(() => {
        // Errors handled inside executeTask
      });
    }
  }

  private async executeTask(task: TaskRecord): Promise<void> {
    const started = taskRegistry.start(task.id);
    if (!started) {
      return;
    } // Already started or invalid state

    this.activeCount++;

    try {
      // Resolve tool mapping
      const mapping = TASK_TOOL_MAP[task.name];
      if (!mapping) {
        // No direct tool mapping — mark as succeeded (generic tasks complete immediately)
        taskRegistry.succeed(task.id, {
          message: `Task "${task.name}" completed (no tool mapping)`,
        });
        return;
      }

      // Execute via the mapped tool name.
      // The actual tool execution is delegated to the runtime integration —
      // callers can override this by providing an executor callback in metadata.
      const executor = task.metadata._executor as
        | ((
            toolName: string,
            params: Record<string, unknown>,
          ) => Promise<{
            status: string;
            output?: string;
            error?: string;
            filesAffected?: string[];
            durationMs?: number;
          }>)
        | undefined;

      if (executor) {
        const result = await executor(mapping.toolName, mapping.transformParams(task.params));
        if (result.status === "failed") {
          taskRegistry.fail(task.id, result.error ?? "execution failed");
        } else {
          taskRegistry.succeed(task.id, {
            output: result.output,
            filesAffected: result.filesAffected,
            durationMs: result.durationMs,
          });
        }
      } else {
        // Default: execute via the Republic real-execution bridge
        const { executeToolAction } = await import("../real-execution.js");
        const meta = task.metadata as Record<string, unknown>;
        const ctx = {
          citizenId: (meta.citizenId as string) ?? "openclaw-system",
          citizenName: (meta.citizenName as string) ?? "OpenClaw",
          specialization: (meta.specialization as string) ?? "Agent",
          skillLevel: Number(meta.skillLevel ?? 50),
          projectId: (meta.projectId as string) ?? "default",
          mode: "real" as const,
        };
        const result = await executeToolAction(
          mapping.toolName,
          mapping.transformParams(task.params),
          ctx,
        );
        if (result.status === "failed") {
          taskRegistry.fail(task.id, result.error ?? "execution failed");
        } else {
          taskRegistry.succeed(task.id, {
            output: result.output,
            filesAffected: result.filesAffected,
            durationMs: result.durationMs,
          });
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      taskRegistry.fail(task.id, message);
    } finally {
      this.activeCount--;

      // Check if flow is complete
      if (task.flowId) {
        const flowTasks = taskRegistry.getByFlow(task.flowId);
        const allDone = flowTasks.every(
          (t) => t.state === "succeeded" || t.state === "failed" || t.state === "cancelled",
        );
        if (allDone) {
          const anyFailed = flowTasks.some((t) => t.state === "failed");
          if (anyFailed) {
            taskFlowRegistry.fail(task.flowId, "one or more child tasks failed");
          } else {
            taskFlowRegistry.complete(task.flowId);
          }
        }
      }
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────

export const taskExecutor = new TaskExecutor();
