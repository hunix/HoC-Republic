/**
 * Application — Agent Scheduler
 *
 * Manages a queue of AutoGPT agent executions.
 * Respects maxConcurrentExecutions from config.
 */

import type { AgentExecution, AutoGPTConfig, ExecutionStatus } from "../domain/types.ts";
import {
    cancelExecution as engineCancelExecution, getExecution as engineGetExecution, startAgent as engineStartAgent
} from "../infrastructure/autogpt-engine.ts";

// ─── State ──────────────────────────────────────────────────────

const executions = new Map<string, AgentExecution>();
let activeCount = 0;
let config: AutoGPTConfig | null = null;
let nextId = 1;

// ─── Lifecycle ──────────────────────────────────────────────────

export function initScheduler(cfg: AutoGPTConfig): void {
  config = cfg;
}

// ─── Execution Submission ───────────────────────────────────────

export async function submitExecution(params: {
  citizenId: string;
  citizenName: string;
  agentId: string;
  agentName: string;
  input?: Record<string, unknown>;
}): Promise<AgentExecution> {
  if (!config) {
    throw new Error("Scheduler not initialized");
  }

  const id = `exec-${Date.now()}-${nextId++}`;

  const execution: AgentExecution = {
    id,
    agentId: params.agentId,
    agentName: params.agentName,
    citizenId: params.citizenId,
    citizenName: params.citizenName,
    status: "queued",
    input: params.input ?? {},
    startedAt: Date.now(),
    steps: [],
  };

  executions.set(id, execution);

  // Try to start immediately if under concurrency limit
  if (activeCount < config.maxConcurrentExecutions) {
    await runExecution(execution);
  }

  return execution;
}

async function runExecution(execution: AgentExecution): Promise<void> {
  if (!config) {
    return;
  }

  activeCount++;
  execution.status = "running";

  const result = await engineStartAgent(config, execution.agentId, execution.input);
  if (result.error) {
    execution.status = "failed";
    execution.error = result.error;
    execution.completedAt = Date.now();
    activeCount--;
    drainQueue();
    return;
  }

  // Merge server-side execution data
  if (result.execution) {
    execution.output = result.execution.output;
    execution.status = result.execution.status;
    if (result.execution.completedAt) {
      execution.completedAt = result.execution.completedAt;
    }
  } else {
    execution.status = "completed";
    execution.completedAt = Date.now();
  }

  activeCount--;
  drainQueue();
}

function drainQueue(): void {
  if (!config || activeCount >= config.maxConcurrentExecutions) {
    return;
  }

  const queued = Array.from(executions.values()).filter((e) => e.status === "queued");
  queued.sort((a, b) => a.startedAt - b.startedAt);

  for (const exec of queued) {
    if (activeCount >= config.maxConcurrentExecutions) {
      break;
    }
    void runExecution(exec);
  }
}

// ─── Execution Management ───────────────────────────────────────

export function getExecution(id: string): AgentExecution | undefined {
  return executions.get(id);
}

export async function cancelExecution(id: string): Promise<boolean> {
  const exec = executions.get(id);
  if (!exec || !config) {
    return false;
  }

  if (exec.status === "queued") {
    exec.status = "cancelled";
    exec.completedAt = Date.now();
    return true;
  }

  if (exec.status === "running") {
    const result = await engineCancelExecution(config, id);
    exec.status = "cancelled";
    exec.completedAt = Date.now();
    activeCount = Math.max(0, activeCount - 1);
    drainQueue();
    return result.cancelled;
  }

  return false;
}

export async function refreshExecution(id: string): Promise<AgentExecution | undefined> {
  const exec = executions.get(id);
  if (!exec || !config || exec.status !== "running") {
    return exec;
  }

  const result = await engineGetExecution(config, id);
  if (result.execution) {
    exec.status = result.execution.status;
    exec.output = result.execution.output;
    if (result.execution.completedAt) {
      exec.completedAt = result.execution.completedAt;
    }
  }
  return exec;
}

export function getQueuedCount(): number {
  return Array.from(executions.values()).filter((e) => e.status === "queued").length;
}

export function getRunningCount(): number {
  return activeCount;
}

export function getAllExecutions(): AgentExecution[] {
  return Array.from(executions.values());
}

export function getExecutionsByStatus(status: ExecutionStatus): AgentExecution[] {
  return Array.from(executions.values()).filter((e) => e.status === status);
}
