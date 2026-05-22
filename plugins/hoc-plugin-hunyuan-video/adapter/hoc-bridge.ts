/**
 * Adapter — HoC Bridge (HunyuanVideo 1.5)
 */
import * as path from "node:path";
import { submitT2VJob, submitI2VJob, getJob, cancelJob, getQueueStatus as schedulerQueueStatus, initScheduler } from "../application/video-scheduler.ts";
import type { VideoJob, QueueStatus, HunyuanConfig } from "../domain/types.ts";
import { DEFAULT_VIDEO_PARAMS, DEFAULT_CONFIG } from "../domain/types.ts";
import { detectInstallation, type HunyuanInstallStatus } from "../infrastructure/hunyuan-engine.ts";

let config: HunyuanConfig = { ...DEFAULT_CONFIG };
let installStatus: HunyuanInstallStatus | null = null;

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = { ...DEFAULT_CONFIG, repoDir: path.join(dataDir, "hunyuan-video"), outputDir: path.join(dataDir, "hunyuan-video", "outputs") };
  installStatus = detectInstallation(config);
  if (installStatus.ready) { config = { ...config, pythonPath: installStatus.pythonPath }; initScheduler(config); log.info(`HunyuanVideo 1.5 ready`); }
  else { log.warn(`HunyuanVideo not available: ${installStatus.errors.join("; ")}`); }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function generateVideo(params: {
  citizenId: string; citizenName: string; prompt: string; negativePrompt?: string;
  resolution?: string; durationSec?: number; fps?: number; precision?: string; seed?: number;
}): VideoJob | null {
  if (!installStatus?.ready) {return null;}
  return submitT2VJob({ citizenId: params.citizenId, citizenName: params.citizenName, request: {
    prompt: params.prompt, negativePrompt: params.negativePrompt,
    resolution: (params.resolution as "540p" | "720p" | "1080p") ?? DEFAULT_VIDEO_PARAMS.resolution,
    durationSec: params.durationSec ?? DEFAULT_VIDEO_PARAMS.durationSec,
    fps: params.fps ?? DEFAULT_VIDEO_PARAMS.fps,
    precision: (params.precision as "fp16" | "fp8" | "bf16") ?? DEFAULT_VIDEO_PARAMS.precision,
    seed: params.seed ?? DEFAULT_VIDEO_PARAMS.seed,
  }});
}

export function imageToVideo(params: {
  citizenId: string; citizenName: string; imagePath: string; prompt?: string; durationSec?: number;
}): VideoJob | null {
  if (!installStatus?.ready) {return null;}
  return submitI2VJob({ citizenId: params.citizenId, citizenName: params.citizenName, request: {
    imagePath: params.imagePath, prompt: params.prompt, durationSec: params.durationSec ?? 5,
  }});
}

export function getJobStatus(jobId: string): VideoJob | undefined { return getJob(jobId); }
export { cancelJob } from "../application/video-scheduler.ts";
export function getQueueStatus(): QueueStatus { return schedulerQueueStatus(); }
export function isReady(): boolean { return installStatus?.ready ?? false; }
