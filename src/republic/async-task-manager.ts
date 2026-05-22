/**
 * Async Task Manager — Fire-and-forget task execution.
 *
 * Allows users to submit agent tasks that run asynchronously in the
 * background, independent of the WebSocket session. Users can:
 *   - Submit a task and get a taskId back immediately
 *   - Poll for status/progress from any session
 *   - Receive notifications when tasks complete
 *   - Retrieve results at any time
 *
 * Tasks persist across gateway restarts via SQLite.
 *
 * This closes the #1 gap with Manus AI: "fire-and-forget" autonomous tasks.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Architecture:
 *   submit(prompt) → taskId → background runSandboxAgentLoop() → persist result
 *   status(taskId) → { state, progress, steps }
 *   result(taskId) → { output, artifacts }
 * ────────────────────────────────────────────────────────────────────────
 */

import type { AgentBroadcaster, AgentLoopResult, ToolEvent } from "./agent-providers/types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getRepublicDb } from "./republic-sqlite.js";

const logger = createSubsystemLogger("async-tasks");

// ─── Types ──────────────────────────────────────────────────────

export type TaskState = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AsyncTask {
  id: string;
  /** The user's original prompt */
  prompt: string;
  /** Current state of the task */
  state: TaskState;
  /** When the task was submitted */
  createdAt: string;
  /** When the task started running */
  startedAt: string | null;
  /** When the task finished (success or failure) */
  completedAt: string | null;
  /** Progress steps broadcast during execution */
  steps: TaskStep[];
  /** The final agent loop result (null until completed) */
  result: AgentLoopResult | null;
  /** Error message if failed */
  error: string | null;
  /** Optional model override from user */
  modelOverride?: { provider: string; modelId: string };
}

export interface TaskStep {
  timestamp: string;
  type: "text" | "tool" | "thinking" | "error";
  content: string;
}

// ─── Configuration ──────────────────────────────────────────────

const MAX_TASKS = 200;
const MAX_STEPS_PER_TASK = 500;
/** Flush steps to SQLite every N steps to reduce write pressure */
const STEP_FLUSH_INTERVAL = 10;

// ─── Schema Migration ───────────────────────────────────────────

let _schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (_schemaReady) {
    return;
  }
  const db = await getRepublicDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS async_tasks (
      id TEXT PRIMARY KEY,
      prompt TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'queued',
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      steps_json TEXT NOT NULL DEFAULT '[]',
      result_json TEXT,
      error TEXT,
      model_override_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_async_tasks_state ON async_tasks(state);
    CREATE INDEX IF NOT EXISTS idx_async_tasks_created ON async_tasks(created_at DESC);
  `);
  _schemaReady = true;
}

// ─── In-Memory Cache (write-through to SQLite) ──────────────────

const tasksCache = new Map<string, AsyncTask>();
let _cacheHydrated = false;

/**
 * Load active tasks (queued/running) from SQLite on first access.
 * Completed/failed tasks are loaded on-demand to avoid memory bloat.
 */
async function hydrateCache(): Promise<void> {
  if (_cacheHydrated) {
    return;
  }
  await ensureSchema();
  const db = await getRepublicDb();

  // Load recent tasks (last 100) into memory for fast access
  const rows = db
    .prepare(`SELECT * FROM async_tasks ORDER BY created_at DESC LIMIT ?`)
    .all(MAX_TASKS) as unknown as DbRow[];

  for (const row of rows) {
    tasksCache.set(row.id, rowToTask(row));
  }

  // Mark any tasks that were "running" at shutdown as failed
  // (they won't be resumed — the agent loop context is lost)
  for (const [, task] of tasksCache) {
    if (task.state === "running") {
      task.state = "failed";
      task.error = "Gateway restarted while task was running";
      task.completedAt = new Date().toISOString();
      await persistTask(task);
    }
  }

  _cacheHydrated = true;
  logger.info(`[async] Hydrated ${tasksCache.size} tasks from SQLite`);
}

// ─── DB Row ↔ Task Conversion ───────────────────────────────────

interface DbRow {
  id: string;
  prompt: string;
  state: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  steps_json: string;
  result_json: string | null;
  error: string | null;
  model_override_json: string | null;
}

function rowToTask(row: DbRow): AsyncTask {
  return {
    id: row.id,
    prompt: row.prompt,
    state: row.state as TaskState,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    steps: safeJsonParse<TaskStep[]>(row.steps_json, []),
    result: row.result_json ? safeJsonParse<AgentLoopResult | null>(row.result_json, null) : null,
    error: row.error,
    modelOverride: row.model_override_json
      ? safeJsonParse<{ provider: string; modelId: string } | undefined>(
          row.model_override_json,
          undefined,
        )
      : undefined,
  };
}

function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// ─── Persistence Helpers ────────────────────────────────────────

async function persistTask(task: AsyncTask): Promise<void> {
  const db = await getRepublicDb();
  db.prepare(`
    INSERT OR REPLACE INTO async_tasks
      (id, prompt, state, created_at, started_at, completed_at,
       steps_json, result_json, error, model_override_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    task.id,
    task.prompt,
    task.state,
    task.createdAt,
    task.startedAt,
    task.completedAt,
    JSON.stringify(task.steps.slice(-MAX_STEPS_PER_TASK)),
    task.result ? JSON.stringify(task.result) : null,
    task.error,
    task.modelOverride ? JSON.stringify(task.modelOverride) : null,
  );
}

