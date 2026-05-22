/**
 * Adapter — HoC Bridge (CogVideoX)
 */
import * as path from "node:path";
import { submitJob, getJob, cancelJob, getQueueStatus as schedulerQueueStatus, initScheduler } from "../application/video-scheduler.ts";
import type { VideoJob, QueueStatus, CogVideoConfig } from "../domain/types.ts";
import { DEFAULT_VIDEO_PARAMS, DEFAULT_CONFIG } from "../domain/types.ts";
import { detectInstallation, type CogVideoInstallStatus } from "../infrastructure/cogvideo-engine.ts";

let config: CogVideoConfig = { ...DEFAULT_CONFIG };
let installStatus: CogVideoInstallStatus | null = null;

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = { ...DEFAULT_CONFIG, repoDir: path.join(dataDir, "cogvideo"), outputDir: path.join(dataDir, "cogvideo", "outputs") };
  installStatus = detectInstallation(config);
  if (installStatus.ready) { config = { ...config, pythonPath: installStatus.pythonPath }; initScheduler(config); log.info(`CogVideoX ready`); }
  else { log.warn(`CogVideoX not available: ${installStatus.errors.join("; ")}`); }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function generateVideo(params: {
  citizenId: string; citizenName: string; prompt: string; model?: string;
  numFrames?: number; width?: number; height?: number; fps?: number;
  guidanceScale?: number; quantize?: string; seed?: number;
}): VideoJob | null {
  if (!installStatus?.ready) {return null;}
  return submitJob({ citizenId: params.citizenId, citizenName: params.citizenName, request: {
    prompt: params.prompt,
    model: (params.model as "2B" | "5B") ?? DEFAULT_VIDEO_PARAMS.model,
    numFrames: params.numFrames ?? DEFAULT_VIDEO_PARAMS.numFrames,
    width: params.width ?? DEFAULT_VIDEO_PARAMS.width,
    height: params.height ?? DEFAULT_VIDEO_PARAMS.height,
    fps: params.fps ?? DEFAULT_VIDEO_PARAMS.fps,
    guidanceScale: params.guidanceScale ?? DEFAULT_VIDEO_PARAMS.guidanceScale,
    quantize: (params.quantize as "none" | "int8" | "int4") ?? DEFAULT_VIDEO_PARAMS.quantize,
    seed: params.seed ?? DEFAULT_VIDEO_PARAMS.seed,
  }});
}

export function getJobStatus(jobId: string): VideoJob | undefined { return getJob(jobId); }
export { cancelJob } from "../application/video-scheduler.ts";
export function getQueueStatus(): QueueStatus { return schedulerQueueStatus(); }
export function isReady(): boolean { return installStatus?.ready ?? false; }
