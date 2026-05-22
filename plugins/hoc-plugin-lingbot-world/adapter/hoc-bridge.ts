/**
 * Adapter — HoC Bridge
 *
 * Manages global state, installation status, and exposes
 * LingBot-World capabilities to the HoC runtime.
 *
 * ZERO-CONFIG: On init, automatically:
 *   1. Auto-detects Python 3
 *   2. Auto-clones the repo from GitHub
 *   3. Auto-installs requirements.txt via pip
 *   4. Auto-downloads model from HuggingFace
 *   5. Auto-detects GPU count via nvidia-smi
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { composeWorldPrompt } from "../application/prompt-composer.ts";
import {
    cancelJob, createWorldJob, getJob, getQueueStatus, listJobs, processQueue
} from "../application/simulation-scheduler.ts";
import type {
    CameraAction, SampleSolver, WorldConfig,
    WorldJob,
    WorldJobStatus, WorldQueueStatus, WorldResolution
} from "../domain/types.ts";
import { DEFAULT_CONFIG, SUPPORTED_RESOLUTIONS } from "../domain/types.ts";
import {
    detectGpuCount, detectInstallation,
    findPython, type InstallationStatus
} from "../infrastructure/world-engine.ts";

// ─── Global State ───────────────────────────────────────────────

let config: WorldConfig = { ...DEFAULT_CONFIG };
let installStatus: InstallationStatus | null = null;
let initialized = false;

// ─── Lifecycle ──────────────────────────────────────────────────

export function initBridge(dataDir: string): InstallationStatus {
  const outputDir = path.join(dataDir, "world-output");
  fs.mkdirSync(outputDir, { recursive: true });

  // Auto-detect Python and GPU count
  const pythonPath = DEFAULT_CONFIG.pythonPath || findPython();
  const gpuCount = detectGpuCount();

  // Resolve repo paths
  const installPath = DEFAULT_CONFIG.installPath || path.join(dataDir, "lingbot-world");
  const generateScriptPath = path.join(installPath, "generate.py");
  const modelDir = path.join(
    dataDir,
    gpuCount <= 1 ? "lingbot-world-base-cam-nf4" : "lingbot-world-base-cam",
  );

  config = {
    ...DEFAULT_CONFIG,
    pythonPath,
    installPath: dataDir, // parent for auto-clone
    generateScriptPath,
    modelDir,
    outputDir,
    gpuCount,
    useQuantized: gpuCount <= 1, // auto NF4 for single GPU
    useFsdp: gpuCount > 1, // auto FSDP for multi-GPU
    useT5Cpu: gpuCount <= 1, // offload T5 to CPU on single GPU
  };

  // Detect + auto-bootstrap
  installStatus = detectInstallation(config);
  initialized = true;
  return installStatus;
}

export function isInstalled(): boolean {
  return installStatus?.installed ?? false;
}

export function getConfig(): WorldConfig {
  return config;
}

// ─── Simulation Operations ──────────────────────────────────────

export function submitWorldJob(
  citizenId: string,
  prompt: string,
  imagePath: string,
  opts?: {
    resolution?: WorldResolution;
    frameNum?: number;
    cameraAction?: CameraAction;
    seed?: number;
    solver?: SampleSolver;
  },
): WorldJob {
  if (!initialized || !installStatus?.installed) {
    throw new Error("LingBot-World not installed or bridge not initialized");
  }
  const job = createWorldJob(citizenId, prompt, imagePath, opts);
  processQueue(config);
  return job;
}

export function cancelWorldJob(jobId: string): boolean {
  return cancelJob(jobId);
}

export function getWorldJobStatus(jobId: string): WorldJob | undefined {
  return getJob(jobId);
}

export function listWorldJobs(status?: WorldJobStatus): WorldJob[] {
  return listJobs(status);
}

export function tickProcessQueue(): void {
  if (!initialized) {
    return;
  }
  processQueue(config);
}

export function getWorldQueueStatus(): WorldQueueStatus {
  const q = getQueueStatus();
  return {
    totalJobs: q.total,
    runningJobs: q.running,
    completedJobs: q.completed,
    failedJobs: q.failed,
    installed: installStatus?.installed ?? false,
  };
}

export function getAvailableResolutions(): typeof SUPPORTED_RESOLUTIONS {
  return SUPPORTED_RESOLUTIONS;
}

// ─── Prompt Injection ───────────────────────────────────────────

export function getWorldPromptInjection(specialization?: string): string {
  if (!installStatus?.installed) {
    return "";
  }
  return composeWorldPrompt(specialization);
}
