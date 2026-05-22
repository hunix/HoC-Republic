/**
 * Adapter — HoC Bridge (DGM)
 *
 * ZERO-CONFIG: Auto-clones repo, installs deps.
 */

import * as path from "node:path";
import {
    cancelJob as schedulerCancel, getJob, getQueueStatus as schedulerQueueStatus, initScheduler,
    submitJob as scheduleJob
} from "../application/evolution-scheduler.ts";
import { composeDGMPrompt } from "../application/prompt-composer.ts";
import type { BenchmarkType, DGMConfig, EvolutionJob, EvolutionRequest, QueueStatus } from "../domain/types.ts";
import { DEFAULT_CONFIG, DEFAULT_EVOLUTION_PARAMS } from "../domain/types.ts";
import { detectInstallation, type DGMInstallStatus } from "../infrastructure/dgm-engine.ts";

let config: DGMConfig = { ...DEFAULT_CONFIG };
let installStatus: DGMInstallStatus | null = null;
let initialized = false;

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = {
    ...DEFAULT_CONFIG,
    repoDir: path.join(dataDir, "dgm"),
    outputDir: path.join(dataDir, "dgm", "output_dgm"),
  };
  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    config = { ...config, pythonPath: installStatus.pythonPath };
    initScheduler(config);
    log.info(`DGM ready — python=${installStatus.pythonPath}`);
  } else {
    log.warn(`DGM not available: ${installStatus.errors.join("; ")}`);
  }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function getDGMPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeDGMPrompt(specialization ?? "");
}

export function startEvolution(params: {
  citizenId: string;
  citizenName: string;
  benchmark: string;
  generations?: number;
  populationSize?: number;
  model?: string;
}): EvolutionJob | null {
  if (!installStatus?.ready) {
    return null;
  }
  const request: EvolutionRequest = {
    benchmark: (params.benchmark as BenchmarkType) ?? "swe-bench",
    generations: params.generations ?? DEFAULT_EVOLUTION_PARAMS.generations,
    populationSize: params.populationSize ?? DEFAULT_EVOLUTION_PARAMS.populationSize,
    model: params.model ?? DEFAULT_EVOLUTION_PARAMS.model,
  };
  return scheduleJob({ citizenId: params.citizenId, citizenName: params.citizenName, request });
}

export function getJobStatus(jobId: string): EvolutionJob | undefined {
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
