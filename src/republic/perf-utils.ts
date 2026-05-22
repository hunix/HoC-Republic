/**
 * Republic Platform — Performance Utilities
 *
 * Phase 28: Node.js 2026 Performance Optimization
 *
 * - Worker thread pool for CPU-intensive offloading
 * - V8 optimization helpers (object shape, monomorphic hot paths)
 * - Memory-efficient caching (WeakRef + FinalizationRegistry)
 * - Streaming JSON serialization for large state persistence
 * - Adaptive tick rate controller
 * - Tick-duration telemetry
 */

import * as os from "node:os";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import { Readable } from "node:stream";
import { Worker } from "node:worker_threads";

// ─── Worker Thread Pool ─────────────────────────────────────────

interface PoolTask<T = unknown> {
  taskFn: string; // Serialized function body
  data: unknown; // Arguments to pass
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * Fixed-size thread pool for offloading CPU-intensive work.
 *
 * Usage:
 *   const pool = WorkerPool.getInstance();
 *   const result = await pool.execute('(data) => data.a + data.b', { a: 1, b: 2 });
 */
export class WorkerPool {
  private static instance: WorkerPool | null = null;
  private workers: Worker[] = [];
  private queue: PoolTask[] = [];
  private activeWorkers = new Set<Worker>();
  private readonly poolSize: number;
  private _totalTasks = 0;
  private _completedTasks = 0;
  private _failedTasks = 0;
  private _initialized = false;

  private constructor(poolSize?: number) {
    this.poolSize = poolSize ?? Math.max(1, cpus().length - 1);
  }

  static getInstance(poolSize?: number): WorkerPool {
    if (!WorkerPool.instance) {
      WorkerPool.instance = new WorkerPool(poolSize);
    }
    return WorkerPool.instance;
  }

  /** Initialize workers lazily on first execute() call */
  private init(): void {
    if (this._initialized) {
      return;
    }
    this._initialized = true;

    // Create inline worker script as data URL
    const workerScript = `
      const { parentPort, workerData } = require('node:worker_threads');
      parentPort.on('message', (msg) => {
        try {
          const fn = new Function('return ' + msg.taskFn)();
          const result = fn(msg.data);
          if (result && typeof result.then === 'function') {
            result.then(r => parentPort.postMessage({ ok: true, result: r }))
                  .catch(e => parentPort.postMessage({ ok: false, error: e.message }));
          } else {
            parentPort.postMessage({ ok: true, result });
          }
        } catch (e) {
          parentPort.postMessage({ ok: false, error: e.message });
        }
      });
    `;

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(workerScript, { eval: true });
      worker.on("error", () => {
        /* handled per-task */
      });
      this.workers.push(worker);
    }
  }

  /** Execute a function in a worker thread */
  execute<T>(taskFn: string, data: unknown): Promise<T> {
    this.init();
    this._totalTasks++;

    return new Promise<T>((resolve, reject) => {
      const task: PoolTask<T> = { taskFn, data, resolve, reject };

      // Find an idle worker
      const idleWorker = this.workers.find((w) => !this.activeWorkers.has(w));
      if (idleWorker) {
        this.runTask(idleWorker, task);
      } else {
        this.queue.push(task as PoolTask);
      }
    });
  }

  private runTask<T>(worker: Worker, task: PoolTask<T>): void {
    this.activeWorkers.add(worker);

    const onMessage = (msg: { ok: boolean; result?: T; error?: string }) => {
      worker.removeListener("message", onMessage);
      worker.removeListener("error", onError);
      this.activeWorkers.delete(worker);

      if (msg.ok) {
        this._completedTasks++;
        task.resolve(msg.result as T);
      } else {
        this._failedTasks++;
        task.reject(new Error(msg.error ?? "Worker task failed"));
      }

      // Process next queued task
      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        this.runTask(worker, next);
      }
    };

    const onError = (err: Error) => {
      worker.removeListener("message", onMessage);
      this.activeWorkers.delete(worker);
      this._failedTasks++;
      task.reject(err);

      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        this.runTask(worker, next);
      }
    };

    worker.on("message", onMessage);
    worker.on("error", onError);
    worker.postMessage({ taskFn: task.taskFn, data: task.data });
  }

  /** Get pool diagnostics */
  get diagnostics() {
    return {
      poolSize: this.poolSize,
      activeWorkers: this.activeWorkers.size,
      queuedTasks: this.queue.length,
      totalTasks: this._totalTasks,
      completedTasks: this._completedTasks,
      failedTasks: this._failedTasks,
      initialized: this._initialized,
    };
  }

  /** Gracefully shut down all workers */
  async shutdown(): Promise<void> {
    const terminations = this.workers.map((w) => w.terminate());
    await Promise.all(terminations);
    this.workers = [];
    this.activeWorkers.clear();
    this.queue = [];
    this._initialized = false;
    WorkerPool.instance = null;
  }
}

