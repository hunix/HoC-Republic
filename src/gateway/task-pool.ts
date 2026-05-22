/**
 * HoC Parallel Execution Engine — Task Pool
 *
 * A lightweight worker thread pool using Node.js built-in worker_threads.
 * Zero external dependencies — same architecture as piscina but HoC-native.
 *
 * Features:
 * - Configurable pool size (defaults to CPU cores - 1)
 * - Task queuing with priority support
 * - Resource classification (cpu / gpu / io / network / mixed)
 * - Per-task timeout
 * - Graceful shutdown
 * - Task metrics (latency, throughput, errors)
 *
 * Usage:
 *   import { taskPool } from './task-pool.js';
 *   const result = await taskPool.run('myTask', { data: 42 }, { priority: 5, timeoutMs: 30_000 });
 */

import { Worker } from "node:worker_threads";
import { cpus } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TaskClass = "cpu" | "gpu" | "io" | "network" | "mixed";

export interface TaskOptions {
  /** 0 = highest, 10 = lowest. Default: 5 */
  priority?: number;
  /** Max ms before task is killed. Default: 30_000 */
  timeoutMs?: number;
  /** Resource classification for scheduling. Default: "cpu" */
  taskClass?: TaskClass;
  /** Transferable objects for zero-copy transfer */
  transfer?: readonly Transferable[];
}

interface QueuedTask {
  id: string;
  taskName: string;
  params: unknown;
  options: Required<TaskOptions>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  queuedAt: number;
}

interface WorkerSlot {
  worker: Worker;
  busy: boolean;
  currentTask: string | null;
  startedAt: number | null;
  completedTasks: number;
  errors: number;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface PoolMetrics {
  poolSize: number;
  activeTasks: number;
  queuedTasks: number;
  totalCompleted: number;
  totalErrors: number;
  totalTimeouts: number;
  avgLatencyMs: number;
  uptime: number;
  workerStats: Array<{
    id: number;
    busy: boolean;
    currentTask: string | null;
    completedTasks: number;
    errors: number;
  }>;
}

// ─── Task Pool ───────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
let _taskIdCounter = 0;

class TaskPool {
  private workers: WorkerSlot[] = [];
  private queue: QueuedTask[] = [];
  private started = false;
  private startedAt = 0;
  private totalCompleted = 0;
  private totalErrors = 0;
  private totalTimeouts = 0;
  private latencySum = 0;
  private readonly maxWorkers: number;

  constructor(maxWorkers?: number) {
    // Reserve 1 core for the main thread + OS
    this.maxWorkers = maxWorkers ?? Math.max(cpus().length - 1, 2);
  }

  /** Start the worker pool */
  start(): void {
    if (this.started) { return; }
    this.started = true;
    this.startedAt = Date.now();

    for (let i = 0; i < this.maxWorkers; i++) {
      this.spawnWorker();
    }

    console.info(
      `[task-pool] ✅ Started with ${this.maxWorkers} worker threads ` +
      `(${cpus().length} CPU cores detected)`,
    );
  }

  private spawnWorker(): void {
    const workerPath = resolve(__dirname, "task-worker.js");
    const worker = new Worker(workerPath);
    const slot: WorkerSlot = {
      worker,
      busy: false,
      currentTask: null,
      startedAt: null,
      completedTasks: 0,
      errors: 0,
    };

    worker.on("error", (err) => {
      console.error(`[task-pool] Worker error:`, err);
      slot.errors++;
      slot.busy = false;
      slot.currentTask = null;
      // Respawn crashed worker
      this.workers = this.workers.filter((w) => w !== slot);
      this.spawnWorker();
      this.processQueue();
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        console.warn(`[task-pool] Worker exited with code ${code}, respawning...`);
        this.workers = this.workers.filter((w) => w !== slot);
        if (this.started) {
          this.spawnWorker();
        }
      }
    });

    this.workers.push(slot);
  }

