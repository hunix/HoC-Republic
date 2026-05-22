/**
 * Adapter — HoC Bridge
 *
 * Manages global state, installation status, and exposes
 * DeepFaceLab capabilities to the HoC runtime through
 * a clean interface. Public API for the entry point and
 * citizen prompt integration.
 */

import * as path from "node:path";
import {
    cancelPipeline, createPipeline, getPipeline, getQueueStatus, listPipelines, startPipeline, tickPipelines
} from "../application/pipeline-orchestrator.ts";
import { composeDflPrompt } from "../application/prompt-composer.ts";
import type {
    DflConfig,
    DflPipeline,
    DflPipelineStage,
    DflQueueStatus,
    PipelineStatus
} from "../domain/types.ts";
import { DEFAULT_CONFIG } from "../domain/types.ts";
import {
    detectInstallation,
    findPython,
    type InstallationStatus
} from "../infrastructure/deepfacelab-cli.ts";

// ─── Global State ───────────────────────────────────────────────

let config: DflConfig = { ...DEFAULT_CONFIG };
let installStatus: InstallationStatus | null = null;
let initialized = false;

// ─── Lifecycle ──────────────────────────────────────────────────

export function initBridge(dataDir: string): InstallationStatus {
  // Auto-detect Python
  const pythonPath = process.env.PYTHON_PATH || findPython();
  const installPath = process.env.DEEPFACELAB_PATH || path.join(dataDir, "DeepFaceLab");

  config = {
    ...DEFAULT_CONFIG,
    pythonPath,
    installPath,
    workspaceRoot: path.join(dataDir, "dfl-workspaces"),
  };

  installStatus = detectInstallation(config);
  initialized = true;
  return installStatus;
}

export function isInstalled(): boolean {
  return installStatus?.installed ?? false;
}

export function getConfig(): DflConfig {
  return config;
}

// ─── Pipeline Operations ────────────────────────────────────────

export function submitPipeline(
  citizenId: string,
  citizenName: string,
  sourceVideo: string,
  targetVideo: string,
  modelName: string,
  stages?: DflPipelineStage[],
): DflPipeline {
  if (!initialized || !installStatus?.installed) {
    throw new Error("DeepFaceLab not installed or bridge not initialized");
  }
  return createPipeline(
    config,
    citizenId,
    citizenName,
    sourceVideo,
    targetVideo,
    modelName,
    stages,
  );
}

export function startDflPipeline(pipelineId: string): boolean {
  return startPipeline(config, pipelineId);
}

export function cancelDflPipeline(pipelineId: string): boolean {
  return cancelPipeline(pipelineId);
}

export function getDflPipelineStatus(pipelineId: string): DflPipeline | undefined {
  return getPipeline(pipelineId);
}

export function listDflPipelines(status?: PipelineStatus): DflPipeline[] {
  return listPipelines(status);
}

export function tickProcessPipelines(): void {
  if (!initialized) {
    return;
  }
  tickPipelines(config);
}

export function getDflQueueStatus(): DflQueueStatus {
  const q = getQueueStatus();
  return {
    totalPipelines: q.total,
    runningPipelines: q.running,
    completedPipelines: q.completed,
    failedPipelines: q.failed,
    installed: installStatus?.installed ?? false,
  };
}

export function getAvailableModels(): string[] {
  return installStatus?.modelsFound ?? [];
}

// ─── Prompt Injection ───────────────────────────────────────────

export function getDflPromptInjection(specialization?: string): string {
  if (!installStatus?.installed) {
    return "";
  }
  return composeDflPrompt(specialization);
}
