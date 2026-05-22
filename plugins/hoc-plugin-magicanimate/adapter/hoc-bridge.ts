/**
 * Adapter — HoC Bridge (MagicAnimate)
 *
 * Manages global state, installation status, and exposes
 * MagicAnimate capabilities to the HoC runtime.
 *
 * ZERO-CONFIG: On init, automatically:
 *   1. Detects Python 3 + CUDA
 *   2. Auto-clones the repository
 *   3. Installs pip requirements
 *   4. Downloads HuggingFace model checkpoints
 */

import * as path from "node:path";
import {
    cancelJob as schedulerCancel, getJob, getQueueStatus as schedulerQueueStatus, initScheduler,
    submitJob as scheduleJob
} from "../application/animation-scheduler.ts";
import { composeMagicAnimatePrompt } from "../application/prompt-composer.ts";
import type {
    AnimationJob,
    AnimationRequest, MagicAnimateConfig, QueueStatus
} from "../domain/types.ts";
import { DEFAULT_ANIMATION_PARAMS, DEFAULT_CONFIG } from "../domain/types.ts";
import {
    detectInstallation,
    type MagicAnimateInstallStatus
} from "../infrastructure/magicanimate-engine.ts";

// ─── Global State ───────────────────────────────────────────────

let config: MagicAnimateConfig = { ...DEFAULT_CONFIG };
let installStatus: MagicAnimateInstallStatus | null = null;
let initialized = false;

// ─── Initialization ─────────────────────────────────────────────

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = {
    ...DEFAULT_CONFIG,
    repoDir: path.join(dataDir, "magic-animate"),
    modelsDir: path.join(dataDir, "magic-animate", "pretrained_models"),
    outputDir: path.join(dataDir, "magic-animate", "outputs"),
    pythonPath: "python",
  };

  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    config = { ...config, pythonPath: installStatus.pythonPath };
    initScheduler(config);
    const details: string[] = [];
    if (installStatus.autoClonedRepo) {
      details.push("auto-cloned repo");
    }
    if (installStatus.modelsReady) {
      details.push("models ready");
    }
    log.info(`MagicAnimate ready — ${details.join(", ")}`);
  } else {
    log.warn(`MagicAnimate not available: ${installStatus.errors.join("; ")}`);
  }

  return { ready: installStatus.ready, errors: installStatus.errors };
}

// ─── Prompt Injection ───────────────────────────────────────────

export function getMagicAnimatePromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeMagicAnimatePrompt(specialization ?? "");
}

// ─── Animation Operations ───────────────────────────────────────

export function animate(params: {
  citizenId: string;
  citizenName: string;
  referenceImagePath: string;
  motionSource: string;
  motionType?: string;
  numFrames?: number;
  fps?: number;
  seed?: number;
  guidanceScale?: number;
  numInferenceSteps?: number;
}): AnimationJob | null {
  if (!installStatus?.ready) {
    return null;
  }

  const request: AnimationRequest = {
    referenceImagePath: params.referenceImagePath,
    motionSource: params.motionSource,
    motionType:
      (params.motionType as AnimationRequest["motionType"]) ?? DEFAULT_ANIMATION_PARAMS.motionType,
    numFrames: params.numFrames ?? DEFAULT_ANIMATION_PARAMS.numFrames,
    fps: params.fps ?? DEFAULT_ANIMATION_PARAMS.fps,
    width: DEFAULT_ANIMATION_PARAMS.width,
    height: DEFAULT_ANIMATION_PARAMS.height,
    seed: params.seed ?? DEFAULT_ANIMATION_PARAMS.seed,
    guidanceScale: params.guidanceScale ?? DEFAULT_ANIMATION_PARAMS.guidanceScale,
    numInferenceSteps: params.numInferenceSteps ?? DEFAULT_ANIMATION_PARAMS.numInferenceSteps,
  };

  return scheduleJob({
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    request,
  });
}

// ─── Job Management ─────────────────────────────────────────────

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
