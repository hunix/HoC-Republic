/**
 * Application — Evolution Scheduler
 *
 * FIFO job queue for DGM evolution runs.
 */

import type { DGMConfig, EvolutionJob, EvolutionRequest } from "../domain/types.ts";
import { runEvolution } from "../infrastructure/dgm-engine.ts";

const jobs = new Map<string, EvolutionJob>();
let running = false;
let config: DGMConfig | null = null;
let nextId = 1;

export function initScheduler(cfg: DGMConfig): void {
  config = cfg;
}

export function submitJob(params: {
  citizenId: string;
  citizenName: string;
  request: EvolutionRequest;
}): EvolutionJob {
  const id = `dgm-${Date.now()}-${nextId++}`;
  const job: EvolutionJob = {
    id,
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    request: params.request,
    status: "queued",
    phase: "initializing",
    progress: 0,
    currentGeneration: 0,
    bestScore: 0,
    improvements: [],
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

function runJob(job: EvolutionJob): void {
  if (!config) {
    return;
  }
  running = true;
  job.status = "running";
  job.phase = "self-analysis";
  job.progress = 5;

  runEvolution(
    config,
    job.request,
    (_outputDir) => {
      job.status = "completed";
      job.progress = 100;
      job.phase = "completed";
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

export function getJob(id: string): EvolutionJob | undefined {
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
