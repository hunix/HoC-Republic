/**
 * Adapter — HoC Bridge (AI Scientist)
 *
 * ZERO-CONFIG: Auto-clones repo, installs deps.
 */

import * as path from "node:path";
import { composeAIScientistPrompt } from "../application/prompt-composer.ts";
import {
    cancelJob as schedulerCancel, getJob, getQueueStatus as schedulerQueueStatus, initScheduler,
    submitJob as scheduleJob
} from "../application/research-scheduler.ts";
import type {
    AIScientistConfig, QueueStatus, ResearchJob,
    ResearchRequest, ResearchTemplate
} from "../domain/types.ts";
import { DEFAULT_CONFIG, DEFAULT_RESEARCH_PARAMS } from "../domain/types.ts";
import {
    detectInstallation,
    type AIScientistInstallStatus
} from "../infrastructure/scientist-engine.ts";

let config: AIScientistConfig = { ...DEFAULT_CONFIG };
let installStatus: AIScientistInstallStatus | null = null;
let initialized = false;

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = {
    ...DEFAULT_CONFIG,
    repoDir: path.join(dataDir, "AI-Scientist"),
    outputDir: path.join(dataDir, "AI-Scientist", "results"),
  };
  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    config = { ...config, pythonPath: installStatus.pythonPath };
    initScheduler(config);
    log.info(`AI Scientist ready — python=${installStatus.pythonPath}`);
  } else {
    log.warn(`AI Scientist not available: ${installStatus.errors.join("; ")}`);
  }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function getAIScientistPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeAIScientistPrompt(specialization ?? "");
}

export function launchResearch(params: {
  citizenId: string;
  citizenName: string;
  template: string;
  topic?: string;
  model?: string;
  numIdeas?: number;
}): ResearchJob | null {
  if (!installStatus?.ready) {
    return null;
  }
  const request: ResearchRequest = {
    template: (params.template as ResearchTemplate) ?? "nanoGPT",
    topic: params.topic,
    model: params.model ?? DEFAULT_RESEARCH_PARAMS.model,
    numIdeas: params.numIdeas ?? DEFAULT_RESEARCH_PARAMS.numIdeas,
    skipWriteup: false,
  };
  return scheduleJob({ citizenId: params.citizenId, citizenName: params.citizenName, request });
}

export function getJobStatus(jobId: string): ResearchJob | undefined {
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