  /** Run a task on the worker pool */
  async run(taskName: string, params: unknown, options?: TaskOptions): Promise<unknown> {
    if (!this.started) { this.start(); }

    const opts: Required<TaskOptions> = {
      priority: options?.priority ?? 5,
      timeoutMs: options?.timeoutMs ?? 30_000,
      taskClass: options?.taskClass ?? "cpu",
      transfer: options?.transfer ?? [],
    };

    const id = `task_${++_taskIdCounter}`;

    return new Promise((res, rej) => {
      const task: QueuedTask = {
        id,
        taskName,
        params,
        options: opts,
        resolve: res,
        reject: rej,
        queuedAt: Date.now(),
      };

      // Insert into priority queue (lower number = higher priority)
      const insertIdx = this.queue.findIndex((t) => t.options.priority > opts.priority);
      if (insertIdx === -1) {
        this.queue.push(task);
      } else {
        this.queue.splice(insertIdx, 0, task);
      }

      this.processQueue();
    });
  }

  private processQueue(): void {
    while (this.queue.length > 0) {
      const freeSlot = this.workers.find((w) => !w.busy);
      if (!freeSlot) { break; }

      const task = this.queue.shift()!;
      this.dispatch(freeSlot, task);
    }
  }

  private dispatch(slot: WorkerSlot, task: QueuedTask): void {
    slot.busy = true;
    slot.currentTask = task.taskName;
    slot.startedAt = Date.now();

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      this.totalTimeouts++;
      slot.busy = false;
      slot.currentTask = null;
      task.reject(new Error(`Task ${task.taskName} timed out after ${task.options.timeoutMs}ms`));
      // Terminate and respawn the stuck worker
      slot.worker.terminate().catch(() => {});
      this.workers = this.workers.filter((w) => w !== slot);
      this.spawnWorker();
      this.processQueue();
    }, task.options.timeoutMs);
    timer.unref?.();

    // Send task to worker
    const messageHandler = (msg: { type: string; result?: unknown; error?: string }) => {
      if (timedOut) { return; }
      clearTimeout(timer);
      slot.worker.removeListener("message", messageHandler);

      slot.busy = false;
      slot.currentTask = null;
      const elapsed = Date.now() - (slot.startedAt ?? Date.now());
      this.latencySum += elapsed;

      if (msg.type === "result") {
        slot.completedTasks++;
        this.totalCompleted++;
        task.resolve(msg.result);
      } else {
        slot.errors++;
        this.totalErrors++;
        task.reject(new Error(msg.error ?? "Unknown worker error"));
      }

      this.processQueue();
    };

    slot.worker.on("message", messageHandler);
    slot.worker.postMessage(
      { type: "run", id: task.id, taskName: task.taskName, params: task.params },
      task.options.transfer as unknown as import("node:worker_threads").TransferListItem[],
    );
  }

  /** Get pool metrics */
  getMetrics(): PoolMetrics {
    const activeTasks = this.workers.filter((w) => w.busy).length;
    const totalOps = this.totalCompleted + this.totalErrors;
    return {
      poolSize: this.workers.length,
      activeTasks,
      queuedTasks: this.queue.length,
      totalCompleted: this.totalCompleted,
      totalErrors: this.totalErrors,
      totalTimeouts: this.totalTimeouts,
      avgLatencyMs: totalOps > 0 ? Math.round(this.latencySum / totalOps) : 0,
      uptime: this.started ? Date.now() - this.startedAt : 0,
      workerStats: this.workers.map((w, i) => ({
        id: i,
        busy: w.busy,
        currentTask: w.currentTask,
        completedTasks: w.completedTasks,
        errors: w.errors,
      })),
    };
  }

  /** Gracefully shut down the pool */
  async shutdown(): Promise<void> {
    this.started = false;
    // Reject all queued tasks
    for (const task of this.queue) {
      task.reject(new Error("Task pool shutting down"));
    }
    this.queue = [];
    // Terminate all workers
    await Promise.allSettled(this.workers.map((w) => w.worker.terminate()));
    this.workers = [];
    console.info("[task-pool] 🛑 Shutdown complete");
  }
}

/** Singleton task pool instance */
export const taskPool = new TaskPool();
