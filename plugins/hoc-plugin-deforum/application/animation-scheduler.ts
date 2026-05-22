/**
 * Application — Animation Scheduler
 *
 * FIFO job queue with single-GPU gating for Deforum animations.
 */

import type { AnimationJob, AnimationRequest, DeforumConfig } from "../domain/types.ts";
import { generateAnimation } from "../infrastructure/deforum-engine.ts";

const jobs = new Map<string, AnimationJob>();
let running = false;
let config: DeforumConfig | null = null;
let nextId = 1;

export function initScheduler(cfg: DeforumConfig): void {
  config = cfg;
}

export function submitJob(params: {
  citizenId: string;
  citizenName: string;
  request: AnimationRequest;
}): AnimationJob {
  const id = `dfm-${Date.now()}-${nextId++}`;
  const job: AnimationJob = {
    id,
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    request: params.request,
    status: "queued",
    progress: 0,
    currentFrame: 0,
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
    (videoPath) => {
      job.status = "completed";
      job.progress = 100;
      job.outputVideoPath = videoPath;
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
