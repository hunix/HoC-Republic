/**
 * Application — Render Scheduler
 *
 * FIFO job queue with single-GPU gating for EasyVolcap.
 */

import type { EasyVolcapConfig, RenderJob, RenderRequest } from "../domain/types.ts";
import { runEVC } from "../infrastructure/volcap-engine.ts";

const jobs = new Map<string, RenderJob>();
let running = false;
let config: EasyVolcapConfig | null = null;
let nextId = 1;

export function initScheduler(cfg: EasyVolcapConfig): void {
  config = cfg;
}

export function submitJob(params: {
  citizenId: string;
  citizenName: string;
  request: RenderRequest;
}): RenderJob {
  const id = `evc-${Date.now()}-${nextId++}`;
  const job: RenderJob = {
    id,
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    request: params.request,
    status: "queued",
    progress: 0,
    currentEpoch: 0,
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

function runJob(job: RenderJob): void {
  if (!config) {
    return;
  }
  running = true;
  job.status = job.request.taskType === "train" ? "training" : "rendering";
  job.progress = 5;

  runEVC(
    config,
    job.request,
    (outputDir) => {
      job.status = "completed";
      job.progress = 100;
      job.outputDir = outputDir;
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

export function getJob(id: string): RenderJob | undefined {
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
    running: all.filter(
      (j) => j.status === "training" || j.status === "rendering" || j.status === "exporting",
    ).length,
    completed: all.filter((j) => j.status === "completed").length,
    failed: all.filter((j) => j.status === "failed").length,
  };
}