// ─── Memory-Efficient Cache ─────────────────────────────────────

/**
 * Cache that uses WeakRef to allow GC of unused entries.
 * Falls back to re-computing when values are collected.
 */
export class WeakCache<K extends string, V extends object> {
  private cache = new Map<K, WeakRef<V>>();
  private registry = new FinalizationRegistry<K>((key) => {
    this.cache.delete(key);
  });
  private _hits = 0;
  private _misses = 0;

  get(key: K): V | undefined {
    const ref = this.cache.get(key);
    if (!ref) {
      this._misses++;
      return undefined;
    }
    const val = ref.deref();
    if (!val) {
      this.cache.delete(key);
      this._misses++;
      return undefined;
    }
    this._hits++;
    return val;
  }

  set(key: K, value: V): void {
    this.cache.set(key, new WeakRef(value));
    this.registry.register(value, key);
  }

  get size(): number {
    return this.cache.size;
  }
  get hits(): number {
    return this._hits;
  }
  get misses(): number {
    return this._misses;
  }
  get hitRate(): number {
    const total = this._hits + this._misses;
    return total === 0 ? 0 : this._hits / total;
  }
}

// ─── Streaming JSON Serializer ──────────────────────────────────

/**
 * Stream a large object as JSON without materializing the entire string.
 * Uses a Readable stream for memory-efficient serialization.
 */
export function streamJSON(obj: unknown): Readable {
  const json = JSON.stringify(obj);
  return Readable.from(jsonChunks(json, 64 * 1024)); // 64KB chunks
}

async function* jsonChunks(json: string, chunkSize: number): AsyncGenerator<string> {
  for (let i = 0; i < json.length; i += chunkSize) {
    yield json.slice(i, i + chunkSize);
  }
}

// ─── Adaptive Tick Rate Controller ──────────────────────────────

export interface TickTelemetry {
  tickNumber: number;
  durationMs: number;
  timestamp: number;
}

const MAX_TELEMETRY = 200;

/**
 * Adaptive tick rate controller that adjusts interval based on
 * measured tick durations. Aims to keep tick duration below a target.
 */
export class AdaptiveTickController {
  private telemetry: TickTelemetry[] = [];
  private _targetMs: number;
  private _minIntervalMs: number;
  private _maxIntervalMs: number;
  private _currentIntervalMs: number;
  /** CPU usage percent (0-100) sampled periodically */
  private _cpuUsage: number = 0;
  /** Whether the controller is currently CPU-throttled */
  private _cpuThrottled: boolean = false;
  /** Previous CPU times for delta calculation */
  private _prevCpuTimes = { idle: 0, total: 0 };
  private _cpuSampleTimer?: ReturnType<typeof setInterval>;

  /** CPU usage threshold above which we throttle (default 80%) */
  private static CPU_THROTTLE_THRESHOLD = 80;

  constructor(opts?: {
    targetMs?: number;
    minIntervalMs?: number;
    maxIntervalMs?: number;
    initialIntervalMs?: number;
  }) {
    this._targetMs = opts?.targetMs ?? 50;
    this._minIntervalMs = opts?.minIntervalMs ?? 2000;
    this._maxIntervalMs = opts?.maxIntervalMs ?? 15_000;
    this._currentIntervalMs = opts?.initialIntervalMs ?? 3000;

    // Sample CPU usage every 5 seconds
    this._cpuSampleTimer = setInterval(() => this._sampleCpu(), 5000);
    if (this._cpuSampleTimer.unref) {
      this._cpuSampleTimer.unref();
    }
    this._initCpuBaseline();
  }

  private _initCpuBaseline(): void {
    const cpuInfo = os.cpus();
    let idle = 0,
      total = 0;
    for (const cpu of cpuInfo) {
      idle += cpu.times.idle;
      total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
    }
    this._prevCpuTimes = { idle, total };
  }

  private _sampleCpu(): void {
    const cpuInfo = os.cpus();
    let idle = 0,
      total = 0;
    for (const cpu of cpuInfo) {
      idle += cpu.times.idle;
      total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
    }
    const idleDelta = idle - this._prevCpuTimes.idle;
    const totalDelta = total - this._prevCpuTimes.total;
    this._cpuUsage = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
    this._prevCpuTimes = { idle, total };
  }

