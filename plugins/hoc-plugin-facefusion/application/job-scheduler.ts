/**
 * Application — Job Scheduler
 *
 * Managed job queue that prevents server overwhelm.
 * Serializes GPU-heavy FaceFusion jobs with concurrency control,
 * priority ordering, and GPU gating.
 */

import type {
    FaceFusionConfig, FaceJob,
    FaceProcessor, JobPriority,
    JobStatus
} from "../domain/types.ts";
import type { RunningJob } from "../infrastructure/facefusion-cli.ts";
import * as cli from "../infrastructure/facefusion-cli.ts";
import { canAcceptJob } from "../infrastructure/gpu-monitor.ts";

// ─── Queue State ────────────────────────────────────────────────

const jobQueue: FaceJob[] = [];
const activeJobs: Map<string, RunningJob> = new Map();
let config: FaceFusionConfig | null = null;
let logger: {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  debug?: (msg: string) => void;
} | null = null;

// ─── Priority Ordering ─────────────────────────────────────────

const PRIORITY_RANK: Record<JobPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// ─── Init ───────────────────────────────────────────────────────

export function initScheduler(cfg: FaceFusionConfig, log: typeof logger): void {
  config = cfg;
  logger = log;
}

// ─── Job Submission ─────────────────────────────────────────────

/**
 * Submit a new face manipulation job.
 * Creates a FaceFusion job through the CLI and adds it to the managed queue.
 */
export function submitJob(params: {
  citizenId: string;
  citizenName: string;
  processor: FaceProcessor;
  sourceFile: string;
  outputFile: string;
  targetFile?: string;
  priority?: JobPriority;
  options?: Record<string, unknown>;
}): FaceJob | null {
  if (!config) {
    return null;
  }

  const jobId = `ff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Create job in FaceFusion
  const created = cli.createJob(config, jobId);
  if (!created) {
    logger?.warn(`Failed to create FaceFusion job: ${jobId}`);
    return null;
  }

  // Add processing step
  const stepped = cli.addStep(
    config,
    jobId,
    params.processor,
    params.sourceFile,
    params.outputFile,
    params.targetFile,
    params.options,
  );

  if (!stepped) {
    logger?.warn(`Failed to add step to job: ${jobId}`);
    cli.deleteJob(config, jobId);
    return null;
  }

  // Submit to FaceFusion queue
  const submitted = cli.submitJob(config, jobId);
  if (!submitted) {
    logger?.warn(`Failed to submit job: ${jobId}`);
    cli.deleteJob(config, jobId);
    return null;
  }

  const job: FaceJob = {
    id: jobId,
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    status: "queued",
    steps: [{ processor: params.processor, args: params.options ?? {} }],
    sourceFile: params.sourceFile,
    targetFile: params.targetFile,
    outputFile: params.outputFile,
    priority: params.priority ?? "normal",
    createdAt: Date.now(),
    progress: 0,
    ffJobId: jobId,
  };

  jobQueue.push(job);
  sortQueue();

  logger?.info(`Job ${jobId} queued for ${params.citizenName}: ${params.processor}`);
  return job;
}

// ─── Queue Processing (called on tick) ──────────────────────────

/**
 * Process the queue — start eligible jobs if capacity allows.
 * Called on every `tick:before` event.
 */
export function processQueue(): void {
  if (!config) {
    return;
  }

  // Clean up completed/failed active jobs
  for (const [jobId, running] of activeJobs) {
    const elapsed = Date.now() - running.startedAt;
    if (elapsed > config.jobTimeoutMs) {
      logger?.warn(`Job ${jobId} timed out after ${Math.round(elapsed / 1000)}s — killing`);
      cli.killJob(running);
      activeJobs.delete(jobId);
      markJob(jobId, "failed", "Job timeout exceeded");
    }
  }

  // Start new jobs if capacity allows
  while (activeJobs.size < config.maxConcurrentJobs) {
    const nextJob = getNextEligibleJob();
    if (!nextJob) {
      break;
    }

    // GPU gating
    if (!canAcceptJob()) {
      logger?.debug?.("GPU busy — deferring job start");
      break;
    }

    startJob(nextJob);
  }
}

// ─── Internal ───────────────────────────────────────────────────

function startJob(job: FaceJob): void {
  if (!config) {
    return;
  }

  logger?.info(`Starting job ${job.id}: ${job.steps.map((s) => s.processor).join(", ")}`);
  job.status = "processing";
  job.startedAt = Date.now();

  const running = cli.runJobAsync(
    config,
    job.id,
    // Progress callback
    (line) => {
      // Parse progress from FaceFusion output (e.g. "Processing: 45%")
      const match = line.match(/(\d+)%/);
      if (match) {
        job.progress = parseInt(match[1], 10);
      }
      logger?.debug?.(` [${job.id}] ${line}`);
    },
    // Completion callback
    (exitCode) => {
      activeJobs.delete(job.id);
      if (exitCode === 0) {
        markJob(job.id, "completed");
        logger?.info(`Job ${job.id} completed successfully`);
      } else {
        markJob(job.id, "failed", `Exit code: ${exitCode}`);
        logger?.warn(`Job ${job.id} failed with exit code ${exitCode}`);
      }
    },
  );

  activeJobs.set(job.id, running);
}

function getNextEligibleJob(): FaceJob | undefined {
  return jobQueue.find((j) => j.status === "queued");
}

function sortQueue(): void {
  jobQueue.sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 2;
    const pb = PRIORITY_RANK[b.priority] ?? 2;
    if (pa !== pb) {
      return pa - pb;
    }
    return a.createdAt - b.createdAt;
  });
}

function markJob(jobId: string, status: JobStatus, error?: string): void {
  const job = jobQueue.find((j) => j.id === jobId);
  if (job) {
    job.status = status;
    job.completedAt = Date.now();
    if (error) {
      job.error = error;
    }
    if (status === "completed") {
      job.progress = 100;
    }
  }
}

// ─── Query API ──────────────────────────────────────────────────

export function getJob(jobId: string): FaceJob | undefined {
  return jobQueue.find((j) => j.id === jobId);
}

export function getAllJobs(): FaceJob[] {
  return [...jobQueue];
}

export function getJobsByStatus(status: JobStatus): FaceJob[] {
  return jobQueue.filter((j) => j.status === status);
}

export function getActiveCount(): number {
  return activeJobs.size;
}

export function getQueuedCount(): number {
  return jobQueue.filter((j) => j.status === "queued").length;
}

/**
 * Cancel a queued or processing job.
 */
export function cancelJob(jobId: string): boolean {
  const job = jobQueue.find((j) => j.id === jobId);
  if (!job) {
    return false;
  }

  if (job.status === "processing") {
    const running = activeJobs.get(jobId);
    if (running) {
      cli.killJob(running);
      activeJobs.delete(jobId);
    }
  }

  if (job.status === "queued" || job.status === "processing") {
    job.status = "failed";
    job.error = "Cancelled by user";
    job.completedAt = Date.now();

    if (config) {
      cli.deleteJob(config, jobId);
    }
    return true;
  }

  return false;
}

/**
 * Clean up old completed/failed jobs.
 */
export function cleanupOldJobs(maxAgeMs = 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;

  for (let i = jobQueue.length - 1; i >= 0; i--) {
    const j = jobQueue[i];
    if (
      (j.status === "completed" || j.status === "failed") &&
      j.completedAt &&
      j.completedAt < cutoff
    ) {
      jobQueue.splice(i, 1);
      removed++;
    }
  }

  return removed;
}
