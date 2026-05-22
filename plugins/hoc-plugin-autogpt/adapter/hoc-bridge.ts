/**
 * Adapter — HoC Bridge
 *
 * Manages global state, installation status, and exposes
 * AutoGPT platform capabilities to the HoC runtime.
 *
 * ZERO-CONFIG: On init, automatically:
 *   1. Auto-clones the AutoGPT repository
 *   2. Checks Docker availability
 *   3. Probes the AutoGPT Server API
 */

import * as path from "node:path";
import {
    cancelExecution as schedulerCancel, getExecution, initScheduler,
    submitExecution as scheduleExecution
} from "../application/agent-scheduler.ts";
import { composeAutoGPTPrompt } from "../application/prompt-composer.ts";
import type {
    AgentExecution, AutoGPTAgent, AutoGPTConfig, PlatformStatus,
    Workflow
} from "../domain/types.ts";
import { DEFAULT_CONFIG } from "../domain/types.ts";
import {
    createAgent as engineCreateAgent, detectInstallation, getAgent as engineGetAgent, getPlatformStatus as engineGetPlatformStatus, getWorkflow as engineGetWorkflow, listAgents as engineListAgents, listWorkflows as engineListWorkflows, stopAgent as engineStopAgent, type AutoGPTInstallStatus
} from "../infrastructure/autogpt-engine.ts";

// ─── Global State ───────────────────────────────────────────────

let config: AutoGPTConfig = { ...DEFAULT_CONFIG };
let installStatus: AutoGPTInstallStatus | null = null;
let initialized = false;
let cachedPlatformStatus: PlatformStatus = {
  serverReachable: false,
  totalAgents: 0,
  activeAgents: 0,
  totalExecutions: 0,
  runningExecutions: 0,
  queuedExecutions: 0,
  completedExecutions: 0,
  failedExecutions: 0,
};

// ─── Initialization ─────────────────────────────────────────────

export async function initBridge(
  dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): Promise<{ ready: boolean; errors: string[] }> {
  config = {
    ...DEFAULT_CONFIG,
    serverUrl: process.env.AUTOGPT_SERVER_URL || DEFAULT_CONFIG.serverUrl,
    apiKey: process.env.AUTOGPT_API_KEY || "",
    repoDir: path.join(dataDir, "AutoGPT"),
  };

  installStatus = await detectInstallation(config);
  initialized = true;
  cachedPlatformStatus = await engineGetPlatformStatus(config);

  if (installStatus.ready) {
    initScheduler(config);
    const details: string[] = [];
    if (installStatus.serverReachable) {
      details.push("server reachable");
    }
    if (installStatus.autoClonedRepo) {
      details.push("auto-cloned repo");
    }
    if (installStatus.dockerAvailable) {
      details.push("Docker available");
    }
    log.info(`AutoGPT Platform ready — ${details.join(", ")}`);
  } else {
    log.warn(`AutoGPT Platform not available: ${installStatus.errors.join("; ")}`);
  }

  return { ready: installStatus.ready, errors: installStatus.errors };
}

// ─── Prompt Injection ───────────────────────────────────────────

export function getAutoGPTPromptInjection(specialization?: string): string {
  if (!initialized || !installStatus?.ready) {
    return "";
  }
  return composeAutoGPTPrompt(specialization ?? "", cachedPlatformStatus);
}

// ─── Agent Operations ───────────────────────────────────────────

export async function listAgents(): Promise<{ agents: AutoGPTAgent[]; error?: string }> {
  return engineListAgents(config);
}

export async function createAgent(
  name: string,
  description: string,
): Promise<{ agent?: AutoGPTAgent; error?: string }> {
  return engineCreateAgent(config, name, description);
}

export async function getAgent(agentId: string): Promise<{ agent?: AutoGPTAgent; error?: string }> {
  return engineGetAgent(config, agentId);
}

export async function runAgent(params: {
  citizenId: string;
  citizenName: string;
  agentId: string;
  agentName: string;
  input?: Record<string, unknown>;
}): Promise<AgentExecution | null> {
  if (!installStatus?.ready) {
    return null;
  }
  return scheduleExecution(params);
}

export async function stopAgent(agentId: string): Promise<{ stopped: boolean; error?: string }> {
  return engineStopAgent(config, agentId);
}

// ─── Execution Operations ───────────────────────────────────────

export function getExecutionStatus(executionId: string): AgentExecution | undefined {
  return getExecution(executionId);
}

export async function cancelExecution(executionId: string): Promise<boolean> {
  return schedulerCancel(executionId);
}

// ─── Workflow Operations ────────────────────────────────────────

export async function listWorkflows(): Promise<{ workflows: Workflow[]; error?: string }> {
  return engineListWorkflows(config);
}

export async function getWorkflow(
  workflowId: string,
): Promise<{ workflow?: Workflow; error?: string }> {
  return engineGetWorkflow(config, workflowId);
}

// ─── Status ─────────────────────────────────────────────────────

export async function getPlatformStatusInfo(): Promise<PlatformStatus> {
  return engineGetPlatformStatus(config);
}

export function isReady(): boolean {
  return installStatus?.ready ?? false;
}
