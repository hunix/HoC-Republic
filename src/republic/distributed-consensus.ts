/**
 * Republic Platform — Distributed Consensus Engine
 *
 * Phase 29: Multi-node state synchronization and work distribution.
 *
 * - CRDT-based state sync (GCounter, LWWRegister, ORSet)
 * - Vector clocks for causal ordering
 * - Work-stealing scheduler for load-balanced task distribution
 * - Leader-based authoritative state with follower delta sync
 * - Delta-compressed state transfer
 */

import { uid } from "./utils.js";

// ─── Vector Clock ───────────────────────────────────────────────

/** Vector clock for causal ordering across distributed nodes */
export class VectorClock {
  private clock: Map<string, number>;

  constructor(initial?: Record<string, number>) {
    this.clock = new Map(Object.entries(initial ?? {}));
  }

  /** Increment this node's logical clock */
  increment(nodeId: string): void {
    this.clock.set(nodeId, (this.clock.get(nodeId) ?? 0) + 1);
  }

  /** Merge with another vector clock (take max of each entry) */
  merge(other: VectorClock): void {
    for (const [nodeId, time] of other.clock.entries()) {
      this.clock.set(nodeId, Math.max(this.clock.get(nodeId) ?? 0, time));
    }
  }

  /** Check if this clock happens-before another */
  happensBefore(other: VectorClock): boolean {
    let atLeastOneLess = false;
    for (const [nodeId, time] of this.clock.entries()) {
      const otherTime = other.clock.get(nodeId) ?? 0;
      if (time > otherTime) {return false;}
      if (time < otherTime) {atLeastOneLess = true;}
    }
    // Check keys in other but not in this
    for (const [nodeId] of other.clock.entries()) {
      if (!this.clock.has(nodeId)) {atLeastOneLess = true;}
    }
    return atLeastOneLess;
  }

  /** Check if two clocks are concurrent (neither happens-before the other) */
  isConcurrentWith(other: VectorClock): boolean {
    return !this.happensBefore(other) && !other.happensBefore(this);
  }

  toJSON(): Record<string, number> {
    return Object.fromEntries(this.clock.entries());
  }

  static fromJSON(data: Record<string, number>): VectorClock {
    return new VectorClock(data);
  }
}

// ─── GCounter (Grow-Only Counter) ───────────────────────────────

/** Conflict-free grow-only counter — supports distributed increment */
export class GCounter {
  private counts: Map<string, number>;

  constructor(initial?: Record<string, number>) {
    this.counts = new Map(Object.entries(initial ?? {}));
  }

  increment(nodeId: string, amount = 1): void {
    this.counts.set(nodeId, (this.counts.get(nodeId) ?? 0) + amount);
  }

  /** Merge with another GCounter (take max per node) */
  merge(other: GCounter): void {
    for (const [nodeId, count] of other.counts.entries()) {
      this.counts.set(nodeId, Math.max(this.counts.get(nodeId) ?? 0, count));
    }
  }

  get value(): number {
    let sum = 0;
    for (const count of this.counts.values()) {sum += count;}
    return sum;
  }

  toJSON(): Record<string, number> {
    return Object.fromEntries(this.counts.entries());
  }

  static fromJSON(data: Record<string, number>): GCounter {
    return new GCounter(data);
  }
}

// ─── LWW Register (Last-Writer-Wins) ────────────────────────────

/** Last-Writer-Wins register — conflict resolution via timestamps */
export class LWWRegister<T> {
  private _value: T;
  private _timestamp: number;
  private _nodeId: string;

  constructor(value: T, timestamp: number, nodeId: string) {
    this._value = value;
    this._timestamp = timestamp;
    this._nodeId = nodeId;
  }

  get value(): T {
    return this._value;
  }
  get timestamp(): number {
    return this._timestamp;
  }

  /** Update value — only succeeds if timestamp is newer */
  set(value: T, timestamp: number, nodeId: string): boolean {
    if (timestamp > this._timestamp || (timestamp === this._timestamp && nodeId > this._nodeId)) {
      this._value = value;
      this._timestamp = timestamp;
      this._nodeId = nodeId;
      return true;
    }
    return false;
  }

