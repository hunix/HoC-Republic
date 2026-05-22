/**
 * OpenClaw Task Registry — Adapted for HoC Republic
 *
 * Manages the lifecycle of individual tasks:
 *   queued → running → succeeded | failed | timed_out | cancelled | lost
 *
 * Features:
 *   - Indexed lookups by ID, owner, and flow
 *   - TTL enforcement with automatic timeout
 *   - Delivery policies (at_most_once, at_least_once)
 *   - Parent-flow linking for DAG orchestration
 *   - Ring-buffer event log for UI polling
 *
 * Ported from upstream openclaw/src/tasks/task-registry.ts
 * Adapted to use Republic's uid/ts utilities and intelligence-bus.
 */

import { uid, ts } from "../utils.js";

// ─── Task States ─────────────────────────────────────────────────

export type TaskState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "lost";

export type DeliveryPolicy = "at_most_once" | "at_least_once";

// ─── Task Record ─────────────────────────────────────────────────

export interface TaskRecord {
  /** Unique task ID */
  id: string;
  /** Human-readable task name */
  name: string;
  /** Owner citizen or system component */
  ownerId: string;
  /** Optional parent flow ID for DAG linking */
  flowId: string | null;
  /** Current lifecycle state */
  state: TaskState;
  /** Delivery guarantee */
  deliveryPolicy: DeliveryPolicy;
  /** Input parameters */
  params: Record<string, unknown>;
  /** Output result (set on completion) */
  result: unknown | null;
  /** Error message (set on failure) */
  error: string | null;
  /** Max execution time in ms (0 = unlimited) */
  ttlMs: number;
  /** Number of retry attempts made */
  retryCount: number;
  /** Max retry attempts */
  maxRetries: number;
  /** Priority (0 = highest) */
  priority: number;
  /** Tags for filtering */
  tags: string[];
  /** Created timestamp */
  createdAt: string;
  /** Started execution timestamp */
  startedAt: string | null;
  /** Completed timestamp */
  completedAt: string | null;
  /** Metadata for extensions */
  metadata: Record<string, unknown>;
}

// ─── Task Creation Options ───────────────────────────────────────

export interface CreateTaskOptions {
  name: string;
  ownerId: string;
  flowId?: string;
  params?: Record<string, unknown>;
  deliveryPolicy?: DeliveryPolicy;
  ttlMs?: number;
  maxRetries?: number;
  priority?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ─── Task Events ─────────────────────────────────────────────────

export interface TaskEvent {
  taskId: string;
  type: "created" | "started" | "succeeded" | "failed" | "timed_out" | "cancelled" | "retried";
  timestamp: number;
  detail: string;
}

// ─── Registry Implementation ─────────────────────────────────────

class TaskRegistry {
  /** Primary index: taskId → TaskRecord */
  private readonly tasks = new Map<string, TaskRecord>();
  /** Secondary index: ownerId → Set<taskId> */
  private readonly byOwner = new Map<string, Set<string>>();
  /** Secondary index: flowId → Set<taskId> */
  private readonly byFlow = new Map<string, Set<string>>();
  /** Event log ring buffer */
  private readonly events: TaskEvent[] = [];
  private readonly MAX_EVENTS = 500;
  private readonly MAX_TASKS = 10_000;

  /** TTL check interval handle */
  private ttlTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Check TTLs every 10 seconds
    this.ttlTimer = setInterval(() => this.enforceTTLs(), 10_000);
    // Prevent timer from keeping the process alive
    if (this.ttlTimer.unref) {
      this.ttlTimer.unref();
    }
  }

  // ─── CRUD ────────────────────────────────────────────────────────

  /**
   * Create and enqueue a new task.
   */
  create(opts: CreateTaskOptions): TaskRecord {
    // Evict oldest completed tasks if at capacity
    if (this.tasks.size >= this.MAX_TASKS) {
      this.evictCompleted();
    }

    const task: TaskRecord = {
      id: `task-${uid()}`,
      name: opts.name,
      ownerId: opts.ownerId,
      flowId: opts.flowId ?? null,
      state: "queued",
      deliveryPolicy: opts.deliveryPolicy ?? "at_most_once",
      params: opts.params ?? {},
      result: null,
      error: null,
      ttlMs: opts.ttlMs ?? 0,
      retryCount: 0,
      maxRetries: opts.maxRetries ?? 0,
      priority: opts.priority ?? 5,
      tags: opts.tags ?? [],
      createdAt: ts(),
      startedAt: null,
      completedAt: null,
      metadata: opts.metadata ?? {},
    };

    this.tasks.set(task.id, task);
    this.indexAdd("owner", task.ownerId, task.id);
    if (task.flowId) {
      this.indexAdd("flow", task.flowId, task.id);
    }

    this.pushEvent(task.id, "created", `Task "${task.name}" queued`);
    return task;
  }

  /**
   * Transition a task to 'running'.
   */
  start(taskId: string): TaskRecord | null {
    const task = this.tasks.get(taskId);
    if (!task || task.state !== "queued") {
      return null;
    }

    task.state = "running";
    task.startedAt = ts();
    this.pushEvent(taskId, "started", `Task "${task.name}" started`);
    return task;
  }

  /**
   * Mark a task as succeeded with result data.
   */
  succeed(taskId: string, result: unknown = null): TaskRecord | null {
    const task = this.tasks.get(taskId);
    if (!task || (task.state !== "running" && task.state !== "queued")) {
      return null;
    }

    task.state = "succeeded";
    task.result = result;
    task.completedAt = ts();
    this.pushEvent(taskId, "succeeded", `Task "${task.name}" succeeded`);
    return task;
  }