/**
 * Flush only the steps and state columns (hot path during execution).
 * Avoids serializing the full result on every step.
 */
async function flushSteps(task: AsyncTask): Promise<void> {
  const db = await getRepublicDb();
  db.prepare(`UPDATE async_tasks SET steps_json = ?, state = ? WHERE id = ?`).run(
    JSON.stringify(task.steps.slice(-MAX_STEPS_PER_TASK)),
    task.state,
    task.id,
  );
}

// ─── Eviction ───────────────────────────────────────────────────

async function evictOldTasks(): Promise<void> {
  if (tasksCache.size < MAX_TASKS) {
    return;
  }

  const db = await getRepublicDb();
  // Delete oldest completed/failed/cancelled tasks beyond the limit
  db.prepare(`
    DELETE FROM async_tasks WHERE id IN (
      SELECT id FROM async_tasks
      WHERE state IN ('completed', 'failed', 'cancelled')
      ORDER BY created_at ASC
      LIMIT ?
    )
  `).run(Math.max(1, tasksCache.size - MAX_TASKS + 20));

  // Evict from cache too
  const entries = [...tasksCache.entries()]
    .filter(([, t]) => t.state === "completed" || t.state === "failed" || t.state === "cancelled")
    .toSorted((a, b) => (a[1].createdAt < b[1].createdAt ? -1 : 1));

  for (const [id] of entries.slice(0, Math.max(1, entries.length - 10))) {
    tasksCache.delete(id);
  }
}

// ─── Task ID Generation ────────────────────────────────────────

let _taskCounter = 0;

function generateTaskId(): string {
  _taskCounter++;
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `task_${timestamp}_${random}_${_taskCounter}`;
}

// ─── Public API ────────────────────────────────────────────────

/**
 * Submit a new task for background execution.
 * Returns the taskId immediately — the agent runs asynchronously.
 */
export async function submitTask(
  prompt: string,
  opts?: { modelOverride?: { provider: string; modelId: string } },
): Promise<string> {
  await hydrateCache();
  await evictOldTasks();

  const taskId = generateTaskId();
  const task: AsyncTask = {
    id: taskId,
    prompt,
    state: "queued",
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    steps: [],
    result: null,
    error: null,
    modelOverride: opts?.modelOverride,
  };

  tasksCache.set(taskId, task);
  await persistTask(task);
  logger.info(`[async] Task ${taskId} queued: "${prompt.slice(0, 80)}..."`);

  // Start execution asynchronously (fire-and-forget)
  void executeTask(taskId).catch((err) => {
    logger.error(
      `[async] Task ${taskId} crashed: ${err instanceof Error ? err.message : String(err)}`,
    );
    const t = tasksCache.get(taskId);
    if (t) {
      t.state = "failed";
      t.error = err instanceof Error ? err.message : String(err);
      t.completedAt = new Date().toISOString();
      void persistTask(t);
    }
  });

  return taskId;
}

/** Get the current status of a task */
export async function getTaskStatus(taskId: string): Promise<AsyncTask | null> {
  await hydrateCache();
  // Check cache first
  const cached = tasksCache.get(taskId);
  if (cached) {
    return cached;
  }

  // Fall back to SQLite for older tasks not in cache
  await ensureSchema();
  const db = await getRepublicDb();
  const row = db.prepare(`SELECT * FROM async_tasks WHERE id = ?`).get(taskId) as DbRow | undefined;
  if (!row) {
    return null;
  }

  const task = rowToTask(row as unknown as DbRow);
  tasksCache.set(taskId, task); // promote to cache
  return task;
}

