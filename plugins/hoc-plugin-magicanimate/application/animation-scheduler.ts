/**
 * Application — Animation Scheduler
 *
 * FIFO job queue with single-GPU gating for MagicAnimate.
 * Only one animation runs at a time due to VRAM requirements (~12GB).
 */

import type {
    AnimationJob,
    AnimationRequest, JobStatus, MagicAnimateConfig
} from "../domain/types.ts";
import { generateAnimation } from "../infrastructure/magicanimate-engine.ts";

// ─── State ──────────────────────────────────────────────────────

const jobs = new Map<string, AnimationJob>();
let running = false;
let config: MagicAnimateConfig | null = null;
let nextId = 1;

// ─── Lifecycle ──────────────────────────────────────────────────

export function initScheduler(cfg: MagicAnimateConfig): void {
  config = cfg;
}

// ─── Job Submission ─────────────────────────────────────────────

export function submitJob(params: {
  citizenId: string;
  citizenName: string;
  request: AnimationRequest;
}): AnimationJob {
  const id = `anim-${Date.now()}-${nextId++}`;
  const job: AnimationJob = {
    id,
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    request: params.request,
    status: "queued",
    progress: 0,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  drainQueue();
  return job;
}

function drainQueue(): void {
  if (running || !config) {
    return;
  }
  const next = Array.from(jobs.values()).find((j) => j.status === "queued");
  if (!next) {
    return;
  }
  runJob(next);
}

function runJob(job: AnimationJob): void {
  if (!config) {
    return;
  }
  running = true;
  job.status = "running";
  job.progress = 10;

  generateAnimation(
    config,
    job.request,
    (pct) => {
      job.progress = pct;
    },
    (outputPath) => {
      job.status = "completed";
      job.progress = 100;
      job.outputPath = outputPath;
      job.completedAt = Date.now();
      running = false;
      drainQueue();
    },
    (err) => {
      job.status = "failed";
      job.error = err;
      job.completedAt = Date.now();
      running = false;
      drainQueue();
    },
  );
}

// ─── Job Management ─────────────────────────────────────────────

export function getJob(id: string): AnimationJob | undefined {
  return jobs.get(id);
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job || job.status !== "queued") {
    return false;
  }
  job.status = "cancelled";
  job.completedAt = Date.now();
  return true;
}

export function getAllJobs(): AnimationJob[] {
  return Array.from(jobs.values());
}

export function getJobsByStatus(status: JobStatus): AnimationJob[] {
  return Array.from(jobs.values()).filter((j) => j.status === status);
}

export function getQueueStatus(): {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
} {
  const all = Array.from(jobs.values());
  return {
    total: all.length,
    queued: all.filter((j) => j.status === "queued").length,
    running: all.filter((j) => j.status === "running").length,
    completed: all.filter((j) => j.status === "completed").length,
    failed: all.filter((j) => j.status === "failed").length,
  };
}
