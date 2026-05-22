/**
 * Application — Task Scheduler
 *
 * FIFO job queue for Magentic-One multi-agent tasks.
 * Only one task runs at a time (agents share resources).
 */

import type { MagenticConfig, TaskJob, TaskRequest } from "../domain/types.ts";
import { executeTask } from "../infrastructure/magentic-engine.ts";

const jobs = new Map<string, TaskJob>();
let running = false;
let config: MagenticConfig | null = null;
let nextId = 1;

export function initScheduler(cfg: MagenticConfig): void {
  config = cfg;
}

export function submitJob(params: {
  citizenId: string;
  citizenName: string;
  request: TaskRequest;
}): TaskJob {
  const id = `m1-${Date.now()}-${nextId++}`;
  const job: TaskJob = {
    id,
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    request: params.request,
    status: "queued",
    currentRound: 0,
    activeAgent: "orchestrator",
    messages: [],
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

function runJob(job: TaskJob): void {
  if (!config) {
    return;
  }
  running = true;
  job.status = "running";

  executeTask(
    config,
    job.request,
    (answer) => {
      job.status = "completed";
      job.finalAnswer = answer;
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

export function getJob(id: string): TaskJob | undefined {
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