  /** Merge with another register */
  merge(other: LWWRegister<T>): void {
    this.set(other._value, other._timestamp, other._nodeId);
  }

  toJSON(): { value: T; timestamp: number; nodeId: string } {
    return { value: this._value, timestamp: this._timestamp, nodeId: this._nodeId };
  }
}

// ─── ORSet (Observed-Remove Set) ────────────────────────────────

interface ORSetEntry<T> {
  value: T;
  addTag: string; // Unique tag per addition
  removed: boolean;
}

/** Observed-Remove Set — supports concurrent add/remove without conflicts */
export class ORSet<T> {
  private entries: Map<string, ORSetEntry<T>> = new Map();

  add(value: T): string {
    const tag = uid();
    this.entries.set(tag, { value, addTag: tag, removed: false });
    return tag;
  }

  /** Remove by tag (observed removal — only removes entries we've seen) */
  remove(tag: string): boolean {
    const entry = this.entries.get(tag);
    if (entry && !entry.removed) {
      entry.removed = true;
      return true;
    }
    return false;
  }

  /** Remove all entries with a given value */
  removeByValue(value: T): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (!entry.removed && entry.value === value) {
        entry.removed = true;
        count++;
      }
    }
    return count;
  }

  merge(other: ORSet<T>): void {
    for (const [tag, entry] of other.entries.entries()) {
      const existing = this.entries.get(tag);
      if (!existing) {
        this.entries.set(tag, { ...entry });
      } else if (entry.removed) {
        existing.removed = true;
      }
    }
  }

  get values(): T[] {
    const result: T[] = [];
    for (const entry of this.entries.values()) {
      if (!entry.removed) {result.push(entry.value);}
    }
    return result;
  }

  get size(): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (!entry.removed) {count++;}
    }
    return count;
  }
}

// ─── Work-Stealing Scheduler ────────────────────────────────────

export interface DistributedTask {
  id: string;
  type: string;
  payload: unknown;
  assignedNode: string | null;
  assignedAt: number | null;
  ackDeadline: number | null;
  status: "pending" | "assigned" | "running" | "completed" | "failed" | "stolen";
  attempts: number;
  maxAttempts: number;
  result?: unknown;
  error?: string;
}

interface NodeLoad {
  nodeId: string;
  activeTasks: number;
  cpuUsage: number;
  lastSeen: number;
}

const MAX_TASK_HISTORY = 500;
const ACK_TIMEOUT_MS = 15_000;

/**
 * Distributed work-stealing scheduler.
 * Assigns tasks to the least-loaded peer node.
 * Steals tasks from unresponsive nodes.
 */
export class DistributedScheduler {
  private tasks: Map<string, DistributedTask> = new Map();
  private taskHistory: DistributedTask[] = [];
  private nodeLoads: Map<string, NodeLoad> = new Map();

  /** Register or update a node's load status */
  updateNodeLoad(nodeId: string, activeTasks: number, cpuUsage: number): void {
    this.nodeLoads.set(nodeId, {
      nodeId,
      activeTasks,
      cpuUsage,
      lastSeen: Date.now(),
    });
  }

  /** Remove a dead node and reassign its tasks */
  removeNode(nodeId: string): DistributedTask[] {
    this.nodeLoads.delete(nodeId);
    const orphanedTasks: DistributedTask[] = [];

    for (const task of this.tasks.values()) {
      if (task.assignedNode === nodeId && task.status !== "completed") {
        task.assignedNode = null;
        task.status = "stolen";
        task.attempts++;
        orphanedTasks.push(task);
      }
    }

    return orphanedTasks;
  }

  /** Submit a new task to the scheduler */
  submit(type: string, payload: unknown, maxAttempts = 3): DistributedTask {
    const task: DistributedTask = {
      id: uid(),
      type,
      payload,
      assignedNode: null,
      assignedAt: null,
      ackDeadline: null,
      status: "pending",
      attempts: 0,
      maxAttempts,
    };

    this.tasks.set(task.id, task);
    this.scheduleTask(task);
    return task;
  }

