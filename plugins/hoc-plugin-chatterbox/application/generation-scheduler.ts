/**
 * Application — Generation Scheduler
 *
 * Manages a queue of Chatterbox TTS generation jobs with GPU gating.
 * Only one generation runs at a time.
 */

import * as path from "node:path";
import type {
    ChatterboxConfig,
    ChatterboxModel, JobStatus, LanguageId, TTSJob
} from "../domain/types.ts";
import {
    generateSpeech,
    killProcess,
    type GenerationResult
} from "../infrastructure/chatterbox-engine.ts";

// ─── State ──────────────────────────────────────────────────────

const jobs = new Map<string, TTSJob>();
let activeJob: string | null = null;
let activeProcess: GenerationResult | null = null;
let config: ChatterboxConfig | null = null;
let nextId = 1;

// ─── Lifecycle ──────────────────────────────────────────────────

export function initScheduler(cfg: ChatterboxConfig): void {
  config = cfg;
}

// ─── Job Submission ─────────────────────────────────────────────

export function submitJob(params: {
  citizenId: string;
  citizenName: string;
  model?: ChatterboxModel;
  text: string;
  audioPromptPath?: string;
  languageId?: LanguageId;
  exaggeration?: number;
  cfgWeight?: number;
}): TTSJob {
  if (!config) {
    throw new Error("Scheduler not initialized");
  }

  const id = `tts-${Date.now()}-${nextId++}`;
  const model = params.model ?? config.defaultModel;

  const job: TTSJob = {
    id,
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    model,
    text: params.text,
    audioPromptPath: params.audioPromptPath,
    languageId: params.languageId ?? config.defaultLanguageId,
    exaggeration: params.exaggeration ?? config.defaultExaggeration,
    cfgWeight: params.cfgWeight ?? config.defaultCfgWeight,
    status: "queued",
    outputPath: path.join(config.outputDir, `${id}.wav`),
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

  activeProcess = generateSpeech(
    config,
    {
      model: job.model,
      text: job.text,
      audioPromptPath: job.audioPromptPath,
      languageId: job.languageId,
      exaggeration: job.exaggeration,
      cfgWeight: job.cfgWeight,
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

export function getJob(id: string): TTSJob | undefined {
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

export function getAllJobs(): TTSJob[] {
  return Array.from(jobs.values());
}

export function getJobsByStatus(status: JobStatus): TTSJob[] {
  return Array.from(jobs.values()).filter((j) => j.status === status);
}
