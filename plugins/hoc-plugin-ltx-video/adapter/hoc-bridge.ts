/**
 * Adapter — HoC Bridge (LTX-2)
 */
import * as path from "node:path";
import { submitT2VJob, submitI2VJob, getJob, cancelJob, getQueueStatus as schedulerQueueStatus, initScheduler } from "../application/video-scheduler.ts";
import type { VideoJob, QueueStatus, LTXConfig } from "../domain/types.ts";
import { DEFAULT_VIDEO_PARAMS, DEFAULT_CONFIG } from "../domain/types.ts";
import { detectInstallation, type LTXInstallStatus } from "../infrastructure/ltx-engine.ts";

let config: LTXConfig = { ...DEFAULT_CONFIG };
let installStatus: LTXInstallStatus | null = null;


export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = { ...DEFAULT_CONFIG, repoDir: path.join(dataDir, "ltx-video"), outputDir: path.join(dataDir, "ltx-video", "outputs") };
  installStatus = detectInstallation(config);

  if (installStatus.ready) { config = { ...config, pythonPath: installStatus.pythonPath }; initScheduler(config); log.info(`LTX-2 ready`); }
  else { log.warn(`LTX-2 not available: ${installStatus.errors.join("; ")}`); }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function generateVideo(params: {
  citizenId: string; citizenName: string; prompt: string; negativePrompt?: string;
  resolution?: string; durationSec?: number; fps?: number; withAudio?: boolean; seed?: number;
}): VideoJob | null {
  if (!installStatus?.ready) {return null;}
  return submitT2VJob({ citizenId: params.citizenId, citizenName: params.citizenName, request: {
    prompt: params.prompt, negativePrompt: params.negativePrompt,
    resolution: (params.resolution as "720p" | "1080p" | "4K") ?? DEFAULT_VIDEO_PARAMS.resolution,
    durationSec: params.durationSec ?? DEFAULT_VIDEO_PARAMS.durationSec,
    fps: params.fps ?? DEFAULT_VIDEO_PARAMS.fps,
    withAudio: params.withAudio ?? DEFAULT_VIDEO_PARAMS.withAudio,
    seed: params.seed ?? DEFAULT_VIDEO_PARAMS.seed,
  }});
}

export function imageToVideo(params: {
  citizenId: string; citizenName: string; imagePath: string; prompt?: string; durationSec?: number; resolution?: string;
}): VideoJob | null {
  if (!installStatus?.ready) {return null;}
  return submitI2VJob({ citizenId: params.citizenId, citizenName: params.citizenName, request: {
    imagePath: params.imagePath, prompt: params.prompt, durationSec: params.durationSec ?? 5,
    resolution: (params.resolution as "720p" | "1080p" | "4K") ?? "1080p",
  }});
}

export function getJobStatus(jobId: string): VideoJob | undefined { return getJob(jobId); }
export { cancelJob } from "../application/video-scheduler.ts";
export function getQueueStatus(): QueueStatus { return schedulerQueueStatus(); }
export function isReady(): boolean { return installStatus?.ready ?? false; }
