/**
 * Application — Research Scheduler
 *
 * FIFO job queue for AI Scientist research experiments.
 */

import type { AIScientistConfig, ResearchJob, ResearchRequest } from "../domain/types.ts";
import { runResearch } from "../infrastructure/scientist-engine.ts";

const jobs = new Map<string, ResearchJob>();
let running = false;
let config: AIScientistConfig | null = null;
let nextId = 1;

export function initScheduler(cfg: AIScientistConfig): void {
  config = cfg;
}

export function submitJob(params: {
  citizenId: string;
  citizenName: string;
  request: ResearchRequest;
}): ResearchJob {
  const id = `ais-${Date.now()}-${nextId++}`;
  const job: ResearchJob = {
    id,
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    request: params.request,
    status: "queued",
    phase: "idea-generation",
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

function runJob(job: ResearchJob): void {
  if (!config) {
    return;
  }
  running = true;
  job.status = "running";
  job.phase = "idea-generation";
  job.progress = 10;

  runResearch(
    config,
    job.request,
    (paperPath) => {
      job.status = "completed";
      job.progress = 100;
      job.phase = "peer-review";
      job.paperPath = paperPath;
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

export function getJob(id: string): ResearchJob | undefined {
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
