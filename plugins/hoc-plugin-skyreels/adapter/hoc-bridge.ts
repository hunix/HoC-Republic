/**
 * Adapter — HoC Bridge (SkyReels V2)
 */
import * as path from "node:path";
import { submitSceneJob, submitContinuousJob, submitExtendJob, getJob, cancelJob, getQueueStatus as schedulerQueueStatus, initScheduler } from "../application/scene-scheduler.ts";
import type { VideoJob, QueueStatus, SkyReelsConfig } from "../domain/types.ts";
import { DEFAULT_SCENE_PARAMS, DEFAULT_CONFIG } from "../domain/types.ts";
import { detectInstallation, type SkyReelsInstallStatus } from "../infrastructure/skyreels-engine.ts";

let config: SkyReelsConfig = { ...DEFAULT_CONFIG };
let installStatus: SkyReelsInstallStatus | null = null;

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = { ...DEFAULT_CONFIG, repoDir: path.join(dataDir, "skyreels-v2"), outputDir: path.join(dataDir, "skyreels-v2", "outputs") };
  installStatus = detectInstallation(config);
  if (installStatus.ready) { config = { ...config, pythonPath: installStatus.pythonPath }; initScheduler(config); log.info(`SkyReels V2 ready`); }
  else { log.warn(`SkyReels V2 not available: ${installStatus.errors.join("; ")}`); }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function generateScene(params: {
  citizenId: string; citizenName: string; prompt: string;
  durationSec?: number; resolution?: string; shotType?: string;
  cameraAngle?: string; cameraMovement?: string; seed?: number;
}): VideoJob | null {
  if (!installStatus?.ready) {return null;}
  return submitSceneJob({ citizenId: params.citizenId, citizenName: params.citizenName, request: {
    prompt: params.prompt,
    durationSec: params.durationSec ?? DEFAULT_SCENE_PARAMS.durationSec,
    resolution: (params.resolution as "480p" | "720p" | "1080p") ?? DEFAULT_SCENE_PARAMS.resolution,
    shotType: (params.shotType as "wide" | "medium" | "close-up" | "extreme-close-up" | "over-shoulder" | "aerial" | "pov") ?? DEFAULT_SCENE_PARAMS.shotType,
    cameraAngle: (params.cameraAngle as "eye-level" | "low-angle" | "high-angle" | "bird-eye" | "dutch-angle") ?? DEFAULT_SCENE_PARAMS.cameraAngle,
    cameraMovement: (params.cameraMovement as "static" | "pan" | "tilt" | "dolly" | "tracking" | "crane" | "handheld" | "steadicam") ?? DEFAULT_SCENE_PARAMS.cameraMovement,
    seed: params.seed ?? DEFAULT_SCENE_PARAMS.seed,
  }});
}

export function generateContinuous(params: {
  citizenId: string; citizenName: string; scenes: string[];
  sceneDurationSec?: number; transitionType?: string;
}): VideoJob | null {
  if (!installStatus?.ready) {return null;}
  return submitContinuousJob({ citizenId: params.citizenId, citizenName: params.citizenName, request: {
    scenes: params.scenes,
    sceneDurationSec: params.sceneDurationSec ?? 10,
    transitionType: (params.transitionType as "seamless" | "fade" | "cut") ?? "seamless",
  }});
}

export function extendVideo(params: {
  citizenId: string; citizenName: string; videoPath: string;
  prompt?: string; extendSec?: number;
}): VideoJob | null {
  if (!installStatus?.ready) {return null;}
  return submitExtendJob({ citizenId: params.citizenId, citizenName: params.citizenName, request: {
    videoPath: params.videoPath, prompt: params.prompt, extendSec: params.extendSec ?? 10,
  }});
}

export function getJobStatus(jobId: string): VideoJob | undefined { return getJob(jobId); }
export { cancelJob } from "../application/scene-scheduler.ts";
export function getQueueStatus(): QueueStatus { return schedulerQueueStatus(); }
export function isReady(): boolean { return installStatus?.ready ?? false; }
