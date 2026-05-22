/**
 * Adapter — HoC Bridge (MMAudio)
 *
 * ZERO-CONFIG: Auto-clones repo, installs from pyproject.toml.
 */

import * as path from "node:path";
import { composeMMAudioPrompt } from "../application/prompt-composer.ts";
import {
    cancelJob as schedulerCancel, getJob, getQueueStatus as schedulerQueueStatus, initScheduler,
    submitJob as scheduleJob
} from "../application/synthesis-scheduler.ts";
import type {
    MMAudioConfig, QueueStatus, SynthesisJob, SynthesisMode, SynthesisRequest
} from "../domain/types.ts";
import { DEFAULT_CONFIG, DEFAULT_SYNTHESIS_PARAMS } from "../domain/types.ts";
import { detectInstallation, type MMAudioInstallStatus } from "../infrastructure/mmaudio-engine.ts";

let config: MMAudioConfig = { ...DEFAULT_CONFIG };
let installStatus: MMAudioInstallStatus | null = null;
let initialized = false;

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = {
    ...DEFAULT_CONFIG,
    repoDir: path.join(dataDir, "MMAudio"),
    outputDir: path.join(dataDir, "MMAudio", "output"),
  };
  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    config = { ...config, pythonPath: installStatus.pythonPath };
    initScheduler(config);
    log.info(`MMAudio ready — python=${installStatus.pythonPath}`);
  } else {
    log.warn(`MMAudio not available: ${installStatus.errors.join("; ")}`);
  }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function getMMAudioPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeMMAudioPrompt(specialization ?? "");
}

export function synthesizeAudio(params: {
  citizenId: string;
  citizenName: string;
  videoPath?: string;
  prompt?: string;
  duration?: number;
  seed?: number;
}): SynthesisJob | null {
  if (!installStatus?.ready) {
    return null;
  }
  const mode: SynthesisMode =
    params.videoPath && params.prompt
      ? "video-text-to-audio"
      : params.videoPath
        ? "video-to-audio"
        : "text-to-audio";
  const request: SynthesisRequest = {
    mode,
    videoPath: params.videoPath,
    prompt: params.prompt,
    duration: params.duration ?? DEFAULT_SYNTHESIS_PARAMS.duration,
    seed: params.seed ?? DEFAULT_SYNTHESIS_PARAMS.seed,
    numSteps: DEFAULT_SYNTHESIS_PARAMS.numSteps,
    cfgStrength: DEFAULT_SYNTHESIS_PARAMS.cfgStrength,
  };
  return scheduleJob({ citizenId: params.citizenId, citizenName: params.citizenName, request });
}

export function getJobStatus(jobId: string): SynthesisJob | undefined {
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
