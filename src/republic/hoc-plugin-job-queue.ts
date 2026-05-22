/**
 * HoC Plugin Job Queue — Shared Async Job Management
 *
 * A single, reusable job queue that any plugin can use to manage
 * asynchronous work (audio generation, face swapping, agent runs, etc.).
 *
 * Replaces the per-plugin agent-scheduler.ts / job-scheduler.ts /
 * generation-scheduler.ts files that each reimplemented the same logic.
 *
 * Features:
 *   • Submit, cancel, list, and query job status
 *   • Per-plugin concurrency limits
 *   • Priority-based ordering (critical > high > normal > low)
 *   • Tick-driven processing (called from Republic tick loop)
 *   • Automatic timeout detection
 */

import type { BackendAdapter } from "./hoc-plugin-backends.js";
import type { HoCPluginLogger } from "./hoc-plugin-types.js";

// ─── Types ──────────────────────────────────────────────────────

export type JobPriority = "critical" | "high" | "normal" | "low";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface PluginJob {
  id: string;
  pluginId: string;
  status: JobStatus;
  progress: number;
  priority: JobPriority;
  command: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export interface QueueStats {
  totalJobs: number;
  queuedJobs: number;
  runningJobs: number;
  completedJobs: number;
  failedJobs: number;
  cancelledJobs: number;
  maxConcurrent: number;
}

export interface JobQueueConfig {
  maxConcurrent: number;
  timeoutMs: number;
}

const DEFAULT_QUEUE_CONFIG: JobQueueConfig = {
  maxConcurrent: 1,
  timeoutMs: 300_000,
};

const PRIORITY_ORDER: Record<JobPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// ─── Per-Plugin Queue Instance ──────────────────────────────────

/**
 * A job queue scoped to a single plugin.
 * Created by `createPluginJobQueue()` during plugin initialization.
 */
export class PluginJobQueue {
  private jobs = new Map<string, PluginJob>();
  private nextJobId = 1;
  private config: JobQueueConfig;

  constructor(
    private pluginId: string,
    private backend: BackendAdapter,
    private log: HoCPluginLogger,
    config?: Partial<JobQueueConfig>,
  ) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
  }

  // ─── Submit ─────────────────────────────────────────────────

  /**
   * Submit a new job to the queue.
   * Returns the created job object with status="queued".
   */
  submit(
    command: string,
    input: Record<string, unknown>,
    priority: JobPriority = "normal",
  ): PluginJob {
    const id = `${this.pluginId}-job-${this.nextJobId++}`;
    const job: PluginJob = {
      id,
      pluginId: this.pluginId,
      status: "queued",
      progress: 0,
      priority,
      command,
      input,
      createdAt: Date.now(),
    };
    this.jobs.set(id, job);
    this.log.info(`Job queued: ${id} (${command})`);
    return job;
  }

  // ─── Status ─────────────────────────────────────────────────

  /** Get a single job by ID. */
  getJob(jobId: string): PluginJob | undefined {
    return this.jobs.get(jobId);
  }

  /** List all jobs for this plugin, newest first. */
  listJobs(): PluginJob[] {
    return Array.from(this.jobs.values()).toSorted((a, b) => b.createdAt - a.createdAt);
  }

  /** Get aggregate queue stats. */
  getStats(): QueueStats {
    const all = Array.from(this.jobs.values());
    return {
      totalJobs: all.length,
      queuedJobs: all.filter((j) => j.status === "queued").length,
      runningJobs: all.filter((j) => j.status === "running").length,
      completedJobs: all.filter((j) => j.status === "completed").length,
      failedJobs: all.filter((j) => j.status === "failed").length,
      cancelledJobs: all.filter((j) => j.status === "cancelled").length,
      maxConcurrent: this.config.maxConcurrent,
    };
  }

  // ─── Cancel ─────────────────────────────────────────────────

  /** Cancel a queued job. Running jobs cannot be cancelled (they must finish). */
  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }
    if (job.status !== "queued") {
      return false;
    }

    job.status = "cancelled";
    job.completedAt = Date.now();
    this.log.info(`Job cancelled: ${jobId}`);
    return true;
  }

  // ─── Tick Processing ────────────────────────────────────────

  /**
   * Process the queue: start queued jobs up to the concurrency limit.
   * Called once per tick by the plugin manager or directly by the plugin.
   */
  tick(): void {
    const running = Array.from(this.jobs.values()).filter((j) => j.status === "running");

    // Check for timeouts on running jobs
    const now = Date.now();
    for (const job of running) {
      if (job.startedAt && now - job.startedAt > this.config.timeoutMs) {
        job.status = "failed";
        job.error = "Timed out";
        job.completedAt = now;
        this.log.warn(`Job timed out: ${job.id}`);
      }
    }

    // Count still-running jobs after timeout check
    const activeCount = Array.from(this.jobs.values()).filter((j) => j.status === "running").length;

    // Get queued jobs sorted by priority
    const queued = Array.from(this.jobs.values())
      .filter((j) => j.status === "queued")
      .toSorted((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

    // Start jobs up to concurrency limit
    const slotsAvailable = this.config.maxConcurrent - activeCount;
    for (let i = 0; i < Math.min(slotsAvailable, queued.length); i++) {
      this.startJob(queued[i]);
    }
  }

  // ─── Internal ───────────────────────────────────────────────

  private startJob(job: PluginJob): void {
    job.status = "running";
    job.startedAt = Date.now();
    this.log.info(`Job started: ${job.id} (${job.command})`);

    // Execute asynchronously via the backend adapter
    this.backend
      .execute(job.command, job.input)
      .then((result) => {
        job.status = "completed";
        job.progress = 100;
        job.output = result;
        job.completedAt = Date.now();
        this.log.info(`Job completed: ${job.id}`);
      })
      .catch((err: unknown) => {
        job.status = "failed";
        job.error = err instanceof Error ? err.message : String(err);
        job.completedAt = Date.now();
        this.log.error(`Job failed: ${job.id} — ${job.error}`);
      });
  }

  // ─── Cleanup ────────────────────────────────────────────────

  /** Remove completed/failed/cancelled jobs older than `maxAgeMs`. */
  cleanup(maxAgeMs: number = 3_600_000): number {
    const threshold = Date.now() - maxAgeMs;
    let removed = 0;
    for (const [id, job] of this.jobs) {
      if (
        (job.status === "completed" || job.status === "failed" || job.status === "cancelled") &&
        (job.completedAt ?? job.createdAt) < threshold
      ) {
        this.jobs.delete(id);
        removed++;
      }
    }
    return removed;
  }
}

// ─── Factory ────────────────────────────────────────────────────

/**
 * Create a job queue for a plugin.
 * Called by the declarative loader during plugin initialization.
 */
export function createPluginJobQueue(
  pluginId: string,
  backend: BackendAdapter,
  log: HoCPluginLogger,
  config?: Partial<JobQueueConfig>,
): PluginJobQueue {
  return new PluginJobQueue(pluginId, backend, log, config);
}

// ─── Global Registry ────────────────────────────────────────────

/** All active job queues keyed by plugin ID */
const activeQueues = new Map<string, PluginJobQueue>();

/** Register a queue (called by the declarative loader) */
export function registerQueue(pluginId: string, queue: PluginJobQueue): void {
  activeQueues.set(pluginId, queue);
}

/** Unregister a queue (called on plugin deactivation) */
export function unregisterQueue(pluginId: string): void {
  activeQueues.delete(pluginId);
}

/** Get a plugin's queue */
export function getQueue(pluginId: string): PluginJobQueue | undefined {
  return activeQueues.get(pluginId);
}

/** Tick all active queues — called from the Republic tick loop */
export function tickAllQueues(): void {
  for (const queue of activeQueues.values()) {
    queue.tick();
  }
}