  /** Find the least-loaded node and assign the task */
  private scheduleTask(task: DistributedTask): boolean {
    if (this.nodeLoads.size === 0) {return false;}

    const now = Date.now();
    let bestNode: string | null = null;
    let bestScore = Infinity;

    for (const [nodeId, load] of this.nodeLoads.entries()) {
      // Skip stale nodes (not seen in 30s)
      if (now - load.lastSeen > 30_000) {continue;}

      const score = load.activeTasks * 2 + load.cpuUsage;
      if (score < bestScore) {
        bestScore = score;
        bestNode = nodeId;
      }
    }

    if (!bestNode) {return false;}

    task.assignedNode = bestNode;
    task.assignedAt = now;
    task.ackDeadline = now + ACK_TIMEOUT_MS;
    task.status = "assigned";
    task.attempts++;
    return true;
  }

  /** Acknowledge task receipt (node confirms it's working) */
  ackTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (task && task.status === "assigned") {
      task.status = "running";
      task.ackDeadline = null;
      return true;
    }
    return false;
  }

  /** Complete a task with result */
  completeTask(taskId: string, result?: unknown): boolean {
    const task = this.tasks.get(taskId);
    if (task && (task.status === "running" || task.status === "assigned")) {
      task.status = "completed";
      task.result = result;
      this.archiveTask(task);
      return true;
    }
    return false;
  }

  /** Fail a task */
  failTask(taskId: string, error: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {return false;}
    task.error = error;

    if (task.attempts < task.maxAttempts) {
      // Retry on another node
      task.assignedNode = null;
      task.status = "pending";
      return this.scheduleTask(task);
    }

    task.status = "failed";
    this.archiveTask(task);
    return true;
  }

  /** Check for timed-out tasks and steal them */
  sweepTimeouts(): DistributedTask[] {
    const now = Date.now();
    const stolen: DistributedTask[] = [];

    for (const task of this.tasks.values()) {
      if (task.status === "assigned" && task.ackDeadline && now > task.ackDeadline) {
        task.status = "stolen";
        task.assignedNode = null;
        task.attempts++;
        if (task.attempts < task.maxAttempts) {
          this.scheduleTask(task);
        } else {
          task.status = "failed";
          task.error = "Max attempts exceeded after ACK timeout";
          this.archiveTask(task);
        }
        stolen.push(task);
      }
    }

    return stolen;
  }

  private archiveTask(task: DistributedTask): void {
    this.tasks.delete(task.id);
    this.taskHistory.push(task);
    if (this.taskHistory.length > MAX_TASK_HISTORY) {
      this.taskHistory.splice(0, this.taskHistory.length - MAX_TASK_HISTORY);
    }
  }

  /** Get scheduler diagnostics */
  get diagnostics() {
    const active = [...this.tasks.values()];
    return {
      activeTasks: active.length,
      pendingTasks: active.filter((t) => t.status === "pending").length,
      runningTasks: active.filter((t) => t.status === "running").length,
      assignedTasks: active.filter((t) => t.status === "assigned").length,
      completedTotal: this.taskHistory.filter((t) => t.status === "completed").length,
      failedTotal: this.taskHistory.filter((t) => t.status === "failed").length,
      activeNodes: this.nodeLoads.size,
      nodes: [...this.nodeLoads.values()].map((n) => ({
        nodeId: n.nodeId,
        activeTasks: n.activeTasks,
        cpuUsage: n.cpuUsage,
        lastSeen: new Date(n.lastSeen).toISOString(),
      })),
    };
  }
}

// ─── Delta Compression ──────────────────────────────────────────

/** Compute a delta between two state snapshots (JSON-diffable objects) */
export function computeDelta<T extends Record<string, unknown>>(
  prev: T,
  next: T,
): Record<string, unknown> {
  const delta: Record<string, unknown> = {};
  for (const key of Object.keys(next)) {
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
      delta[key] = next[key];
    }
  }
  return delta;
}

/** Apply a delta to a state snapshot */
export function applyDelta<T extends Record<string, unknown>>(
  state: T,
  delta: Record<string, unknown>,
): T {
  return { ...state, ...delta };
}
