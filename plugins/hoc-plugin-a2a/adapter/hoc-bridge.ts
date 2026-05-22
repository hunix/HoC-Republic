/**
 * Adapter — HoC Bridge (A2A)
 *
 * ZERO-CONFIG: A2A is pure Node.js — always available.
 */

import { composeA2APrompt } from "../application/prompt-composer.ts";
import {
    cancelTask as schedulerCancel,
    getQueueStatus as schedulerQueueStatus, getTaskStatus as schedulerTaskStatus, initScheduler,
    submitTask as scheduleTask
} from "../application/task-scheduler.ts";
import type { A2AConfig, A2AMessage, A2ATask, AgentCard, QueueStatus } from "../domain/types.ts";
import { DEFAULT_CONFIG } from "../domain/types.ts";
import {
    detectInstallation, discoverAgent as engineDiscover,
    getDiscoveredAgents, type A2AInstallStatus
} from "../infrastructure/a2a-engine.ts";

let config: A2AConfig = { ...DEFAULT_CONFIG };
let installStatus: A2AInstallStatus | null = null;
let initialized = false;

export function initBridge(
  _dataDir: string,
  log: { info: (msg: string) => void; warn: (msg: string) => void },
): { ready: boolean; errors: string[] } {
  config = { ...DEFAULT_CONFIG };
  installStatus = detectInstallation(config);
  initialized = true;
  initScheduler(config);
  log.info(`A2A ready — port=${config.serverPort}`);
  return { ready: installStatus.ready, errors: installStatus.errors };
}

export function getA2APromptInjection(specialization?: string): string {
  if (!initialized) {
    return "";
  }
  return composeA2APrompt(specialization ?? "");
}

export async function discoverAgent(url: string): Promise<AgentCard | null> {
  return engineDiscover(url);
}

export function listAgents(): AgentCard[] {
  return getDiscoveredAgents();
}

export function sendTask(params: {
  citizenId: string;
  citizenName: string;
  targetUrl: string;
  message: string;
}): A2ATask {
  const messages: A2AMessage[] = [
    {
      role: "user",
      parts: [{ type: "text", text: params.message }],
    },
  ];
  return scheduleTask({
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    targetUrl: params.targetUrl,
    messages,
  });
}

export function getTaskStatus(taskId: string): A2ATask | undefined {
  return schedulerTaskStatus(taskId);
}
export function cancelTask(taskId: string): boolean {
  return schedulerCancel(taskId);
}
export function getQueueStatus(): QueueStatus {
  return schedulerQueueStatus();
}
export function isReady(): boolean {
  return installStatus?.ready ?? false;
}
