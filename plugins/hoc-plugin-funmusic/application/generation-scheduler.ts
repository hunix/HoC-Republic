/**
 * Application — Generation Scheduler
 *
 * Manages a queue of InspireMusic generation jobs with GPU gating.
 * Only one generation runs at a time.
 */

import * as path from "node:path";
import type {
    ChorusMode, InspireMusicConfig, JobStatus, MusicJob, MusicTask, OutputFormat
} from "../domain/types.ts";
import {
    generateMusic,
    killProcess,
    type GenerationResult
} from "../infrastructure/inspiremusic-engine.ts";

// ─── State ──────────────────────────────────────────────────────

const jobs = new Map<string, MusicJob>();
let activeJob: string | null = null;
let activeProcess: GenerationResult | null = null;
let config: InspireMusicConfig | null = null;
let nextId = 1;

// ─── Lifecycle ──────────────────────────────────────────────────

export function initScheduler(cfg: InspireMusicConfig): void {
  config = cfg;
}

// ─── Job Submission ─────────────────────────────────────────────

export function submitJob(params: {
  citizenId: string;
  citizenName: string;
  task: MusicTask;
  prompt: string;
  audioPromptPath?: string;
  chorusMode?: ChorusMode;
  startTime?: number;
  endTime?: number;
  fast?: boolean;
  outputFormat?: OutputFormat;
}): MusicJob {
  if (!config) {
    throw new Error("Scheduler not initialized");
  }

  const id = `music-${Date.now()}-${nextId++}`;
  const fmt = params.outputFormat ?? config.defaultOutputFormat;

  const job: MusicJob = {
    id,
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    task: params.task,
    prompt: params.prompt,
    audioPromptPath: params.audioPromptPath,
    chorusMode: params.chorusMode ?? config.defaultChorusMode,
    startTime: params.startTime ?? config.defaultStartTime,
    endTime: params.endTime ?? config.defaultEndTime,
    fast: params.fast ?? config.defaultFast,
    outputFormat: fmt,
    status: "queued",
    outputPath: path.join(config.outputDir, `${id}.${fmt}`),
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

  activeProcess = generateMusic(
    config,
    {
      task: job.task,
      prompt: job.prompt,
      audioPromptPath: job.audioPromptPath,
      chorusMode: job.chorusMode,
      startTime: job.startTime,
      endTime: job.endTime,
      fast: job.fast,
      outputFormat: job.outputFormat,
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

export function getJob(id: string): MusicJob | undefined {
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

export function getAllJobs(): MusicJob[] {
  return Array.from(jobs.values());
}

export function getJobsByStatus(status: JobStatus): MusicJob[] {
  return Array.from(jobs.values()).filter((j) => j.status === status);
}
