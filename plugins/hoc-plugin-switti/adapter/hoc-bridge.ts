/**
 * Adapter — HoC Bridge (Switti)
 *
 * ZERO-CONFIG: Auto-clones repo, installs deps, downloads models on first use.
 */

import * as path from "node:path";
import {
    cancelJob as schedulerCancel, getJob, getQueueStatus as schedulerQueueStatus, initScheduler,
    submitJob as scheduleJob
} from "../application/generation-scheduler.ts";
import { composeSwittiPrompt } from "../application/prompt-composer.ts";
import type {
    GenerationJob,
    GenerationRequest,
    QueueStatus, SwittiConfig, SwittiModel
} from "../domain/types.ts";
import { DEFAULT_CONFIG, DEFAULT_GENERATION_PARAMS } from "../domain/types.ts";
import { detectInstallation, type SwittiInstallStatus } from "../infrastructure/switti-engine.ts";

let config: SwittiConfig = { ...DEFAULT_CONFIG };
let installStatus: SwittiInstallStatus | null = null;
let initialized = false;

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = {
    ...DEFAULT_CONFIG,
    repoDir: path.join(dataDir, "switti"),
    outputDir: path.join(dataDir, "switti", "outputs"),
  };
  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    config = { ...config, pythonPath: installStatus.pythonPath };
    initScheduler(config);
    log.info(`Switti ready — python=${installStatus.pythonPath}`);
  } else {
    log.warn(`Switti not available: ${installStatus.errors.join("; ")}`);
  }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function getSwittiPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeSwittiPrompt(specialization ?? "");
}

export function generate(params: {
  citizenId: string;
  citizenName: string;
  prompt: string;
  model?: string;
  cfg?: number;
  topK?: number;
  topP?: number;
  moreSmooth?: boolean;
  seed?: number;
}): GenerationJob | null {
  if (!installStatus?.ready) {
    return null;
  }
  const request: GenerationRequest = {
    prompt: params.prompt,
    model: (params.model as SwittiModel) ?? DEFAULT_GENERATION_PARAMS.model,
    cfg: params.cfg ?? DEFAULT_GENERATION_PARAMS.cfg,
    topK: params.topK ?? DEFAULT_GENERATION_PARAMS.topK,
    topP: params.topP ?? DEFAULT_GENERATION_PARAMS.topP,
    moreSmooth: params.moreSmooth ?? DEFAULT_GENERATION_PARAMS.moreSmooth,
    seed: params.seed ?? DEFAULT_GENERATION_PARAMS.seed,
    smoothStartSi: DEFAULT_GENERATION_PARAMS.smoothStartSi,
    turnOnCfgStartSi: DEFAULT_GENERATION_PARAMS.turnOnCfgStartSi,
    turnOffCfgStartSi: DEFAULT_GENERATION_PARAMS.turnOffCfgStartSi,
    lastScaleTemp: DEFAULT_GENERATION_PARAMS.lastScaleTemp,
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
