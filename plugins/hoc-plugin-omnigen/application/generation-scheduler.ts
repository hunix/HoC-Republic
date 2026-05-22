/**
 * Application — Generation Scheduler
 *
 * Manages a queue of OmniGen generation jobs with GPU gating.
 * Only one generation runs at a time.
 */

import * as path from "node:path";
import type { JobStatus, OmniGenConfig, OmniGenJob, OmniGenMode } from "../domain/types.ts";
import {
    generateImage,
    killProcess,
    type GenerationResult
} from "../infrastructure/omnigen-engine.ts";

// ─── State ──────────────────────────────────────────────────────

const jobs = new Map<string, OmniGenJob>();
let activeJob: string | null = null;
let activeProcess: GenerationResult | null = null;
let config: OmniGenConfig | null = null;
let nextId = 1;

// ─── Lifecycle ──────────────────────────────────────────────────

export function initScheduler(cfg: OmniGenConfig): void {
  config = cfg;
}

// ─── Job Submission ─────────────────────────────────────────────

export function submitJob(params: {
  citizenId: string;
  citizenName: string;
  mode: OmniGenMode;
  prompt: string;
  inputImages?: string[];
  width?: number;
  height?: number;
  seed?: number;
  guidanceScale?: number;
  imgGuidanceScale?: number;
  offloadModel?: boolean;
}): OmniGenJob {
  if (!config) {
    throw new Error("Scheduler not initialized");
  }

  const id = `omni-${Date.now()}-${nextId++}`;
  const seed = params.seed ?? Math.floor(Math.random() * 2_147_483_647);

  const job: OmniGenJob = {
    id,
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    mode: params.mode,
    prompt: params.prompt,
    inputImages: params.inputImages ?? [],
    width: params.width ?? config.defaultWidth,
    height: params.height ?? config.defaultHeight,
    seed,
    guidanceScale: params.guidanceScale ?? config.defaultGuidanceScale,
    imgGuidanceScale: params.imgGuidanceScale ?? config.defaultImgGuidanceScale,
    offloadModel: params.offloadModel ?? config.offloadModel,
    status: "queued",
    outputPath: path.join(config.outputDir, `${id}.png`),
    createdAt: Date.now(),
  };

  jobs.set(id, job);
  drainQueue();
  return job;
}

// ─── Queue Processing ───────────────────────────────────────────

function drainQueue(): void {
  if (!config || activeJob) {
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
  job.startedAt = Date.now();

  activeProcess = generateImage(
    config,
    {
      mode: job.mode,
      prompt: job.prompt,
      inputImages: job.inputImages,
      width: job.width,
      height: job.height,
      seed: job.seed,
      guidanceScale: job.guidanceScale,
      imgGuidanceScale: job.imgGuidanceScale,
      offloadModel: job.offloadModel,
      outputPath: job.outputPath,
    },
    undefined,
    (exitCode) => {
      job.completedAt = Date.now();
      job.status = exitCode === 0 ? "completed" : "failed";
      if (exitCode !== 0) {
        job.error = `Process exited with code ${exitCode}`;
      }
      activeJob = null;
      activeProcess = null;
      drainQueue();
    },
  );
}

// ─── Job Management ─────────────────────────────────────────────

export function getJob(id: string): OmniGenJob | undefined {
  return jobs.get(id);
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) {
    return false;
  }

  if (job.status === "queued") {
    job.status = "cancelled";
    return true;
  }
  if (job.status === "running" && activeProcess) {
    killProcess(activeProcess);
    job.status = "cancelled";
    job.completedAt = Date.now();
    activeJob = null;
    activeProcess = null;
    drainQueue();
    return true;
  }
  return false;
}

export function getQueuedCount(): number {
  return Array.from(jobs.values()).filter((j) => j.status === "queued").length;
}

export function getRunningCount(): number {
  return activeJob ? 1 : 0;
}

export function getAllJobs(): OmniGenJob[] {
  return Array.from(jobs.values());
}

export function getJobsByStatus(status: JobStatus): OmniGenJob[] {
  return Array.from(jobs.values()).filter((j) => j.status === status);
}
