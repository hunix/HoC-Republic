/**
 * Adapter — HoC Bridge
 *
 * Manages global state, installation status, and exposes
 * GLM-Image capabilities to the HoC runtime.
 *
 * ZERO-CONFIG: On init, automatically:
 *   1. Auto-detects Python 3
 *   2. Auto-installs transformers + diffusers from git
 *   3. Auto-downloads model weights via HuggingFace CLI
 */

import * as path from "node:path";
import {
    cancelJob as schedulerCancel,
    getAllJobs, getJob, getJobsByStatus, getQueuedCount,
    getRunningCount, initScheduler,
    submitJob as scheduleJob
} from "../application/generation-scheduler.ts";
import { composeGlmPrompt } from "../application/prompt-composer.ts";
import type {
    GenerationMode, GlmImageConfig,
    GlmImageJob, GlmQueueStatus
} from "../domain/types.ts";
import { DEFAULT_CONFIG } from "../domain/types.ts";
import {
    detectInstallation,
    findPython,
    type GlmInstallStatus
} from "../infrastructure/glm-engine.ts";

// ─── Global State ───────────────────────────────────────────────

let config: GlmImageConfig = { ...DEFAULT_CONFIG };
let installStatus: GlmInstallStatus | null = null;
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
    modelCacheDir: path.join(dataDir, "models"),
    outputDir: path.join(dataDir, "output"),
  };

  // Auto-bootstrap
  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    initScheduler(config);
    const parts: string[] = [];
    if (installStatus.autoInstalledDeps) {
      parts.push("auto-installed deps");
    }
    if (installStatus.autoDownloadedModel) {
      parts.push("auto-downloaded model");
    }
    const msg = parts.length > 0 ? ` (${parts.join(", ")})` : "";
    log.info(`GLM-Image ready${msg} — Python: ${installStatus.detectedPython}`);
  } else {
    log.warn(`GLM-Image not available: ${installStatus.errors.join("; ")}`);
  }

  return { ready: installStatus.ready, errors: installStatus.errors };
}

// ─── Prompt Injection ───────────────────────────────────────────

export function getGlmPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeGlmPrompt(specialization ?? "", getQueueStatusInternal());
}

// ─── Job Submission ─────────────────────────────────────────────

export function submitGeneration(params: {
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
}): GlmImageJob | null {
  if (!installStatus?.ready) {
    return null;
  }
  return scheduleJob(params);
}

// ─── Job Management ─────────────────────────────────────────────

export function getJobStatus(jobId: string): GlmImageJob | undefined {
  return getJob(jobId);
}

export function cancelJob(jobId: string): boolean {
  return schedulerCancel(jobId);
}

export function getQueueStatusInfo(): GlmQueueStatus {
  return getQueueStatusInternal();
}

export function isReady(): boolean {
  return installStatus?.ready ?? false;
}

// ─── Internal ───────────────────────────────────────────────────

function getQueueStatusInternal(): GlmQueueStatus {
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
