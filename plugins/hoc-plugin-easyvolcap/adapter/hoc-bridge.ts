/**
 * Adapter — HoC Bridge (EasyVolcap)
 *
 * ZERO-CONFIG: Auto-clones repo, installs deps.
 */

import * as path from "node:path";
import { composeEasyVolcapPrompt } from "../application/prompt-composer.ts";
import {
    cancelJob as schedulerCancel, getJob, getQueueStatus as schedulerQueueStatus, initScheduler,
    submitJob as scheduleJob
} from "../application/render-scheduler.ts";
import type { EasyVolcapConfig, QueueStatus, RenderJob, RenderMethod, RenderRequest, TaskType } from "../domain/types.ts";
import { DEFAULT_CONFIG, DEFAULT_RENDER_PARAMS } from "../domain/types.ts";
import {
    detectInstallation,
    type EasyVolcapInstallStatus
} from "../infrastructure/volcap-engine.ts";

let config: EasyVolcapConfig = { ...DEFAULT_CONFIG };
let installStatus: EasyVolcapInstallStatus | null = null;
let initialized = false;

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = {
    ...DEFAULT_CONFIG,
    repoDir: path.join(dataDir, "EasyVolcap"),
    outputDir: path.join(dataDir, "EasyVolcap", "data", "output"),
  };
  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    config = { ...config, pythonPath: installStatus.pythonPath };
    initScheduler(config);
    log.info(`EasyVolcap ready — python=${installStatus.pythonPath}`);
  } else {
    log.warn(`EasyVolcap not available: ${installStatus.errors.join("; ")}`);
  }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function getEasyVolcapPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeEasyVolcapPrompt(specialization ?? "");
}

export function runVolcap(params: {
  citizenId: string;
  citizenName: string;
  method?: string;
  taskType?: string;
  dataRoot: string;
  expName: string;
  epochs?: number;
}): RenderJob | null {
  if (!installStatus?.ready) {
    return null;
  }
  const request: RenderRequest = {
    method: (params.method as RenderMethod) ?? DEFAULT_RENDER_PARAMS.method,
    taskType: (params.taskType as TaskType) ?? DEFAULT_RENDER_PARAMS.taskType,
    dataRoot: params.dataRoot,
    expName: params.expName,
    epochs: params.epochs ?? DEFAULT_RENDER_PARAMS.epochs,
    renderNovelView: DEFAULT_RENDER_PARAMS.renderNovelView,
    exportMesh: DEFAULT_RENDER_PARAMS.exportMesh,
  };
  return scheduleJob({ citizenId: params.citizenId, citizenName: params.citizenName, request });
}

export function getJobStatus(jobId: string): RenderJob | undefined {
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