/** Get the result of a completed task */
export async function getTaskResult(taskId: string): Promise<AgentLoopResult | null> {
  const task = await getTaskStatus(taskId);
  if (!task || task.state !== "completed") {
    return null;
  }
  return task.result;
}

/** Cancel a running or queued task */
export async function cancelTask(taskId: string): Promise<boolean> {
  await hydrateCache();
  const task = tasksCache.get(taskId);
  if (!task) {
    return false;
  }

  if (task.state === "queued" || task.state === "running") {
    task.state = "cancelled";
    task.completedAt = new Date().toISOString();
    const controller = _abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      _abortControllers.delete(taskId);
    }
    await persistTask(task);
    logger.info(`[async] Task ${taskId} cancelled`);
    return true;
  }
  return false;
}

/** List all tasks (newest first), optionally filtered by state */
export async function listTasks(opts?: {
  state?: TaskState;
  limit?: number;
}): Promise<AsyncTask[]> {
  await hydrateCache();
  let result = [...tasksCache.values()].toSorted((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  if (opts?.state) {
    result = result.filter((t) => t.state === opts.state);
  }
  if (opts?.limit) {
    result = result.slice(0, opts.limit);
  }
  return result;
}

// ─── Internal: Task Execution ──────────────────────────────────

const _abortControllers = new Map<string, AbortController>();

async function executeTask(taskId: string): Promise<void> {
  const task = tasksCache.get(taskId);
  if (!task || task.state !== "queued") {
    return;
  }

  task.state = "running";
  task.startedAt = new Date().toISOString();
  await persistTask(task);

  const abortController = new AbortController();
  _abortControllers.set(taskId, abortController);

  // Step flush counter — only write to SQLite every N steps
  let stepsSinceFlush = 0;

  // Create a broadcaster that records steps instead of sending to WebSocket
  const broadcaster: AgentBroadcaster = {
    send: (text: string) => {
      if (task.steps.length < MAX_STEPS_PER_TASK) {
        task.steps.push({
          timestamp: new Date().toISOString(),
          type: "text",
          content: text,
        });
        stepsSinceFlush++;
        if (stepsSinceFlush >= STEP_FLUSH_INTERVAL) {
          stepsSinceFlush = 0;
          void flushSteps(task);
        }
      }
    },
    toolEvent: (event: ToolEvent) => {
      if (task.steps.length < MAX_STEPS_PER_TASK) {
        task.steps.push({
          timestamp: new Date().toISOString(),
          type: "tool",
          content: `${event.status}: ${event.toolName} — ${event.description}`,
        });
        stepsSinceFlush++;
        if (stepsSinceFlush >= STEP_FLUSH_INTERVAL) {
          stepsSinceFlush = 0;
          void flushSteps(task);
        }
      }
    },
  };

  try {
    const { runSandboxAgentLoop } = await import("./sandbox-agent-loop.js");

    const result = await runSandboxAgentLoop(task.prompt, broadcaster, {
      modelOverride: task.modelOverride,
      abortSignal: abortController.signal,
    });

    task.result = result;
    task.state = result.success ? "completed" : "failed";
    task.error = result.success ? null : result.response;
    task.completedAt = new Date().toISOString();
    await persistTask(task);

    const durationMs = Date.now() - new Date(task.startedAt!).getTime();
    logger.info(
      `[async] Task ${taskId} ${task.state} in ${Math.round(durationMs / 1000)}s ` +
        `(${result.iterations} iterations, ${result.totalTokens} tokens)`,
    );
  } catch (err) {
    task.state = "failed";
    task.error = err instanceof Error ? err.message : String(err);
    task.completedAt = new Date().toISOString();
    await persistTask(task);
    logger.error(`[async] Task ${taskId} failed: ${task.error}`);
  } finally {
    _abortControllers.delete(taskId);
  }
}

/** Returns counts of tasks by state */
export async function getTaskStats(): Promise<Record<TaskState, number>> {
  await hydrateCache();
  const stats: Record<TaskState, number> = {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
  for (const task of tasksCache.values()) {
    stats[task.state]++;
  }
  return stats;
}
