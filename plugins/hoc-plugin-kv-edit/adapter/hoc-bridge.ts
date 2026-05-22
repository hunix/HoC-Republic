/**
 * Adapter — HoC Bridge (KV-Edit)
 *
 * ZERO-CONFIG: Auto-clones repo, installs requirements on first use.
 */

import * as path from "node:path";
import {
    cancelJob as schedulerCancel, getJob, getQueueStatus as schedulerQueueStatus, initScheduler,
    submitJob as scheduleJob
} from "../application/editing-scheduler.ts";
import { composeKVEditPrompt } from "../application/prompt-composer.ts";
import type { EditJob, EditOperation, EditRequest, KVEditConfig, QueueStatus } from "../domain/types.ts";
import { DEFAULT_CONFIG, DEFAULT_EDIT_PARAMS } from "../domain/types.ts";
import { detectInstallation, type KVEditInstallStatus } from "../infrastructure/kvedit-engine.ts";

let config: KVEditConfig = { ...DEFAULT_CONFIG };
let installStatus: KVEditInstallStatus | null = null;
let initialized = false;

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = {
    ...DEFAULT_CONFIG,
    repoDir: path.join(dataDir, "KV-Edit"),
    outputDir: path.join(dataDir, "KV-Edit", "outputs"),
  };
  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    config = { ...config, pythonPath: installStatus.pythonPath };
    initScheduler(config);
    log.info(`KV-Edit ready — python=${installStatus.pythonPath}`);
  } else {
    log.warn(`KV-Edit not available: ${installStatus.errors.join("; ")}`);
  }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function getKVEditPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeKVEditPrompt(specialization ?? "");
}

export function editImage(params: {
  citizenId: string;
  citizenName: string;
  imagePath: string;
  maskPath?: string;
  sourcePrompt: string;
  targetPrompt: string;
  operation?: string;
  skipSteps?: number;
  attnScale?: number;
  reInit?: boolean;
  attnMask?: boolean;
  seed?: number;
}): EditJob | null {
  if (!installStatus?.ready) {
    return null;
  }
  const request: EditRequest = {
    imagePath: params.imagePath,
    maskPath: params.maskPath,
    sourcePrompt: params.sourcePrompt,
    targetPrompt: params.targetPrompt,
    operation: (params.operation as EditOperation) ?? DEFAULT_EDIT_PARAMS.operation,
    skipSteps: params.skipSteps ?? DEFAULT_EDIT_PARAMS.skipSteps,
    attnScale: params.attnScale ?? DEFAULT_EDIT_PARAMS.attnScale,
    reInit: params.reInit ?? DEFAULT_EDIT_PARAMS.reInit,
    attnMask: params.attnMask ?? DEFAULT_EDIT_PARAMS.attnMask,
    seed: params.seed ?? DEFAULT_EDIT_PARAMS.seed,
  };
  return scheduleJob({ citizenId: params.citizenId, citizenName: params.citizenName, request });
}

export function getJobStatus(jobId: string): EditJob | undefined {
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
