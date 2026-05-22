/**
 * Republic Worker Pool — Offload CPU-bound tick work to worker threads
 *
 * Uses `node:worker_threads` to run CPU-intensive domain ticks
 * on a pool of workers, freeing the main thread for I/O operations.
 *
 * Architecture:
 * - Main thread serializes the relevant state slice
 * - Worker receives state + tick function name
 * - Worker runs the tick and returns state patches
 * - Main thread applies patches back to state
 *
 * Falls back to main-thread execution if worker pool is unavailable.
 */

import { cpus } from "node:os";
import { join } from "node:path";
import { isMainThread, Worker } from "node:worker_threads";

// ─── Configuration ──────────────────────────────────────────────

const DEFAULT_POOL_SIZE = Math.max(2, Math.min(cpus().length - 1, 4));
const WORKER_TIMEOUT_MS = 5_000;

// ─── Types ──────────────────────────────────────────────────────

export interface WorkerTask<T = unknown> {
  id: string;
  fn: string;
  data: T;
}

export interface WorkerResult<T = unknown> {
  id: string;
  ok: boolean;
  data?: T;
  error?: string;
  durationMs: number;
}

interface PooledWorker {
  worker: Worker;
  busy: boolean;
  taskCount: number;
}

// ─── Worker Pool ────────────────────────────────────────────────

/**
 * A fixed-size pool of worker threads.
 *
 * Workers are lazily spawned and reused across tasks.
 * If all workers are busy, tasks are queued.
 */
export class WorkerPool {
  private workers: PooledWorker[] = [];
  private queue: Array<{
    task: WorkerTask;
    resolve: (result: WorkerResult) => void;
    reject: (err: Error) => void;
  }> = [];
  private readonly poolSize: number;
  private readonly workerScript: string;
  private _totalTasks = 0;
  private _totalTimeMs = 0;
  private _errors = 0;
  private _initialized = false;

  constructor(workerScript?: string, poolSize?: number) {
    this.poolSize = poolSize ?? DEFAULT_POOL_SIZE;
    this.workerScript = workerScript ?? join(import.meta.dirname ?? __dirname, "tick-worker.js");
  }

  /**
   * Initialize the pool by spawning worker threads.
   * Safe to call multiple times — idempotent.
   */
  init(): void {
    if (!isMainThread || this._initialized) {return;}

    for (let i = 0; i < this.poolSize; i++) {
      try {
        const worker = new Worker(this.workerScript);
        this.workers.push({ worker, busy: false, taskCount: 0 });
      } catch {
        // Worker creation failed — will fall back to main-thread execution
        break;
      }
    }

    this._initialized = true;
  }

  /**
   * Execute a task on a worker thread.
   * Returns a promise that resolves with the worker result.
   */
  execute<T>(task: WorkerTask): Promise<WorkerResult<T>> {
    if (!this._initialized || this.workers.length === 0) {
      // Fallback: run on main thread (no workers available)
      return Promise.resolve({
        id: task.id,
        ok: false,
        error: "Worker pool not available — running on main thread",
        durationMs: 0,
      });
    }

    return new Promise((resolve, reject) => {
      const idle = this.workers.find((w) => !w.busy);
      if (idle) {
        this._dispatch(idle, task, resolve as (r: WorkerResult) => void, reject);
      } else {
        this.queue.push({ task, resolve: resolve as (r: WorkerResult) => void, reject });
      }
    });
  }

  private _dispatch(
    pooled: PooledWorker,
    task: WorkerTask,
    resolve: (result: WorkerResult) => void,
    reject: (err: Error) => void,
  ): void {
    pooled.busy = true;
    pooled.taskCount++;
    this._totalTasks++;

    const start = performance.now();
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        pooled.busy = false;
        this._errors++;
        resolve({
          id: task.id,
          ok: false,
          error: `Worker timeout after ${WORKER_TIMEOUT_MS}ms`,
          durationMs: WORKER_TIMEOUT_MS,
        });
        this._processQueue();
      }
    }, WORKER_TIMEOUT_MS);

    const onMessage = (result: WorkerResult) => {
      if (settled) {return;}
      settled = true;
      clearTimeout(timeout);
      pooled.busy = false;

      const durationMs = performance.now() - start;
      this._totalTimeMs += durationMs;
      if (!result.ok) {this._errors++;}

      resolve({ ...result, durationMs });
      this._processQueue();
    };

    const onError = (err: Error) => {
      if (settled) {return;}
      settled = true;
      clearTimeout(timeout);
      pooled.busy = false;
      this._errors++;

      reject(err);
      this._processQueue();
    };

    pooled.worker.once("message", onMessage);
    pooled.worker.once("error", onError);
    pooled.worker.postMessage(task);
  }

  private _processQueue(): void {
    if (this.queue.length === 0) {return;}
    const idle = this.workers.find((w) => !w.busy);
    if (!idle) {return;}
    const next = this.queue.shift()!;
    this._dispatch(idle, next.task, next.resolve, next.reject);
  }

  /** Gracefully shut down all workers. */
  async shutdown(): Promise<void> {
    const terminations = this.workers.map((w) => w.worker.terminate());
    await Promise.allSettled(terminations);
    this.workers = [];
    this._initialized = false;
  }

  /** Check if the pool is available (has workers). */
  get available(): boolean {
    return this._initialized && this.workers.length > 0;
  }

  /** Pool diagnostics. */
  diagnostics() {
    return {
      poolSize: this.poolSize,
      activeWorkers: this.workers.length,
      busyWorkers: this.workers.filter((w) => w.busy).length,
      queuedTasks: this.queue.length,
      totalTasks: this._totalTasks,
      totalTimeMs: Math.round(this._totalTimeMs),
      errors: this._errors,
      avgTaskMs:
        this._totalTasks > 0 ? Math.round(this._totalTimeMs / this._totalTasks) : 0,
    };
  }
}

// ─── CPU-Bound Tick Categories ──────────────────────────────────

/**
 * Domain ticks classified by their computational profile.
 *
 * CPU-bound ticks are candidates for worker thread offloading:
 * - genetics, evolution, genome: heavy computation, pure state transforms
 * - reasoning/reflection: complex data processing
 *
 * IO-bound ticks must run on main thread:
 * - agent, compute, n8n: external API calls
 * - network-dependent operations
 */
export const CPU_BOUND_TICKS = new Set([
  "genome",
  "evolution",
  "quantum",
  "ml",
  "swarm",
  "temporal",
  "ai-fusion",
  "curiosity",
  "research",
]);

export const IO_BOUND_TICKS = new Set([
  "population",
  "economy",
  "governance",
  "grid",
  "education",
  "economy-engine",
  "autonomous-study",
  "process-manager",
  "executive",
  "agency",
  "self-replication",
  "diplomacy",
  "orchestrator",
  "culture",
  "judicial",
  "foreign-relations",
  "media",
  "n8n",
  "forge",
]);

// ─── Singleton Pool ─────────────────────────────────────────────

let _pool: WorkerPool | null = null;

/**
 * Get the global worker pool singleton.
 * Creates and initializes on first access.
 */
export function getWorkerPool(): WorkerPool {
  if (!_pool) {
    _pool = new WorkerPool();
    _pool.init();
  }
  return _pool;
}

/**
 * Shut down the global worker pool.
 */
export async function shutdownWorkerPool(): Promise<void> {
  if (_pool) {
    await _pool.shutdown();
    _pool = null;
  }
}
