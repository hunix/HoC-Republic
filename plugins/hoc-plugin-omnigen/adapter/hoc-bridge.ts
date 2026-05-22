/**
 * Adapter — HoC Bridge
 *
 * Manages global state, installation status, and exposes
 * OmniGen capabilities to the HoC runtime.
 *
 * ZERO-CONFIG: On init, automatically:
 *   1. Auto-detects Python 3
 *   2. Auto-clones VectorSpaceLab/OmniGen
 *   3. Auto-installs via pip install -e .
 *   4. Auto-downloads model from HuggingFace
 */

import * as path from "node:path";
import {
    cancelJob as schedulerCancel,
    getAllJobs, getJob, getJobsByStatus, getQueuedCount,
    getRunningCount, initScheduler,
    submitJob as scheduleJob
} from "../application/generation-scheduler.ts";
import { composeOmniGenPrompt } from "../application/prompt-composer.ts";
import type {
    OmniGenConfig,
    OmniGenJob,
    OmniGenMode,
    OmniGenQueueStatus
} from "../domain/types.ts";
import { DEFAULT_CONFIG } from "../domain/types.ts";
import {
    detectInstallation,
    findPython,
    type OmniGenInstallStatus
} from "../infrastructure/omnigen-engine.ts";

// ─── Global State ───────────────────────────────────────────────

let config: OmniGenConfig = { ...DEFAULT_CONFIG };
let installStatus: OmniGenInstallStatus | null = null;
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
    installPath: path.join(dataDir, "OmniGen"),
    modelCacheDir: path.join(dataDir, "models"),
    outputDir: path.join(dataDir, "output"),
  };

  // Auto-bootstrap
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
    log.info(`OmniGen ready${msg} — Python: ${installStatus.detectedPython}`);
  } else {
    log.warn(`OmniGen not available: ${installStatus.errors.join("; ")}`);
  }

  return { ready: installStatus.ready, errors: installStatus.errors };
}

// ─── Prompt Injection ───────────────────────────────────────────

export function getOmniGenPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeOmniGenPrompt(specialization ?? "", getQueueStatusInternal());
}

// ─── Job Submission ─────────────────────────────────────────────

export function submitGeneration(params: {
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
}): OmniGenJob | null {
  if (!installStatus?.ready) {
    return null;
  }
  return scheduleJob(params);
}

// ─── Job Management ─────────────────────────────────────────────

export function getJobStatus(jobId: string): OmniGenJob | undefined {
  return getJob(jobId);
}

export function cancelJob(jobId: string): boolean {
  return schedulerCancel(jobId);
}

export function getQueueStatusInfo(): OmniGenQueueStatus {
  return getQueueStatusInternal();
}

export function isReady(): boolean {
  return installStatus?.ready ?? false;
}

// ─── Internal ───────────────────────────────────────────────────

function getQueueStatusInternal(): OmniGenQueueStatus {
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
