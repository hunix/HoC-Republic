/**
 * Application — Synthesis Scheduler
 *
 * Manages a queue of TTS jobs with GPU gating and concurrency control.
 * Uses FaceFusion's shared GPU monitor when available.
 */

import * as path from "node:path";
import type { TtsConfig, TtsJob, TtsJobStatus, TtsLanguage, TtsMode } from "../domain/types.ts";
import {
    killTtsProcess, synthesizeCustomVoice, synthesizeVoiceClone, synthesizeVoiceDesign, type RunningTtsProcess
} from "../infrastructure/tts-engine.ts";

// ─── State ──────────────────────────────────────────────────────

const jobs = new Map<string, TtsJob>();
const activeProcesses = new Map<string, RunningTtsProcess>();
let jobCounter = 0;

// ─── GPU Sharing (soft import from FaceFusion) ──────────────────

let canAcceptGpuJob: () => boolean = () => true;

try {
  const gpuMod = require("../../hoc-plugin-facefusion/infrastructure/gpu-monitor.js");
  if (typeof gpuMod.canAcceptJob === "function") {
    canAcceptGpuJob = gpuMod.canAcceptJob;
  }
} catch {
  // FaceFusion not present; always allow
}

// ─── Job Creation ───────────────────────────────────────────────

export function createTtsJob(
  citizenId: string,
  mode: TtsMode,
  text: string,
  language: TtsLanguage,
  opts?: {
    speaker?: string;
    instruct?: string;
    refAudioPath?: string;
    refText?: string;
  },
): TtsJob {
  const id = `tts-${Date.now()}-${++jobCounter}`;

  const job: TtsJob = {
    id,
    citizenId,
    mode,
    text,
    language,
    status: "queued",
    progress: 0,
    speaker: opts?.speaker,
    instruct: opts?.instruct,
    refAudioPath: opts?.refAudioPath,
    refText: opts?.refText,
    createdAt: Date.now(),
  };

  jobs.set(id, job);
  return job;
}

// ─── Job Execution ──────────────────────────────────────────────

function runningCount(): number {
  return Array.from(jobs.values()).filter((j) => j.status === "running").length;
}

export function processQueue(config: TtsConfig): void {
  if (runningCount() >= config.maxConcurrentJobs) {
    return;
  }
  if (!canAcceptGpuJob()) {
    return;
  }

  // Find next queued job (FIFO)
  const queued = Array.from(jobs.values()).find((j) => j.status === "queued");
  if (!queued) {
    return;
  }

  executeJob(config, queued);
}

function executeJob(config: TtsConfig, job: TtsJob): void {
  job.status = "running";
  job.progress = 10;

  const outputPath = path.join(config.outputDir, `${job.id}.wav`);

  const onProgress = (line: string) => {
    if (line.includes("OUTPUT:")) {
      job.progress = 90;
    }
  };

  const onComplete = (exitCode: number, outputFile: string | null) => {
    activeProcesses.delete(job.id);

    if (exitCode === 0 && outputFile) {
      job.status = "completed";
      job.progress = 100;
      job.outputPath = outputFile;
      job.completedAt = Date.now();
    } else {
      job.status = "failed";
      job.error = `Synthesis failed (exit code ${exitCode})`;
    }
  };

  let proc: RunningTtsProcess;

  switch (job.mode) {
    case "custom_voice":
      proc = synthesizeCustomVoice(
        config,
        job.text,
        job.language,
        job.speaker ?? "Ryan",
        outputPath,
        job.instruct,
        onProgress,
        onComplete,
      );
      break;

    case "voice_design":
      proc = synthesizeVoiceDesign(
        config,
        job.text,
        job.language,
        job.instruct ?? "",
        outputPath,
        onProgress,
        onComplete,
      );
      break;

    case "voice_clone":
      proc = synthesizeVoiceClone(
        config,
        job.text,
        job.language,
        job.refAudioPath ?? "",
        job.refText ?? "",
        outputPath,
        onProgress,
        onComplete,
      );
      break;
  }

  activeProcesses.set(job.id, proc);
}

// ─── Job Control ────────────────────────────────────────────────

export function cancelJob(jobId: string): boolean {
  const job = jobs.get(jobId);
  if (!job) {
    return false;
  }

  const proc = activeProcesses.get(jobId);
  if (proc) {
    killTtsProcess(proc);
    activeProcesses.delete(jobId);
  }

  job.status = "failed";
  job.error = "Cancelled by user";
  return true;
}

export function getJob(jobId: string): TtsJob | undefined {
  return jobs.get(jobId);
}

export function listJobs(status?: TtsJobStatus): TtsJob[] {
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
