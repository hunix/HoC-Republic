/**
 * Adapter — HoC Bridge (StableAvatar)
 *
 * ZERO-CONFIG: Auto-clones repo, installs deps.
 */

import * as path from "node:path";
import {
    cancelJob as schedulerCancel, getJob, getQueueStatus as schedulerQueueStatus, initScheduler,
    submitJob as scheduleJob
} from "../application/avatar-scheduler.ts";
import { composeStableAvatarPrompt } from "../application/prompt-composer.ts";
import type { AvatarJob, AvatarRequest, GenerationMode, QueueStatus, StableAvatarConfig } from "../domain/types.ts";
import { DEFAULT_AVATAR_PARAMS, DEFAULT_CONFIG } from "../domain/types.ts";
import {
    detectInstallation,
    type StableAvatarInstallStatus
} from "../infrastructure/avatar-engine.ts";

let config: StableAvatarConfig = { ...DEFAULT_CONFIG };
let installStatus: StableAvatarInstallStatus | null = null;
let initialized = false;

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = {
    ...DEFAULT_CONFIG,
    repoDir: path.join(dataDir, "StableAvatar"),
    outputDir: path.join(dataDir, "StableAvatar", "outputs"),
    checkpointPath: path.join(dataDir, "StableAvatar", "checkpoints"),
  };
  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    config = { ...config, pythonPath: installStatus.pythonPath };
    initScheduler(config);
    log.info(`StableAvatar ready — python=${installStatus.pythonPath}`);
  } else {
    log.warn(`StableAvatar not available: ${installStatus.errors.join("; ")}`);
  }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function getStableAvatarPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeStableAvatarPrompt(specialization ?? "");
}

export function generateAvatarVideo(params: {
  citizenId: string;
  citizenName: string;
  referenceImagePath: string;
  audioPath: string;
  mode?: string;
  loraPath?: string;
  guidanceScale?: number;
  seed?: number;
  fps?: number;
}): AvatarJob | null {
  if (!installStatus?.ready) {
    return null;
  }
  const request: AvatarRequest = {
    referenceImagePath: params.referenceImagePath,
    audioPath: params.audioPath,
    mode: (params.mode as GenerationMode) ?? DEFAULT_AVATAR_PARAMS.mode,
    loraPath: params.loraPath,
    guidanceScale: params.guidanceScale ?? DEFAULT_AVATAR_PARAMS.guidanceScale,
    seed: params.seed ?? DEFAULT_AVATAR_PARAMS.seed,
    fps: params.fps ?? DEFAULT_AVATAR_PARAMS.fps,
  };
  return scheduleJob({ citizenId: params.citizenId, citizenName: params.citizenName, request });
}

export function getJobStatus(jobId: string): AvatarJob | undefined {
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
