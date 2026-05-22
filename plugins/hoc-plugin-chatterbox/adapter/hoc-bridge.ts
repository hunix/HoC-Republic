/**
 * Adapter — HoC Bridge
 *
 * Manages global state, installation status, and exposes
 * Chatterbox TTS capabilities to the HoC runtime.
 *
 * ZERO-CONFIG: On init, automatically:
 *   1. Auto-detects Python 3
 *   2. Auto-installs chatterbox-tts via pip
 */

import * as path from "node:path";
import {
    cancelJob as schedulerCancel,
    getAllJobs, getJob, getJobsByStatus, getQueuedCount,
    getRunningCount, initScheduler,
    submitJob as scheduleJob
} from "../application/generation-scheduler.ts";
import { composeChatterboxPrompt } from "../application/prompt-composer.ts";
import type {
    ChatterboxConfig, ChatterboxModel,
    LanguageId, TTSJob, TTSQueueStatus
} from "../domain/types.ts";
import { DEFAULT_CONFIG } from "../domain/types.ts";
import {
    detectInstallation,
    findPython,
    type ChatterboxInstallStatus
} from "../infrastructure/chatterbox-engine.ts";

// ─── Global State ───────────────────────────────────────────────

let config: ChatterboxConfig = { ...DEFAULT_CONFIG };
let installStatus: ChatterboxInstallStatus | null = null;
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
    outputDir: path.join(dataDir, "chatterbox-output"),
  };

  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    initScheduler(config);
    const msg = installStatus.autoInstalledPackage ? " (auto-installed chatterbox-tts)" : "";
    log.info(`Chatterbox TTS ready${msg} — Python: ${installStatus.detectedPython}`);
  } else {
    log.warn(`Chatterbox TTS not available: ${installStatus.errors.join("; ")}`);
  }

  return { ready: installStatus.ready, errors: installStatus.errors };
}

// ─── Prompt Injection ───────────────────────────────────────────

export function getChatterboxPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeChatterboxPrompt(specialization ?? "", getQueueStatusInternal());
}

// ─── Job Submission ─────────────────────────────────────────────

export function submitGeneration(params: {
  citizenId: string;
  citizenName: string;
  model?: ChatterboxModel;
  text: string;
  audioPromptPath?: string;
  languageId?: LanguageId;
  exaggeration?: number;
  cfgWeight?: number;
}): TTSJob | null {
  if (!installStatus?.ready) {
    return null;
  }
  return scheduleJob(params);
}

// ─── Job Management ─────────────────────────────────────────────

export function getJobStatus(jobId: string): TTSJob | undefined {
  return getJob(jobId);
}

export function cancelJob(jobId: string): boolean {
  return schedulerCancel(jobId);
}

export function getQueueStatusInfo(): TTSQueueStatus {
  return getQueueStatusInternal();
}

export function isReady(): boolean {
  return installStatus?.ready ?? false;
}

// ─── Internal ───────────────────────────────────────────────────

function getQueueStatusInternal(): TTSQueueStatus {
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
