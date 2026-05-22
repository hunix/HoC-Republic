/**
 * Infrastructure — A2A Engine
 *
 * Manages Agent2Agent protocol:
 *   1. Agent Card discovery
 *   2. JSON-RPC 2.0 message handling
 *   3. Task send/receive
 *   4. SSE streaming support
 */

import type { A2AConfig, A2AMessage, A2ATask, AgentCard, TaskState } from "../domain/types.ts";

const tasks = new Map<string, A2ATask>();
const remoteAgents = new Map<string, AgentCard>();
let nextTaskId = 1;

// ─── Agent Card Discovery ───────────────────────────────────────

export async function discoverAgent(url: string): Promise<AgentCard | null> {
  const cardUrl = url.replace(/\/$/, "") + "/.well-known/agent.json";
  try {
    const response = await fetch(cardUrl, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      return null;
    }
    const card = (await response.json()) as AgentCard;
    remoteAgents.set(card.name, card);
    return card;
  } catch {
    return null;
  }
}

export function getDiscoveredAgents(): AgentCard[] {
  return Array.from(remoteAgents.values());
}

// ─── Task Management ────────────────────────────────────────────

export function createTask(messages: A2AMessage[]): A2ATask {
  const id = `a2a-${Date.now()}-${nextTaskId++}`;
  const task: A2ATask = {
    id,
    status: "submitted",
    messages: [...messages],
    artifacts: [],
    createdAt: Date.now(),
  };
  tasks.set(id, task);
  return task;
}

export function getTask(id: string): A2ATask | undefined {
  return tasks.get(id);
}

export function updateTaskStatus(id: string, status: TaskState): boolean {
  const task = tasks.get(id);
  if (!task) {
    return false;
  }
  task.status = status;
  if (status === "completed" || status === "failed" || status === "canceled") {
    task.completedAt = Date.now();
  }
  return true;
}

// ─── JSON-RPC Send ──────────────────────────────────────────────

export async function sendTask(agentUrl: string, messages: A2AMessage[]): Promise<A2ATask | null> {
  try {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: `rpc-${Date.now()}`,
      method: "tasks/send",
      params: { id: `a2a-${Date.now()}-${nextTaskId++}`, message: messages[0] },
    });
    const response = await fetch(agentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      return null;
    }
    const result = (await response.json()) as { result?: A2ATask };
    return result.result ?? null;
  } catch {
    return null;
  }
}

// ─── A2A Server ─────────────────────────────────────────────────

export interface A2AInstallStatus {
  ready: boolean;
  errors: string[];
}

export function detectInstallation(_config: A2AConfig): A2AInstallStatus {
  // A2A is pure Node.js — always available
  return { ready: true, errors: [] };
}

export function getQueueStatus(): {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
} {
  const all = Array.from(tasks.values());
  return {
    total: all.length,
    queued: all.filter((t) => t.status === "submitted").length,
    running: all.filter((t) => t.status === "working").length,
    completed: all.filter((t) => t.status === "completed").length,
    failed: all.filter((t) => t.status === "failed").length,
  };
}
