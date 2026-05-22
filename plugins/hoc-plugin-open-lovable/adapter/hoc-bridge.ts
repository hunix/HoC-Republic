/**
 * Adapter — HoC Bridge (Open Lovable)
 *
 * ZERO-CONFIG: Auto-clones repo, installs deps on first use.
 */

import * as path from "node:path";
import type {
  AIProvider,
  CloneRequest,
  GenerationJob,
  LovableConfig,
  QueueStatus,
  SandboxProvider,
} from "../domain/types.ts";
import {
  cancelJob as schedulerCancel,
  getJob,
  getQueueStatus as schedulerQueueStatus,
  initScheduler,
  listAllJobs,
  seedDemoData,
  submitCloneJob,
} from "../application/generation-scheduler.ts";
import { composeLovablePrompt } from "../application/prompt-composer.ts";
import { DEFAULT_CLONE_PARAMS, DEFAULT_CONFIG } from "../domain/types.ts";
import { detectInstallation, type LovableInstallStatus } from "../infrastructure/lovable-engine.ts";

let config: LovableConfig = { ...DEFAULT_CONFIG };
let installStatus: LovableInstallStatus | null = null;
let initialized = false;
let demoMode = false;

export function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
  apiKeys?: {
    firecrawl?: string;
    gemini?: string;
    anthropic?: string;
    openai?: string;
    groq?: string;
  },
): { ready: boolean; errors: string[] } {
  config = {
    ...DEFAULT_CONFIG,
    repoDir: path.join(dataDir, "open-lovable"),
    outputDir: path.join(dataDir, "open-lovable", "outputs"),
    firecrawlApiKey: apiKeys?.firecrawl ?? process.env.FIRECRAWL_API_KEY,
    geminiApiKey: apiKeys?.gemini ?? process.env.GEMINI_API_KEY,
    anthropicApiKey: apiKeys?.anthropic ?? process.env.ANTHROPIC_API_KEY,
    openaiApiKey: apiKeys?.openai ?? process.env.OPENAI_API_KEY,
    groqApiKey: apiKeys?.groq ?? process.env.GROQ_API_KEY,
  };
  installStatus = detectInstallation(config);
  initialized = true;

  if (installStatus.ready) {
    initScheduler(config);
    log.info("Open Lovable ready");
  } else {
    // Auto-seed demo data so the UI is functional even without the backend
    demoMode = true;
    seedDemoData();
    log.warn(
      `Open Lovable backend not available — demo mode active (${installStatus.errors.join("; ")})`,
    );
  }
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function getLovablePromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeLovablePrompt(specialization ?? "");
}

export function cloneSite(params: {
  citizenId: string;
  citizenName: string;
  url: string;
  provider?: string;
  sandbox?: string;
  instructions?: string;
}): GenerationJob | null {
  if (!installStatus?.ready) {
    return null;
  }
  const request: CloneRequest = {
    url: params.url,
    provider: (params.provider as AIProvider) ?? DEFAULT_CLONE_PARAMS.provider,
    sandbox: (params.sandbox as SandboxProvider) ?? DEFAULT_CLONE_PARAMS.sandbox,
    instructions: params.instructions,
  };
  return submitCloneJob({ citizenId: params.citizenId, citizenName: params.citizenName, request });
}

export function getJobStatus(jobId: string): GenerationJob | undefined {
  return getJob(jobId);
}
export function cancelJob(jobId: string): boolean {
  return schedulerCancel(jobId);
}
export function getQueueStatus(): QueueStatus {
  return schedulerQueueStatus();
}
export function listJobs(): GenerationJob[] {
  return listAllJobs();
}
export function isReady(): boolean {
  return (installStatus?.ready ?? false) || demoMode;
}
export function isDemoMode(): boolean {
  return demoMode;
}
