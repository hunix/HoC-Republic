/**
 * Adapter — HoC Bridge (Sparc3D)
 *
 * ZERO-CONFIG: Auto-clones Sparc3D, installs deps on first use.
 */

import * as path from "node:path";
import {
    cancelJob as schedulerCancel, getJob, getQueueStatus as schedulerQueueStatus, initScheduler,
    submitJob as scheduleJob
} from "../application/generation-scheduler.ts";
import { composeSparc3DPrompt } from "../application/prompt-composer.ts";
import type {
    GenerationJob, GenerationMode, GenerationRequest, OutputFormat, QueueStatus, Sparc3DConfig
} from "../domain/types.ts";
import { DEFAULT_CONFIG, DEFAULT_GENERATION_PARAMS } from "../domain/types.ts";
import { detectInstallation, type Sparc3DInstallStatus } from "../infrastructure/sparc3d-engine.ts";

let config: Sparc3DConfig = { ...DEFAULT_CONFIG };
let installStatus: Sparc3DInstallStatus | null = null;
let initialized = false;

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = {
    ...DEFAULT_CONFIG,
    repoDir: path.join(dataDir, "Sparc3D"),
    outputDir: path.join(dataDir, "Sparc3D", "outputs"),
  };
  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    config = { ...config, pythonPath: installStatus.pythonPath };
    initScheduler(config);
    log.info(`Sparc3D ready — python=${installStatus.pythonPath}`);
  } else {
    log.warn(`Sparc3D not available: ${installStatus.errors.join("; ")}`);
  }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function getSparc3DPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeSparc3DPrompt(specialization ?? "");
}

export function generate3D(params: {
  citizenId: string;
  citizenName: string;
  mode: string;
  imagePath?: string;
  meshPath?: string;
  resolution?: number;
  outputFormat?: string;
}): GenerationJob | null {
  if (!installStatus?.ready) {
    return null;
  }
  const request: GenerationRequest = {
    mode: (params.mode as GenerationMode) ?? "image-to-3d",
    imagePath: params.imagePath,
    meshPath: params.meshPath,
    resolution: params.resolution ?? DEFAULT_GENERATION_PARAMS.resolution,
    outputFormat: (params.outputFormat as OutputFormat) ?? DEFAULT_GENERATION_PARAMS.outputFormat,
    seed: DEFAULT_GENERATION_PARAMS.seed,
  };
  return scheduleJob({ citizenId: params.citizenId, citizenName: params.citizenName, request });
}

export function getJobStatus(jobId: string): GenerationJob | undefined {
  return getJob(jobId);
}
export function cancelJob(jobId: string): boolean {
  return schedulerCancel(jobId);
}
export function getQueueStatus(): QueueStatus {
  return schedulerQueueStatus();
}
export function isReady(): boolean {
  return installStatus?.ready ?? false;
}
