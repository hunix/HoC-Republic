/**
 * Adapter — HoC Bridge (Deforum)
 *
 * ZERO-CONFIG: Auto-clones repo, installs deps.
 */

import * as path from "node:path";
import {
    cancelJob as schedulerCancel, getJob, getQueueStatus as schedulerQueueStatus, initScheduler,
    submitJob as scheduleJob
} from "../application/animation-scheduler.ts";
import { composeDeforumPrompt } from "../application/prompt-composer.ts";
import type {
    AnimationJob, AnimationMode, AnimationRequest, DeforumConfig, QueueStatus
} from "../domain/types.ts";
import { DEFAULT_ANIMATION_PARAMS, DEFAULT_CONFIG } from "../domain/types.ts";
import { detectInstallation, type DeforumInstallStatus } from "../infrastructure/deforum-engine.ts";

let config: DeforumConfig = { ...DEFAULT_CONFIG };
let installStatus: DeforumInstallStatus | null = null;
let initialized = false;

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = {
    ...DEFAULT_CONFIG,
    repoDir: path.join(dataDir, "deforum-stable-diffusion"),
    outputDir: path.join(dataDir, "deforum-stable-diffusion", "outputs"),
  };
  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    config = { ...config, pythonPath: installStatus.pythonPath };
    initScheduler(config);
    log.info(`Deforum ready — python=${installStatus.pythonPath}`);
  } else {
    log.warn(`Deforum not available: ${installStatus.errors.join("; ")}`);
  }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function getDeforumPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeDeforumPrompt(specialization ?? "");
}

export function createAnimation(params: {
  citizenId: string;
  citizenName: string;
  prompt: string;
  negativePrompt?: string;
  animationMode?: string;
  maxFrames?: number;
  width?: number;
  height?: number;
  seed?: number;
  fps?: number;
  clipGuidance?: boolean;
}): AnimationJob | null {
  if (!installStatus?.ready) {
    return null;
  }
  const request: AnimationRequest = {
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    animationMode:
      (params.animationMode as AnimationMode) ?? DEFAULT_ANIMATION_PARAMS.animationMode,
    maxFrames: params.maxFrames ?? DEFAULT_ANIMATION_PARAMS.maxFrames,
    width: params.width ?? DEFAULT_ANIMATION_PARAMS.width,
    height: params.height ?? DEFAULT_ANIMATION_PARAMS.height,
    steps: DEFAULT_ANIMATION_PARAMS.steps,
    cfgScale: DEFAULT_ANIMATION_PARAMS.cfgScale,
    seed: params.seed ?? DEFAULT_ANIMATION_PARAMS.seed,
    fps: params.fps ?? DEFAULT_ANIMATION_PARAMS.fps,
    clipGuidance: params.clipGuidance ?? DEFAULT_ANIMATION_PARAMS.clipGuidance,
  };
  return scheduleJob({ citizenId: params.citizenId, citizenName: params.citizenName, request });
}

export function getJobStatus(jobId: string): AnimationJob | undefined {
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
