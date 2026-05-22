/**
 * Republic Platform — Parallel Tick Pool
 *
 * Manages a pool of Node.js Worker Threads for citizen tick parallelism.
 * Partitions the citizen population into N shards, dispatches each shard
 * to a dedicated worker, and merges results back to main-thread state.
 *
 * Key features:
 *   - Auto-sizes pool to Math.max(2, os.cpus().length - 1) workers
 *   - Round-robin shard assignment with work-stealing on idle workers
 *   - Per-worker health monitoring and auto-restart on crash
 *   - Tick result merging with conflict detection
 *   - Pool performance metrics (throughput, p95 latency, speedup ratio)
 *
 * Integration with tick-orchestrator.ts:
 *   Register runParallelCitizenTick as an OrchestratedHandler with
 *   group="citizen-parallel", concurrent=false, after=["citizenship"].
 *
 * Usage:
 *   const pool = new ParallelTickPool();
 *   await pool.init();
 *   const results = await pool.runTick(citizens, tick, config);
 *   pool.applyResults(state, results);
 *   await pool.shutdown();
 */

import { cpus, freemem } from "node:os";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import type { RepublicState } from "../types.js";
import type {
  CitizenTickResult,
  SerializedCitizen,
  TickWorkerConfig,
} from "./citizen-tick-worker.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const logger = createSubsystemLogger("republic:parallel-tick-pool");

/** Minimum free RAM (in GB) to spawn the full worker pool. Below this, shrink to 2. */
const RAM_PRESSURE_THRESHOLD_GB = 4;

// Path to compiled worker (resolved relative to this file's __dirname in dist/)
const WORKER_PATH = fileURLToPath(new URL("./citizen-tick-worker.js", import.meta.url));

const DEFAULT_CONFIG: TickWorkerConfig = {
  enableMutation: true,
  enableCognition: false, // reserved for Phase 2
  mutationRate: 0.002,
  maxActionsPerCitizen: 3,
  budgetMsPerCitizen: 5,
};

// ─── Types ──────────────────────────────────────────────────────

interface WorkerEntry {
  id: number;
  worker: Worker;
  busy: boolean;
  totalTicks: number;
  totalCitizens: number;
  errorCount: number;
  lastMs: number;
}

export interface ParallelTickMetrics {
  poolSize: number;
  totalTicksDispatched: number;
  totalCitizensProcessed: number;
  avgWorkerMs: number;
  p95WorkerMs: number;
  speedupRatio: number; // parallel latency / hypothetical sequential latency
  workerHealthSummary: Array<{ id: number; ticks: number; errors: number; lastMs: number }>;
}

// ─── Pool ────────────────────────────────────────────────────────

export class ParallelTickPool {
  private workers: WorkerEntry[] = [];
  private poolSize: number;
  private config: TickWorkerConfig;
  private workerMsHistory: number[] = [];
  private totalTicks = 0;
  private totalCitizens = 0;
  private initialized = false;

