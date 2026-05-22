/**
 * Application — Simulation Scheduler
 *
 * Manages a queue of world generation jobs with GPU gating.
 * Only one generation runs at a time (very VRAM intensive).
 */

import type {
    CameraAction, SampleSolver, WorldConfig,
    WorldJob,
    WorldJobStatus,
    WorldResolution
} from "../domain/types.ts";
import { DEFAULT_FRAME_NUM, validateFrameCount } from "../domain/types.ts";
import {
    generateWorldVideo,
    killWorldProcess,
    type RunningWorldProcess
} from "../infrastructure/world-engine.ts";

// ─── State ──────────────────────────────────────────────────────

const jobs = new Map<string, WorldJob>();
const runningProcesses = new Map<string, RunningWorldProcess>();
let jobCounter = 0;
let activeJob: string | null = null;

// ─── Job Creation ───────────────────────────────────────────────

export function createWorldJob(
  citizenId: string,
  prompt: string,
  imagePath: string,
  opts?: {
    resolution?: WorldResolution;
    frameNum?: number;
    cameraAction?: CameraAction;
    seed?: number;
    solver?: SampleSolver;
  },
): WorldJob {
  const id = `world-${Date.now()}-${++jobCounter}`;

  const job: WorldJob = {
    id,
    citizenId,
    prompt,
    imagePath,
    resolution: opts?.resolution ?? "480*832",
    frameNum: validateFrameCount(opts?.frameNum ?? DEFAULT_FRAME_NUM),
    cameraAction: opts?.cameraAction,
    seed: opts?.seed ?? Math.floor(Math.random() * 2147483647),
    solver: opts?.solver ?? "unipc",
    status: "queued",
    createdAt: Date.now(),
  };

  jobs.set(id, job);
  return job;
}

// ─── Queue Processing ───────────────────────────────────────────

export function processQueue(config: WorldConfig): void {
  // Only one job at a time (heavy GPU usage)
  if (activeJob) {
    return;
  }

  const queued = Array.from(jobs.values()).filter((j) => j.status === "queued");
  queued.sort((a, b) => a.createdAt - b.createdAt);

  if (queued.length === 0) {
    return;
  }

  const job = queued[0];
  activeJob = job.id;
  job.status = "running";

  const running = generateWorldVideo(
    config,
    job.prompt,
    job.imagePath,
    job.resolution,
    job.frameNum,
    job.seed,
    job.solver,
    job.cameraAction,
    (line) => {
      job.progress = line;
    },
    (exitCode, outputFile) => {
      runningProcesses.delete(job.id);
      activeJob = null;

      if (exitCode === 0 && outputFile) {
        job.status = "completed";
        job.outputPath = outputFile;
        job.completedAt = Date.now();
      } else {
        job.status = "failed";
        job.error = `Generation failed (exit code ${exitCode})`;
      }

      // Process next job
      processQueue(config);
    },
  );

  runningProcesses.set(job.id, running);
}

// ─── Job Control ────────────────────────────────────────────────

export function cancelJob(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job) {
    return false;
  }

  if (job.status === "queued") {
    job.status = "cancelled";
    return true;
  }

  if (job.status === "running") {
    const proc = runningProcesses.get(jobId);
    if (proc) {
      killWorldProcess(proc);
      runningProcesses.delete(jobId);
    }
    job.status = "cancelled";
    if (activeJob === jobId) {
      activeJob = null;
    }
    return true;
  }

  return false;
}

export function getJob(jobId: string): WorldJob | undefined {
  return jobs.get(jobId);
}

export function listJobs(status?: WorldJobStatus): WorldJob[] {
  const all = Array.from(jobs.values());
  return status ? all.filter((j) => j.status === status) : all;
}

export function getQueueStatus(): {
  total: number;
  running: number;
  completed: number;
  failed: number;
} {
  const all = Array.from(jobs.values());
  return {
    total: all.length,
    running: all.filter((j) => j.status === "running").length,
    completed: all.filter((j) => j.status === "completed").length,
    failed: all.filter((j) => j.status === "failed").length,
  };
}
