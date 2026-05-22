/**
 * Adapter — HoC Bridge (Magentic-One)
 *
 * ZERO-CONFIG: Installs autogen-agentchat + extensions on first use.
 */

import * as path from "node:path";
import { composeMagenticPrompt } from "../application/prompt-composer.ts";
import {
    cancelJob as schedulerCancel, getJob, getQueueStatus as schedulerQueueStatus, initScheduler,
    submitJob as scheduleJob
} from "../application/task-scheduler.ts";
import type { AgentRole, MagenticConfig, QueueStatus, TaskJob, TaskRequest } from "../domain/types.ts";
import { DEFAULT_CONFIG, DEFAULT_TASK_PARAMS } from "../domain/types.ts";
import {
    detectInstallation,
    type MagenticInstallStatus
} from "../infrastructure/magentic-engine.ts";

let config: MagenticConfig = { ...DEFAULT_CONFIG };
let installStatus: MagenticInstallStatus | null = null;
let initialized = false;

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = {
    ...DEFAULT_CONFIG,
    repoDir: path.join(dataDir, "magentic-one"),
    outputDir: path.join(dataDir, "magentic-one", "outputs"),
  };
  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    config = { ...config, pythonPath: installStatus.pythonPath };
    initScheduler(config);
    log.info(`Magentic-One ready — python=${installStatus.pythonPath}`);
  } else {
    log.warn(`Magentic-One not available: ${installStatus.errors.join("; ")}`);
  }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function getMagenticPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeMagenticPrompt(specialization ?? "");
}

export function runTask(params: {
  citizenId: string;
  citizenName: string;
  task: string;
  agents?: string[];
  model?: string;
  maxRounds?: number;
}): TaskJob | null {
  if (!installStatus?.ready) {
    return null;
  }
  const request: TaskRequest = {
    task: params.task,
    agents: (params.agents as AgentRole[]) ?? DEFAULT_TASK_PARAMS.agents,
    model: params.model ?? DEFAULT_TASK_PARAMS.model,
    maxRounds: params.maxRounds ?? DEFAULT_TASK_PARAMS.maxRounds,
    maxStalls: DEFAULT_TASK_PARAMS.maxStalls,
    haltOnReply: DEFAULT_TASK_PARAMS.haltOnReply,
  };
  return scheduleJob({ citizenId: params.citizenId, citizenName: params.citizenName, request });
}

export function getJobStatus(jobId: string): TaskJob | undefined {
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
