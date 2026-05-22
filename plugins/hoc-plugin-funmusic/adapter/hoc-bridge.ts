/**
 * Adapter — HoC Bridge
 *
 * Manages global state, installation status, and exposes
 * InspireMusic capabilities to the HoC runtime.
 *
 * ZERO-CONFIG: On init, automatically:
 *   1. Auto-detects Python 3
 *   2. Auto-clones FunAudioLLM/InspireMusic (with submodules)
 *   3. Auto-installs via setup.py
 *   4. Auto-downloads model from HuggingFace
 */

import * as path from "node:path";
import {
    cancelJob as schedulerCancel,
    getAllJobs, getJob, getJobsByStatus, getQueuedCount,
    getRunningCount, initScheduler,
    submitJob as scheduleJob
} from "../application/generation-scheduler.ts";
import { composeFunMusicPrompt } from "../application/prompt-composer.ts";
import type {
    ChorusMode, InspireMusicConfig,
    MusicJob, MusicQueueStatus, MusicTask, OutputFormat
} from "../domain/types.ts";
import { DEFAULT_CONFIG } from "../domain/types.ts";
import {
    detectInstallation,
    findPython,
    type InspireMusicInstallStatus
} from "../infrastructure/inspiremusic-engine.ts";

// ─── Global State ───────────────────────────────────────────────

let config: InspireMusicConfig = { ...DEFAULT_CONFIG };
let installStatus: InspireMusicInstallStatus | null = null;
let initialized = false;

// ─── Initialization ─────────────────────────────────────────────

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  const pythonPath = process.env.PYTHON_PATH || findPython();

  config = {
    ...DEFAULT_CONFIG,
    pythonPath,
    installPath: path.join(dataDir, "InspireMusic"),
    modelDir: path.join(dataDir, "pretrained_models"),
    outputDir: path.join(dataDir, "output"),
  };

  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    initScheduler(config);
    const parts: string[] = [];
    if (installStatus.autoCloned) {
      parts.push("auto-cloned");
    }
    if (installStatus.autoInstalledDeps) {
      parts.push("auto-installed deps");
    }
    if (installStatus.autoDownloadedModel) {
      parts.push("auto-downloaded model");
    }
    const msg = parts.length > 0 ? ` (${parts.join(", ")})` : "";
    log.info(`FunMusic ready${msg} — Python: ${installStatus.detectedPython}`);
  } else {
    log.warn(`FunMusic not available: ${installStatus.errors.join("; ")}`);
  }

  return { ready: installStatus.ready, errors: installStatus.errors };
}

// ─── Prompt Injection ───────────────────────────────────────────

export function getFunMusicPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeFunMusicPrompt(specialization ?? "", getQueueStatusInternal());
}

// ─── Job Submission ─────────────────────────────────────────────

export function submitGeneration(params: {
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
}): MusicJob | null {
  if (!installStatus?.ready) {
    return null;
  }
  return scheduleJob(params);
}

// ─── Job Management ─────────────────────────────────────────────

export function getJobStatus(jobId: string): MusicJob | undefined {
  return getJob(jobId);
}

export function cancelJob(jobId: string): boolean {
  return schedulerCancel(jobId);
}

export function getQueueStatusInfo(): MusicQueueStatus {
  return getQueueStatusInternal();
}

export function isReady(): boolean {
  return installStatus?.ready ?? false;
}

// ─── Internal ───────────────────────────────────────────────────

function getQueueStatusInternal(): MusicQueueStatus {
  const allJobs = getAllJobs();
  return {
    totalJobs: allJobs.length,
    queuedJobs: getQueuedCount(),
    runningJobs: getRunningCount(),
    completedJobs: getJobsByStatus("completed").length,
    failedJobs: getJobsByStatus("failed").length,
    installed: installStatus?.ready ?? false,
  };
}
