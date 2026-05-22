/**
 * Application — Generation Scheduler
 *
 * Manages a queue of GLM-Image generation jobs with GPU gating.
 * Only one generation runs at a time (very VRAM intensive — 80GB+).
 */

import * as path from "node:path";
import type { GenerationMode, GlmImageConfig, GlmImageJob, JobStatus } from "../domain/types.ts";
import { validateDimensions } from "../domain/types.ts";
import { generateImage, killProcess, type GenerationResult } from "../infrastructure/glm-engine.ts";

// ─── State ──────────────────────────────────────────────────────

const jobs = new Map<string, GlmImageJob>();
let activeJob: string | null = null;
let activeProcess: GenerationResult | null = null;
let config: GlmImageConfig | null = null;
let nextId = 1;

// ─── Lifecycle ──────────────────────────────────────────────────

export function initScheduler(cfg: GlmImageConfig): void {
  config = cfg;
}

// ─── Job Submission ─────────────────────────────────────────────

export function submitJob(params: {
  citizenId: string;
  citizenName: string;
  mode: GenerationMode;
  prompt: string;
  inputImages?: string[];
  width?: number;
  height?: number;
  seed?: number;
  steps?: number;
  guidanceScale?: number;
}): GlmImageJob {
  if (!config) {
    throw new Error("Scheduler not initialized");
  }

  const w = params.width ?? config.defaultWidth;
  const h = params.height ?? config.defaultHeight;

  if (!validateDimensions(w, h)) {
    throw new Error(`Dimensions must be divisible by 32, got ${w}x${h}`);
  }

  const id = `glm-${Date.now()}-${nextId++}`;
  const seed = params.seed ?? Math.floor(Math.random() * 2_147_483_647);

  const job: GlmImageJob = {
    id,
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    mode: params.mode,
    prompt: params.prompt,
    inputImages: params.inputImages ?? [],
    width: w,
    height: h,
    seed,
    numInferenceSteps: params.steps ?? config.defaultSteps,
    guidanceScale: params.guidanceScale ?? config.defaultGuidanceScale,
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
      steps: job.numInferenceSteps,
      guidanceScale: job.guidanceScale,
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
      drainQueue(); // chain to next
    },
  );
}

// ─── Job Management ─────────────────────────────────────────────

export function getJob(id: string): GlmImageJob | undefined {
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

export function getAllJobs(): GlmImageJob[] {
  return Array.from(jobs.values());
}

export function getJobsByStatus(status: JobStatus): GlmImageJob[] {
  return Array.from(jobs.values()).filter((j) => j.status === status);
}
