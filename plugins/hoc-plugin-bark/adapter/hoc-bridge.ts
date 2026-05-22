/**
 * Adapter — HoC Bridge (Bark)
 *
 * ZERO-CONFIG: Installs bark, preloads models on first use.
 */

import * as path from "node:path";
import {
    cancelJob as schedulerCancel, getJob, getQueueStatus as schedulerQueueStatus, initScheduler,
    submitJob as scheduleJob
} from "../application/audio-scheduler.ts";
import { composeBarkPrompt } from "../application/prompt-composer.ts";
import type { AudioJob, AudioMode, AudioRequest, BarkConfig, QueueStatus } from "../domain/types.ts";
import { DEFAULT_AUDIO_PARAMS, DEFAULT_CONFIG } from "../domain/types.ts";
import { detectInstallation, type BarkInstallStatus } from "../infrastructure/bark-engine.ts";

let config: BarkConfig = { ...DEFAULT_CONFIG };
let installStatus: BarkInstallStatus | null = null;
let initialized = false;

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = {
    ...DEFAULT_CONFIG,
    outputDir: path.join(dataDir, "bark", "outputs"),
  };
  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    config = { ...config, pythonPath: installStatus.pythonPath };
    initScheduler(config);
    log.info(`Bark ready — python=${installStatus.pythonPath}`);
  } else {
    log.warn(`Bark not available: ${installStatus.errors.join("; ")}`);
  }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function getBarkPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeBarkPrompt(specialization ?? "");
}

export function generate(params: {
  citizenId: string;
  citizenName: string;
  text: string;
  voicePreset?: string;
  mode?: string;
  textTemp?: number;
  waveformTemp?: number;
  seed?: number;
}): AudioJob | null {
  if (!installStatus?.ready) {
    return null;
  }
  const request: AudioRequest = {
    text: params.text,
    voicePreset: params.voicePreset,
    mode: (params.mode as AudioMode) ?? DEFAULT_AUDIO_PARAMS.mode,
    outputFormat: DEFAULT_AUDIO_PARAMS.outputFormat,
    textTemp: params.textTemp ?? DEFAULT_AUDIO_PARAMS.textTemp,
    waveformTemp: params.waveformTemp ?? DEFAULT_AUDIO_PARAMS.waveformTemp,
    seed: params.seed ?? DEFAULT_AUDIO_PARAMS.seed,
  };
  return scheduleJob({ citizenId: params.citizenId, citizenName: params.citizenName, request });
}

export function getJobStatus(jobId: string): AudioJob | undefined {
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
