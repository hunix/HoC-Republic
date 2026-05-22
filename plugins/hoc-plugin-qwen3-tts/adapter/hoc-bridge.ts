/**
 * Adapter — HoC Bridge
 *
 * Manages global state, installation status, and exposes
 * Qwen3-TTS capabilities to the HoC runtime.
 *
 * ZERO-CONFIG: On init, automatically:
 *   1. Auto-detects Python 3 (python3, python, py -3)
 *   2. Auto-installs qwen-tts via pip if not present
 *   3. Checks CUDA availability
 * No user installation or configuration required.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { composeTtsPrompt } from "../application/prompt-composer.ts";
import {
    cancelJob, createTtsJob, getJob, getQueueStatus, listJobs, processQueue
} from "../application/synthesis-scheduler.ts";
import type {
    TtsConfig,
    TtsJob,
    TtsJobStatus,
    TtsLanguage,
    TtsMode,
    TtsQueueStatus
} from "../domain/types.ts";
import { DEFAULT_CONFIG, PRESET_SPEAKERS, SUPPORTED_LANGUAGES } from "../domain/types.ts";
import {
    detectInstallation,
    findPython,
    type InstallationStatus
} from "../infrastructure/tts-engine.ts";

// ─── Global State ───────────────────────────────────────────────

let config: TtsConfig = { ...DEFAULT_CONFIG };
let installStatus: InstallationStatus | null = null;
let initialized = false;

// ─── Lifecycle ──────────────────────────────────────────────────

export function initBridge(dataDir: string): InstallationStatus {
  const outputDir = path.join(dataDir, "tts-output");
  fs.mkdirSync(outputDir, { recursive: true });

  // Auto-detect Python 3
  const pythonPath = DEFAULT_CONFIG.pythonPath || findPython();

  config = {
    ...DEFAULT_CONFIG,
    pythonPath,
    outputDir,
  };

  // Detect + auto-install qwen-tts if needed
  installStatus = detectInstallation(config);
  initialized = true;
  return installStatus;
}

export function isInstalled(): boolean {
  return installStatus?.installed ?? false;
}

export function getConfig(): TtsConfig {
  return config;
}

// ─── Synthesis Operations ───────────────────────────────────────

export function submitTtsJob(
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
  if (!initialized || !installStatus?.installed) {
    throw new Error("Qwen3-TTS not installed or bridge not initialized");
  }
  const job = createTtsJob(citizenId, mode, text, language, opts);
  // Immediately try to process
  processQueue(config);
  return job;
}

export function cancelTtsJob(jobId: string): boolean {
  return cancelJob(jobId);
}

export function getTtsJobStatus(jobId: string): TtsJob | undefined {
  return getJob(jobId);
}

export function listTtsJobs(status?: TtsJobStatus): TtsJob[] {
  return listJobs(status);
}

export function tickProcessQueue(): void {
  if (!initialized) {
    return;
  }
  processQueue(config);
}

export function getTtsQueueStatus(): TtsQueueStatus {
  const q = getQueueStatus();
  return {
    totalJobs: q.total,
    runningJobs: q.running,
    completedJobs: q.completed,
    failedJobs: q.failed,
    installed: installStatus?.installed ?? false,
  };
}

export function getAvailableVoices(): typeof PRESET_SPEAKERS {
  return PRESET_SPEAKERS;
}

export function getAvailableLanguages(): typeof SUPPORTED_LANGUAGES {
  return SUPPORTED_LANGUAGES;
}

// ─── Prompt Injection ───────────────────────────────────────────

export function getTtsPromptInjection(specialization?: string): string {
  if (!installStatus?.installed) {
    return "";
  }
  return composeTtsPrompt(specialization);
}
