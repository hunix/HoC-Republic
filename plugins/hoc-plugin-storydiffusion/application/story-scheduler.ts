/**
 * Application — Story Scheduler
 *
 * FIFO job queue with single-GPU gating for StoryDiffusion.
 * Only one story generation runs at a time due to VRAM requirements.
 */

import type { JobStatus, StoryDiffusionConfig, StoryJob, StoryRequest } from "../domain/types.ts";
import { generateStory } from "../infrastructure/storydiffusion-engine.ts";

// ─── State ──────────────────────────────────────────────────────

const jobs = new Map<string, StoryJob>();
let running = false;
let config: StoryDiffusionConfig | null = null;
let nextId = 1;

// ─── Lifecycle ──────────────────────────────────────────────────

export function initScheduler(cfg: StoryDiffusionConfig): void {
  config = cfg;
}

// ─── Job Submission ─────────────────────────────────────────────

export function submitJob(params: {
  citizenId: string;
  citizenName: string;
  request: StoryRequest;
}): StoryJob {
  const id = `story-${Date.now()}-${nextId++}`;
  const job: StoryJob = {
    id,
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    request: params.request,
    status: "queued",
    progress: 0,
    outputPaths: [],
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

function runJob(job: StoryJob): void {
  if (!config) {
    return;
  }
  running = true;
  job.status = "running";
  job.progress = 10;

  generateStory(
    config,
    job.request,
    (outputPaths, videoPath) => {
      job.status = "completed";
      job.progress = 100;
      job.outputPaths = outputPaths;
      job.videoPath = videoPath;
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

export function getJob(id: string): StoryJob | undefined {
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

export function getAllJobs(): StoryJob[] {
  return Array.from(jobs.values());
}

export function getJobsByStatus(status: JobStatus): StoryJob[] {
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