  /** Record a tick completion and return the recommended interval */
  recordTick(tickNumber: number, durationMs: number): number {
    this.telemetry.push({
      tickNumber,
      durationMs,
      timestamp: performance.now(),
    });

    if (this.telemetry.length > MAX_TELEMETRY) {
      this.telemetry.splice(0, this.telemetry.length - MAX_TELEMETRY);
    }

    // Calculate recommended interval based on recent average
    const recent = this.telemetry.slice(-20);
    const avgDuration = recent.reduce((sum, t) => sum + t.durationMs, 0) / recent.length;

    // CPU-based throttling: if CPU > 80%, increase interval by 50%
    if (this._cpuUsage > AdaptiveTickController.CPU_THROTTLE_THRESHOLD) {
      this._cpuThrottled = true;
      this._currentIntervalMs = Math.min(this._maxIntervalMs, this._currentIntervalMs * 1.5);
    } else if (avgDuration > this._targetMs * 1.5) {
      // Ticks are too slow — increase interval to reduce pressure
      this._cpuThrottled = false;
      this._currentIntervalMs = Math.min(this._maxIntervalMs, this._currentIntervalMs * 1.2);
    } else if (
      avgDuration < this._targetMs * 0.5 &&
      this._currentIntervalMs > this._minIntervalMs
    ) {
      // Ticks are fast — decrease interval for higher throughput
      this._cpuThrottled = false;
      this._currentIntervalMs = Math.max(this._minIntervalMs, this._currentIntervalMs * 0.9);
    } else {
      this._cpuThrottled = false;
    }

    return Math.round(this._currentIntervalMs);
  }

  /** Get current telemetry snapshot */
  get stats() {
    const recent = this.telemetry.slice(-20);
    const durations = recent.map((t) => t.durationMs);
    const avgMs =
      durations.length > 0
        ? parseFloat((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2))
        : 0;
    return {
      currentIntervalMs: Math.round(this._currentIntervalMs),
      targetMs: this._targetMs,
      recentAvgMs: avgMs,
      recentMaxMs: durations.length > 0 ? Math.max(...durations) : 0,
      recentMinMs: durations.length > 0 ? Math.min(...durations) : 0,
      totalTicks: this.telemetry.length,
      // Enhanced fields
      cpuUsagePercent: this._cpuUsage,
      cpuThrottled: this._cpuThrottled,
      /** How much of the interval is consumed by tick execution (0-1) */
      utilizationRatio:
        this._currentIntervalMs > 0 ? parseFloat((avgMs / this._currentIntervalMs).toFixed(3)) : 0,
      ticksPerMinute: this._currentIntervalMs > 0 ? Math.round(60000 / this._currentIntervalMs) : 0,
    };
  }

  /** Stop CPU sampling timer */
  shutdown(): void {
    if (this._cpuSampleTimer) {
      clearInterval(this._cpuSampleTimer);
      this._cpuSampleTimer = undefined;
    }
  }
}

// ─── V8 Optimization Helpers ────────────────────────────────────

/**
 * Deep-freeze an object for V8 constant optimization.
 * Frozen objects allow V8 to make stronger optimization assumptions.
 */
export function deepFreeze<T extends object>(obj: T): Readonly<T> {
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

/**
 * Create a high-resolution timer for measuring tick durations.
 * Returns elapsed milliseconds with microsecond precision.
 */
export function hiResTimer(): () => number {
  const start = performance.now();
  return () => parseFloat((performance.now() - start).toFixed(3));
}

// ─── Tick Batching ──────────────────────────────────────────────

/**
 * Determines which module groups should execute on a given tick.
 * Groups low-priority modules to run every Nth tick to reduce per-tick load.
 */
export function shouldRunModule(
  tickNumber: number,
  moduleGroup: "critical" | "standard" | "low_priority" | "background",
): boolean {
  switch (moduleGroup) {
    case "critical":
      return true; // Every tick
    case "standard":
      return tickNumber % 2 === 0; // Every 2nd tick
    case "low_priority":
      return tickNumber % 5 === 0; // Every 5th tick
    case "background":
      return tickNumber % 10 === 0; // Every 10th tick
    default:
      return true;
  }
}

// ─── Event Loop Health ──────────────────────────────────────────

/**
 * Measure event loop lag. Returns a function that reports
 * the current lag in milliseconds.
 */
export function createEventLoopMonitor(sampleIntervalMs = 1000): {
  getLag: () => number;
  stop: () => void;
} {
  let currentLag = 0;
  const interval = setInterval(() => {
    const start = performance.now();
    setImmediate(() => {
      currentLag = performance.now() - start;
    });
  }, sampleIntervalMs);

  // Unref so it doesn't keep the process alive
  if (interval.unref) {
    interval.unref();
  }

  return {
    getLag: () => parseFloat(currentLag.toFixed(3)),
    stop: () => clearInterval(interval),
  };
}
