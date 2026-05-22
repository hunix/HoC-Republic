/**
 * Application — Generation Scheduler
 *
 * FIFO job queue with single-GPU gating for Sparc3D 3D generation.
 */

import type { GenerationJob, GenerationRequest, Sparc3DConfig } from "../domain/types.ts";
import { generate3D } from "../infrastructure/sparc3d-engine.ts";

const jobs = new Map<string, GenerationJob>();
let running = false;
let config: Sparc3DConfig | null = null;
let nextId = 1;

export function initScheduler(cfg: Sparc3DConfig): void {
  config = cfg;
}

export function submitJob(params: {
  citizenId: string;
  citizenName: string;
  request: GenerationRequest;
}): GenerationJob {
  const id = `s3d-${Date.now()}-${nextId++}`;
  const job: GenerationJob = {
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

function runJob(job: GenerationJob): void {
  if (!config) {
    return;
  }
  running = true;
  job.status = "running";
  job.progress = 10;

  generate3D(
    config,
    job.request,
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

export function getJob(id: string): GenerationJob | undefined {
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
