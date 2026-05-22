/**
 * Application — Avatar Scheduler
 *
 * FIFO job queue with single-GPU gating for StableAvatar video generation.
 */

import type { AvatarJob, AvatarRequest, StableAvatarConfig } from "../domain/types.ts";
import { generateAvatar } from "../infrastructure/avatar-engine.ts";

const jobs = new Map<string, AvatarJob>();
let running = false;
let config: StableAvatarConfig | null = null;
let nextId = 1;

export function initScheduler(cfg: StableAvatarConfig): void {
  config = cfg;
}

export function submitJob(params: {
  citizenId: string;
  citizenName: string;
  request: AvatarRequest;
}): AvatarJob {
  const id = `sav-${Date.now()}-${nextId++}`;
  const job: AvatarJob = {
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

function runJob(job: AvatarJob): void {
  if (!config) {
    return;
  }
  running = true;
  job.status = "running";
  job.progress = 10;

  generateAvatar(
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

export function getJob(id: string): AvatarJob | undefined {
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