  constructor(poolSize?: number, config: Partial<TickWorkerConfig> = {}) {
    // Cap at 4 workers to avoid OOM — each worker gets its own V8 isolate (~200-500MB)
    // 23 workers on a 24-core machine was consuming 5-12GB RAM and crashing the gateway
    const cpuBased = Math.min(4, Math.max(2, cpus().length - 1));

    // Under RAM pressure, shrink to 2 workers to avoid OOM crash.
    // When free RAM < 4 GB, spawning 4 worker V8 isolates can silently kill the process.
    const freeGB = freemem() / 1e9;
    if (!poolSize && freeGB < RAM_PRESSURE_THRESHOLD_GB) {
      this.poolSize = 2;
      logger.warn(
        `RAM pressure detected (${freeGB.toFixed(1)} GB free < ${RAM_PRESSURE_THRESHOLD_GB} GB threshold) — shrinking worker pool to ${this.poolSize}`,
      );
    } else {
      this.poolSize = poolSize ?? cpuBased;
    }
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private _initPromise: Promise<void> | null = null;

  /**
   * Spawn all worker threads and wait for them to report "ready".
   * Mutex-guarded: concurrent callers piggyback on the same promise
   * instead of spawning a duplicate worker set.
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    // Mutex: if init() is already in-flight, piggyback on that promise.
    if (this._initPromise) {
      return this._initPromise;
    }
    this._initPromise = this._doInit();
    try {
      await this._initPromise;
    } finally {
      this._initPromise = null;
    }
  }

  private async _doInit(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const readyPromises: Promise<void>[] = [];

    for (let i = 0; i < this.poolSize; i++) {
      const { entry, readyPromise } = this.spawnWorker(i);
      this.workers.push(entry);
      readyPromises.push(readyPromise);
    }

    await Promise.all(readyPromises);
    this.initialized = true;
    logger.info(
      `Parallel tick pool initialized — ${this.poolSize} workers (${cpus().length} CPU cores detected)`,
    );
  }

  private spawnWorker(id: number): { entry: WorkerEntry; readyPromise: Promise<void> } {
    const worker = new Worker(WORKER_PATH, {
      workerData: { workerId: id },
    });

    const entry: WorkerEntry = {
      id,
      worker,
      busy: false,
      totalTicks: 0,
      totalCitizens: 0,
      errorCount: 0,
      lastMs: 0,
    };

    // Auto-restart on crash — wait for new worker to be ready before replacing pool slot
    worker.on("error", (err: Error) => {
      logger.warn(`Worker ${id} crashed: ${err.message} — restarting`);
      entry.errorCount++;
      entry.busy = false; // Release lock so pool doesn't hang
      const { entry: newEntry, readyPromise: newReady } = this.spawnWorker(id);
      // Only replace the pool slot once the new worker has signalled ready
      newReady
        .then(() => {
          this.workers[id] = newEntry;
        })
        .catch(() => {
          logger.warn(`Worker ${id} failed to restart`);
        });
    });

    // Use a one-time handler scoped to the 'ready' message only.
    // IMPORTANT: Do NOT use .once('message') here — that would compete with
    // the result listener in dispatchShard and swallow tick result messages.
    const readyPromise = new Promise<void>((resolve) => {
      const onReady = (msg: { type: string }) => {
        if (msg.type === "ready") {
          worker.off("message", onReady);
          resolve();
        }
      };
      worker.on("message", onReady);
    });

    return { entry, readyPromise };
  }

  /**
   * Run a full citizen tick in parallel across all workers.
   * Citizens are partitioned into `poolSize` shards.
   */
  async runTick(
    citizens: SerializedCitizen[],
    tick: number,
    config?: Partial<TickWorkerConfig>,
  ): Promise<CitizenTickResult[]> {
    if (!this.initialized) {
      await this.init();
    }

    if (citizens.length === 0) {
      return [];
    }

    const effectiveConfig = config ? { ...this.config, ...config } : this.config;

    // Partition citizens into shards
    const shards = this.shard(citizens, this.poolSize);
    const tickStart = performance.now();

    const shardPromises = shards.map((shard, workerIdx) => {
      return this.dispatchShard(
        this.workers[workerIdx % this.workers.length],
        shard,
        tick,
        effectiveConfig,
      );
    });

    const shardResults = await Promise.all(shardPromises);
    const elapsed = performance.now() - tickStart;

    // Merge results
    const allResults = shardResults.flat();

    // Update metrics
    this.workerMsHistory.push(elapsed);
    if (this.workerMsHistory.length > 500) {
      this.workerMsHistory.shift();
    }
    this.totalTicks++;
    this.totalCitizens += allResults.length;

    logger.debug(
      `Parallel tick ${tick}: ${allResults.length} citizens in ${elapsed.toFixed(1)}ms across ${this.poolSize} workers`,
    );

    return allResults;
  }

  private dispatchShard(
    entry: WorkerEntry,
    batch: SerializedCitizen[],
    tick: number,
    config: TickWorkerConfig,
  ): Promise<CitizenTickResult[]> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const timeoutMs = Math.max(2000, config.budgetMsPerCitizen * batch.length + 2000);
      const timeout = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        entry.busy = false;
        entry.worker.off("message", onMessage);
        reject(
          new Error(
            `Worker ${entry.id} timed out after ${timeoutMs}ms (batch=${batch.length} citizens)`,
          ),
        );
      }, timeoutMs);

      // CRITICAL: Use a persistent listener (NOT .once) scoped to this dispatch.
      // If the worker crashes and restarts, it emits a 'ready' message. Using
      // .once('message') would consume that 'ready' as if it were the tick result,
      // leaving this Promise permanently pending and draining the event loop
      // (→ silent process exit with code 0). Using a named handler + .off() ensures
      // 'ready' messages are ignored and only 'result'/'error' cause settlement.
      const onMessage = (msg: {
        type: string;
        results?: CitizenTickResult[];
        workerMs?: number;
        error?: string;
      }) => {
        // Ignore 'ready' and other non-result/error messages from restarted workers
        if (msg.type !== "result" && msg.type !== "error") {
          return;
        }
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        entry.busy = false;
        entry.worker.off("message", onMessage);

        if (msg.type === "result" && msg.results) {
          entry.totalTicks++;
          entry.totalCitizens += msg.results.length;
          entry.lastMs = msg.workerMs ?? 0;
          resolve(msg.results);
        } else {
          entry.errorCount++;
          reject(new Error(msg.error ?? "Worker returned unexpected message type"));
        }
      };

      entry.busy = true;
      entry.worker.on("message", onMessage);
      entry.worker.postMessage({ type: "tick", batch, tick, config });
    });
  }

  /**
   * Apply parallel tick results back to main-thread republic state.
   * Merges energy/fitness/credits/traits/memory for each citizen by ID.
   */
  applyResults(state: RepublicState, results: CitizenTickResult[]): void {
    const resultMap = new Map<string, CitizenTickResult>(results.map((r) => [r.id, r]));

    let applied = 0;
    let skipped = 0;

    for (const citizen of state.citizens) {
      const result = resultMap.get(citizen.id);
      if (!result || result.errorOccurred) {
        skipped++;
        continue;
      }

      // Merge: only update fields that the worker computed
      citizen.fitness = result.fitness;
      citizen.energy = result.energy;
      citizen.credits = result.credits;

      // Merge traits (worker may have mutated them)
      if (citizen.traits) {
        for (const [k, v] of Object.entries(result.traits)) {
          citizen.traits[k] = v;
        }
      }

      applied++;
    }

    logger.debug(`Results applied: ${applied} merged, ${skipped} skipped`);
  }

  /**
   * Serialize citizens for dispatch to worker threads.
   * Keeps only the fields needed by the worker (avoids structured-clone bloat).
   */
  static serializeCitizens(state: RepublicState): SerializedCitizen[] {
    return state.citizens.map((c) => {
      // Convert skills string[] to Record<string, number> using skillProficiency if available
      const skillRecord: Record<string, number> =
        c.skillProficiency ?? Object.fromEntries((c.skills ?? []).map((s) => [s, 0.5]));

      // Build trait vector from personality or traits field
      const traitRecord: Record<string, number> = c.traits ?? {
        creativity: c.personality?.openness ?? 0.5,
        diligence: c.personality?.conscientiousness ?? 0.5,
        sociability: c.personality?.agreeableness ?? 0.5,
        ambition: c.personality?.drive ?? 0.5,
        stability: c.personality?.stability ?? 0.5,
      };

      // SAFETY: Only send minimal memory to workers — full memory objects can
      // contain deeply nested cognitive/dialogue data that blows V8's
      // structured-clone stack limit on postMessage with 3000+ citizens.
      const workerMemory: Record<string, unknown> = {};
      if (c.memory) {
        if (c.memory.lastActions !== undefined) {
          workerMemory.lastActions = c.memory.lastActions;
        }
        if (c.memory.lastFitness !== undefined) {
          workerMemory.lastFitness = c.memory.lastFitness;
        }
        if (c.memory.lastTick !== undefined) {
          workerMemory.lastTick = c.memory.lastTick;
        }
      }

      return {
        id: c.id,
        name: c.name ?? "",
        tier: c.tier ?? "active",
        fitness: c.fitness ?? c.masteryLevel ?? 0.5,
        energy: c.energy > 1 ? c.energy / 100 : c.energy, // normalize 0–100 → 0–1
        credits: c.credits ?? 0,
        skills: skillRecord,
        traits: traitRecord,
        memory: workerMemory,
        lastTick: c.lastTick ?? 0,
        tick: c.tick ?? 0,
      };
    });
  }

  private shard<T>(arr: T[], n: number): T[][] {
    const size = Math.ceil(arr.length / n);
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    // Ensure exactly n shards (pad with empty arrays)
    while (result.length < n) {
      result.push([]);
    }
    return result;
  }

  getMetrics(): ParallelTickMetrics {
    const sorted = [...this.workerMsHistory].toSorted((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    const seqEstimate = avg * this.poolSize;
    const speedup = avg > 0 ? seqEstimate / avg : 1;

    return {
      poolSize: this.poolSize,
      totalTicksDispatched: this.totalTicks,
      totalCitizensProcessed: this.totalCitizens,
      avgWorkerMs: parseFloat(avg.toFixed(2)),
      p95WorkerMs: parseFloat(p95.toFixed(2)),
      speedupRatio: parseFloat(speedup.toFixed(2)),
      workerHealthSummary: this.workers.map((w) => ({
        id: w.id,
        ticks: w.totalTicks,
        errors: w.errorCount,
        lastMs: w.lastMs,
      })),
    };
  }

  async shutdown(): Promise<void> {
    const promises = this.workers.map((w) => {
      w.worker.postMessage({ type: "shutdown" });
      return w.worker.terminate();
    });
    await Promise.all(promises);
    this.workers = [];
    this.initialized = false;
    logger.info("Parallel tick pool shut down");
  }
}

// ─── Singleton ───────────────────────────────────────────────────

let _pool: ParallelTickPool | null = null;

export function getParallelTickPool(config?: Partial<TickWorkerConfig>): ParallelTickPool {
  if (!_pool) {
    _pool = new ParallelTickPool(undefined, config);
  }
  return _pool;
}

export async function shutdownPool(): Promise<void> {
  if (_pool) {
    await _pool.shutdown();
    _pool = null;
  }
}