  /**
   * Mark a task as failed. Auto-retries if policy allows.
   */
  fail(taskId: string, error: string): TaskRecord | null {
    const task = this.tasks.get(taskId);
    if (!task || (task.state !== "running" && task.state !== "queued")) {
      return null;
    }

    // Retry logic for at_least_once delivery
    if (task.deliveryPolicy === "at_least_once" && task.retryCount < task.maxRetries) {
      task.retryCount++;
      task.state = "queued";
      task.startedAt = null;
      this.pushEvent(
        taskId,
        "retried",
        `Task "${task.name}" retry ${task.retryCount}/${task.maxRetries}: ${error}`,
      );
      return task;
    }

    task.state = "failed";
    task.error = error;
    task.completedAt = ts();
    this.pushEvent(taskId, "failed", `Task "${task.name}" failed: ${error}`);
    return task;
  }

  /**
   * Cancel a task (user-initiated or flow cancellation).
   */
  cancel(taskId: string, reason = "cancelled by owner"): TaskRecord | null {
    const task = this.tasks.get(taskId);
    if (!task || task.state === "succeeded" || task.state === "failed") {
      return null;
    }

    task.state = "cancelled";
    task.error = reason;
    task.completedAt = ts();
    this.pushEvent(taskId, "cancelled", `Task "${task.name}" cancelled: ${reason}`);
    return task;
  }

  // ─── Queries ─────────────────────────────────────────────────────

  get(taskId: string): TaskRecord | null {
    return this.tasks.get(taskId) ?? null;
  }

  getByOwner(ownerId: string): TaskRecord[] {
    const ids = this.byOwner.get(ownerId);
    if (!ids) {
      return [];
    }
    return [...ids].map((id) => this.tasks.get(id)!).filter(Boolean);
  }

  getByFlow(flowId: string): TaskRecord[] {
    const ids = this.byFlow.get(flowId);
    if (!ids) {
      return [];
    }
    return [...ids].map((id) => this.tasks.get(id)!).filter(Boolean);
  }

  listQueued(limit = 50): TaskRecord[] {
    const queued: TaskRecord[] = [];
    for (const task of this.tasks.values()) {
      if (task.state === "queued") {
        queued.push(task);
        if (queued.length >= limit) {
          break;
        }
      }
    }
    return queued.toSorted((a, b) => a.priority - b.priority);
  }

  listAll(opts?: { state?: TaskState; limit?: number; offset?: number }): TaskRecord[] {
    let tasks = [...this.tasks.values()];
    if (opts?.state) {
      tasks = tasks.filter((t) => t.state === opts.state);
    }
    const offset = opts?.offset ?? 0;
    const limit = opts?.limit ?? 100;
    return tasks.slice(offset, offset + limit);
  }

  getStats(): {
    total: number;
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    cancelled: number;
    timedOut: number;
  } {
    let queued = 0,
      running = 0,
      succeeded = 0,
      failed = 0,
      cancelled = 0,
      timedOut = 0;
    for (const task of this.tasks.values()) {
      switch (task.state) {
        case "queued":
          queued++;
          break;
        case "running":
          running++;
          break;
        case "succeeded":
          succeeded++;
          break;
        case "failed":
          failed++;
          break;
        case "cancelled":
          cancelled++;
          break;
        case "timed_out":
          timedOut++;
          break;
      }
    }
    return { total: this.tasks.size, queued, running, succeeded, failed, cancelled, timedOut };
  }

  getEvents(limit = 50): TaskEvent[] {
    return this.events.slice(0, limit);
  }

  // ─── TTL Enforcement ─────────────────────────────────────────────

  private enforceTTLs(): void {
    const now = Date.now();
    for (const task of this.tasks.values()) {
      if (task.state !== "running" || task.ttlMs <= 0 || !task.startedAt) {
        continue;
      }
      const elapsed = now - new Date(task.startedAt).getTime();
      if (elapsed > task.ttlMs) {
        task.state = "timed_out";
        task.error = `TTL exceeded: ${task.ttlMs}ms`;
        task.completedAt = ts();
        this.pushEvent(task.id, "timed_out", `Task "${task.name}" timed out after ${elapsed}ms`);
      }
    }
  }

  // ─── Internal Helpers ────────────────────────────────────────────

  private indexAdd(type: "owner" | "flow", key: string, taskId: string): void {
    const index = type === "owner" ? this.byOwner : this.byFlow;
    if (!index.has(key)) {
      index.set(key, new Set());
    }
    index.get(key)!.add(taskId);
  }

  private pushEvent(taskId: string, type: TaskEvent["type"], detail: string): void {
    this.events.unshift({ taskId, type, timestamp: Date.now(), detail });
    if (this.events.length > this.MAX_EVENTS) {
      this.events.length = this.MAX_EVENTS;
    }
  }

  private evictCompleted(): void {
    const completedIds: string[] = [];
    for (const [id, task] of this.tasks) {
      if (task.state === "succeeded" || task.state === "failed" || task.state === "cancelled") {
        completedIds.push(id);
      }
    }
    // Remove oldest completed tasks (up to 20% of capacity)
    const toRemove = completedIds.slice(0, Math.floor(this.MAX_TASKS * 0.2));
    for (const id of toRemove) {
      const task = this.tasks.get(id)!;
      this.tasks.delete(id);
      this.byOwner.get(task.ownerId)?.delete(id);
      if (task.flowId) {
        this.byFlow.get(task.flowId)?.delete(id);
      }
    }
  }

  /** Shutdown: clear TTL timer */
  destroy(): void {
    if (this.ttlTimer) {
      clearInterval(this.ttlTimer);
      this.ttlTimer = null;
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────

export const taskRegistry = new TaskRegistry();
