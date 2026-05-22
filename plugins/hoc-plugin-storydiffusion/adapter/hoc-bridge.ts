/**
 * Adapter — HoC Bridge (StoryDiffusion)
 *
 * Manages global state, installation status, and exposes
 * StoryDiffusion capabilities to the HoC runtime.
 *
 * ZERO-CONFIG: On init, automatically:
 *   1. Detects Python 3 + PyTorch
 *   2. Auto-clones the repository
 *   3. Installs pip requirements
 */

import * as path from "node:path";
import { composeStoryDiffusionPrompt } from "../application/prompt-composer.ts";
import {
    cancelJob as schedulerCancel, getJob, getQueueStatus as schedulerQueueStatus, initScheduler,
    submitJob as scheduleJob
} from "../application/story-scheduler.ts";
import type {
    QueueStatus, StoryDiffusionConfig,
    StoryJob,
    StoryRequest,
    StoryScene
} from "../domain/types.ts";
import { DEFAULT_CONFIG, DEFAULT_STORY_PARAMS } from "../domain/types.ts";
import {
    detectInstallation,
    type StoryDiffusionInstallStatus
} from "../infrastructure/storydiffusion-engine.ts";

// ─── Global State ───────────────────────────────────────────────

let config: StoryDiffusionConfig = { ...DEFAULT_CONFIG };
let installStatus: StoryDiffusionInstallStatus | null = null;
let initialized = false;

// ─── Initialization ─────────────────────────────────────────────

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = {
    ...DEFAULT_CONFIG,
    repoDir: path.join(dataDir, "StoryDiffusion"),
    outputDir: path.join(dataDir, "StoryDiffusion", "outputs"),
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
    if (installStatus.depsInstalled) {
      details.push("deps installed");
    }
    log.info(`StoryDiffusion ready — ${details.join(", ")}`);
  } else {
    log.warn(`StoryDiffusion not available: ${installStatus.errors.join("; ")}`);
  }

  return { ready: installStatus.ready, errors: installStatus.errors };
}

// ─── Prompt Injection ───────────────────────────────────────────

export function getStoryDiffusionPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeStoryDiffusionPrompt(specialization ?? "");
}

// ─── Generation Operations ──────────────────────────────────────

export function generateStory(params: {
  citizenId: string;
  citizenName: string;
  scenes: StoryScene[];
  mode?: string;
  baseModel?: string;
  width?: number;
  height?: number;
  seed?: number;
  guidanceScale?: number;
  numInferenceSteps?: number;
  stylePrompt?: string;
  comicLayout?: string;
}): StoryJob | null {
  if (!installStatus?.ready) {
    return null;
  }

  const request: StoryRequest = {
    scenes: params.scenes,
    mode: (params.mode as StoryRequest["mode"]) ?? DEFAULT_STORY_PARAMS.mode,
    baseModel: (params.baseModel as StoryRequest["baseModel"]) ?? DEFAULT_STORY_PARAMS.baseModel,
    width: params.width ?? DEFAULT_STORY_PARAMS.width,
    height: params.height ?? DEFAULT_STORY_PARAMS.height,
    seed: params.seed ?? DEFAULT_STORY_PARAMS.seed,
    guidanceScale: params.guidanceScale ?? DEFAULT_STORY_PARAMS.guidanceScale,
    numInferenceSteps: params.numInferenceSteps ?? DEFAULT_STORY_PARAMS.numInferenceSteps,
    stylePrompt: params.stylePrompt,
    comicLayout:
      (params.comicLayout as StoryRequest["comicLayout"]) ?? DEFAULT_STORY_PARAMS.comicLayout,
  };

  return scheduleJob({
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    request,
  });
}

// ─── Job Management ─────────────────────────────────────────────

export function getJobStatus(jobId: string): StoryJob | undefined {
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
