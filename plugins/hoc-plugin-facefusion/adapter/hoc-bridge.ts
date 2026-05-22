/**
 * Adapter — HoC Bridge
 *
 * Bridges FaceFusion into HoC's Republic system.
 * Manages global state, exposes prompt injection, and delegates to the job scheduler.
 */

import * as path from "node:path";
import {
    cancelJob as schedulerCancel,
    cleanupOldJobs, getActiveCount, getAllJobs, getJob, getJobsByStatus, getQueuedCount, initScheduler, processQueue, submitJob as scheduleJob
} from "../application/job-scheduler.ts";
import { composeFaceFusionPrompt } from "../application/prompt-composer.ts";
import type {
    FaceFusionConfig, FaceJob, FaceProcessor, GpuStatus, JobPriority, QueueStatus
} from "../domain/types.ts";
import { DEFAULT_CONFIG } from "../domain/types.ts";
import {
    detectInstallation,
    findPython,
    type InstallationStatus
} from "../infrastructure/facefusion-cli.ts";
import { getGpuStatus } from "../infrastructure/gpu-monitor.ts";

// ─── Global State ───────────────────────────────────────────────

let config: FaceFusionConfig = { ...DEFAULT_CONFIG };
let installStatus: InstallationStatus | null = null;
let initialized = false;

// ─── Initialization ─────────────────────────────────────────────

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void; debug?: (msg: string) => void },
): { installed: boolean; errors: string[] } {
  // Auto-detect Python
  const pythonPath = process.env.PYTHON_PATH || findPython();
  const installPath = process.env.FACEFUSION_PATH || path.join(dataDir, "facefusion");

  // Set up config with data dir paths
  config = {
    ...DEFAULT_CONFIG,
    installPath,
    pythonPath,
    outputDir: `${dataDir}/output`,
    jobsDir: `${dataDir}/jobs`,
  };

  // Detect + auto-bootstrap
  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.installed) {
    initScheduler(config, log);
    const parts: string[] = [];
    if (installStatus.autoCloned) {
      parts.push("auto-cloned");
    }
    if (installStatus.autoInstalledDeps) {
      parts.push("auto-installed deps");
    }
    const bootstrapMsg = parts.length > 0 ? ` (${parts.join(", ")})` : "";
    log.info(`FaceFusion ready${bootstrapMsg} — Python: ${installStatus.detectedPython}`);
  } else {
    log.warn(`FaceFusion not available: ${installStatus.errors.join("; ")}`);
  }

  return { installed: installStatus.installed, errors: installStatus.errors };
}

// ─── Prompt Injection ───────────────────────────────────────────

/**
 * Get the prompt injection string for a citizen.
 * Consumed by citizen-prompt.ts via soft-dependency import.
 */
export function getFaceFusionPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.installed) {
    return "";
  }

  const queueStatus = getQueueStatusInternal();
  return composeFaceFusionPrompt(specialization ?? "", queueStatus);
}

// ─── Job Submission ─────────────────────────────────────────────

export function submitFaceJob(params: {
  citizenId: string;
  citizenName: string;
  processor: FaceProcessor;
  sourceFile: string;
  outputFile: string;
  targetFile?: string;
  priority?: JobPriority;
  options?: Record<string, unknown>;
}): FaceJob | null {
  if (!installStatus?.installed) {
    return null;
  }
  return scheduleJob(params);
}

// ─── Queue Management ───────────────────────────────────────────

export function tickProcessQueue(): void {
  if (installStatus?.installed) {
    processQueue();
    // Cleanup jobs older than 24h every tick (lightweight check)
    cleanupOldJobs();
  }
}

export function getJobStatus(jobId: string): FaceJob | undefined {
  return getJob(jobId);
}

export function listAllJobs(): FaceJob[] {
  return getAllJobs();
}

export function cancelJob(jobId: string): boolean {
  return schedulerCancel(jobId);
}

// ─── Status ─────────────────────────────────────────────────────

export function getGpuInfo(): GpuStatus {
  return getGpuStatus();
}

export function getQueueStatusInfo(): QueueStatus {
  return getQueueStatusInternal();
}

export function getInstallStatus(): InstallationStatus | null {
  return installStatus;
}

export function getConfig(): FaceFusionConfig {
  return { ...config };
}

export function isInstalled(): boolean {
  return installStatus?.installed ?? false;
}

// ─── Internal ───────────────────────────────────────────────────

function getQueueStatusInternal(): QueueStatus {
  const allJobs = getAllJobs();
  return {
    totalJobs: allJobs.length,
    queuedJobs: getQueuedCount(),
    processingJobs: getActiveCount(),
    completedJobs: getJobsByStatus("completed").length,
    failedJobs: getJobsByStatus("failed").length,
    gpuStatus: getGpuStatus(),
    maxConcurrent: config.maxConcurrentJobs,
    installed: installStatus?.installed ?? false,
  };
}
