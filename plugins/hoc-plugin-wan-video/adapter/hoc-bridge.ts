/**
 * Adapter — HoC Bridge (Wan 2.2)
 *
 * ZERO-CONFIG: Auto-clones repo, installs deps.
 */

import * as path from "node:path";
import {
  submitT2VJob, submitI2VJob, getJob, cancelJob, getQueueStatus as schedulerQueueStatus, initScheduler
} from "../application/video-scheduler.ts";
import { composeWanPrompt } from "../application/prompt-composer.ts";
import type { VideoJob, QueueStatus } from "../domain/types.ts";
import { DEFAULT_VIDEO_PARAMS, DEFAULT_CONFIG } from "../domain/types.ts";
import type { WanConfig } from "../domain/types.ts";
import { detectInstallation, type WanInstallStatus } from "../infrastructure/wan-engine.ts";

let config: WanConfig = { ...DEFAULT_CONFIG };
let installStatus: WanInstallStatus | null = null;
let initialized = false;

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = {
    ...DEFAULT_CONFIG,
    repoDir: path.join(dataDir, "wan-video"),
    outputDir: path.join(dataDir, "wan-video", "outputs"),
  };
  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    config = { ...config, pythonPath: installStatus.pythonPath };
    initScheduler(config);
    log.info(`Wan 2.2 ready — python=${installStatus.pythonPath}`);
  } else {
    log.warn(`Wan 2.2 not available: ${installStatus.errors.join("; ")}`);
  }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function getWanPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {return "";}
  return composeWanPrompt(specialization ?? "");
}

export function generateVideo(params: {
  citizenId: string;
  citizenName: string;
  prompt: string;
  negativePrompt?: string;
  resolution?: string;
  durationSec?: number;
  fps?: number;
  style?: string;
  cameraMotion?: string;
  seed?: number;
}): VideoJob | null {
  if (!installStatus?.ready) {return null;}
  return submitT2VJob({
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    request: {
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      resolution: (params.resolution as "480p" | "720p") ?? DEFAULT_VIDEO_PARAMS.resolution,
      durationSec: params.durationSec ?? DEFAULT_VIDEO_PARAMS.durationSec,
      fps: params.fps ?? DEFAULT_VIDEO_PARAMS.fps,
      style: (params.style as "cinematic" | "photorealistic" | "anime" | "artistic") ?? DEFAULT_VIDEO_PARAMS.style,
      cameraMotion: (params.cameraMotion as "static" | "pan-left" | "pan-right" | "zoom-in" | "zoom-out" | "orbit" | "dolly" | "tracking") ?? DEFAULT_VIDEO_PARAMS.cameraMotion,
      seed: params.seed ?? DEFAULT_VIDEO_PARAMS.seed,
    },
  });
}

export function imageToVideo(params: {
  citizenId: string;
  citizenName: string;
  imagePath: string;
  prompt?: string;
  durationSec?: number;
}): VideoJob | null {
  if (!installStatus?.ready) {return null;}
  return submitI2VJob({
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    request: {
      imagePath: params.imagePath,
      prompt: params.prompt,
      durationSec: params.durationSec ?? 5,
    },
  });
}

export function getJobStatus(jobId: string): VideoJob | undefined {
  return getJob(jobId);
}
export { cancelJob } from "../application/video-scheduler.ts";
export function getQueueStatus(): QueueStatus {
  return schedulerQueueStatus();
}
export function isReady(): boolean {
  return installStatus?.ready ?? false;
}
