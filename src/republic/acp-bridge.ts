/**
 * Republic Platform — ACP Bridge (Agent Communication Protocol)
 *
 * Phase 14: Enables cross-framework agent collaboration.
 * Implements a bridge between the republic's internal agent protocol
 * and Cisco's Agent Communication Protocol (ACP), allowing republic
 * citizens to collaborate with agents built in other ecosystems
 * (CrewAI, Smolagents, LangGraph, etc.).
 *
 * Research basis:
 * - Cisco ACP: standardized agent-to-agent communication
 * - Google A2A: agent-to-agent protocol
 *
 * Key capabilities:
 * 1. Register external ACP agent endpoints
 * 2. Send tasks to external agents
 * 3. Handle incoming ACP task requests
 * 4. Track inter-framework collaboration
 */

import { ts, uid } from "./utils.js";

// ─── ACP Types ──────────────────────────────────────────────────

export type ACPTaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface ACPAgentInfo {
  id: string;
  name: string;
  url: string;
  framework: string;
  capabilities: string[];
  registeredAt: string;
  lastSeenAt: string;
  status: "online" | "offline" | "unknown";
}

export interface ACPTask {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  description: string;
  payload: unknown;
  status: ACPTaskStatus;
  result?: unknown;
  error?: string;
  createdAt: string;
  completedAt?: string;
  timeoutMs: number;
}

export interface ACPRequest {
  method: "task/send" | "task/status" | "agent/info" | "agent/capabilities";
  agentId: string;
  payload?: unknown;
}

export interface ACPResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface ACPBridgeDiagnostics {
  registeredAgents: number;
  onlineAgents: number;
  totalTasksSent: number;
  totalTasksReceived: number;
  activeTaskCount: number;
  completedTaskCount: number;
  failedTaskCount: number;
}

// ─── State ──────────────────────────────────────────────────────

const agents = new Map<string, ACPAgentInfo>();
const tasks = new Map<string, ACPTask>();
const MAX_TASKS = 5000;
const DEFAULT_TIMEOUT = 30000;

/** Handler for incoming ACP tasks (set by other modules) */
let incomingTaskHandler: ((task: ACPTask) => Promise<unknown>) | null = null;

// ─── Agent Registration ─────────────────────────────────────────

/**
 * Register an external ACP agent endpoint.
 */
export function registerACPEndpoint(
  agentId: string,
  url: string,
  framework?: string,
  capabilities?: string[],
): ACPAgentInfo {
  const existing = agents.get(agentId);

  if (existing) {
    existing.url = url;
    existing.lastSeenAt = ts();
    existing.status = "online";
    if (framework) {existing.framework = framework;}
    if (capabilities) {existing.capabilities = capabilities;}
    return existing;
  }

  const agent: ACPAgentInfo = {
    id: agentId,
    name: agentId,
    url,
    framework: framework ?? "unknown",
    capabilities: capabilities ?? [],
    registeredAt: ts(),
    lastSeenAt: ts(),
    status: "online",
  };

  agents.set(agentId, agent);
  return agent;
}

/**
 * Unregister an ACP agent.
 */
export function unregisterACPEndpoint(agentId: string): boolean {
  return agents.delete(agentId);
}

/**
 * Get info about a registered agent.
 */
export function getACPAgent(agentId: string): ACPAgentInfo | undefined {
  return agents.get(agentId);
}

/**
 * List all registered ACP agents.
 */
export function listACPAgents(): ACPAgentInfo[] {
  return [...agents.values()];
}

// ─── Task Sending ───────────────────────────────────────────────

/**
 * Send a task to an external ACP agent.
 * Uses HTTP POST to the agent's registered URL.
 */
export async function sendACPTask(
  fromAgentId: string,
  toAgentId: string,
  description: string,
  payload: unknown,
  timeoutMs?: number,
): Promise<ACPTask> {
  const agent = agents.get(toAgentId);

  const task: ACPTask = {
    id: `acp-task-${uid().slice(0, 8)}`,
    fromAgentId,
    toAgentId,
    description,
    payload,
    status: "pending",
    createdAt: ts(),
    timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT,
  };

  tasks.set(task.id, task);

  if (!agent) {
    task.status = "failed";
    task.error = `Agent ${toAgentId} not registered`;
    return task;
  }

  task.status = "running";

  try {
    // Attempt to send via HTTP POST
    const http = await import("node:http");
    const url = new URL(agent.url);

    const result = await new Promise<unknown>((resolve, reject) => {
      const reqBody = JSON.stringify({
        method: "task/send",
        taskId: task.id,
        from: fromAgentId,
        description,
        payload,
      });

      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port || 80,
          path: url.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(reqBody),
          },
          timeout: task.timeoutMs,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk: Buffer) => (data += chunk.toString()));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve({ raw: data });
            }
          });
        },
      );

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("ACP task timeout"));
      });
      req.write(reqBody);
      req.end();
    });

    task.status = "completed";
    task.result = result;
    task.completedAt = ts();
    agent.lastSeenAt = ts();
  } catch (err: unknown) {
    task.status = "failed";
    task.error = err instanceof Error ? err.message : "Send failed";
    agent.status = "offline";
  }

  // Trim task history
  if (tasks.size > MAX_TASKS) {
    const oldestKey = tasks.keys().next().value;
    if (oldestKey) {tasks.delete(oldestKey);}
  }

  return task;
}

/**
 * Get task by ID.
 */
export function getACPTask(taskId: string): ACPTask | undefined {
  return tasks.get(taskId);
}

/**
 * List tasks (optionally filtered by agent).
 */
export function listACPTasks(agentId?: string, limit: number = 20): ACPTask[] {
  let result = [...tasks.values()];
  if (agentId) {
    result = result.filter((t) => t.fromAgentId === agentId || t.toAgentId === agentId);
  }
  return result.slice(-limit);
}

// ─── Incoming Task Handling ─────────────────────────────────────

/**
 * Set the handler for incoming ACP tasks (called by other republic modules).
 */
export function setIncomingTaskHandler(
  handler: (task: ACPTask) => Promise<unknown>,
): void {
  incomingTaskHandler = handler;
}

/**
 * Handle an incoming ACP request from external agents.
 */
export async function handleACPIncoming(req: ACPRequest): Promise<ACPResponse> {
  switch (req.method) {
    case "task/send": {
      const task: ACPTask = {
        id: `acp-inc-${uid().slice(0, 8)}`,
        fromAgentId: req.agentId,
        toAgentId: "republic",
        description: typeof req.payload === "object" && req.payload !== null
          ? (req.payload as { description?: string }).description ?? "Incoming task"
          : "Incoming task",
        payload: req.payload,
        status: "pending",
        createdAt: ts(),
        timeoutMs: DEFAULT_TIMEOUT,
      };

      tasks.set(task.id, task);

      if (incomingTaskHandler) {
        try {
          task.status = "running";
          const result = await incomingTaskHandler(task);
          task.status = "completed";
          task.result = result;
          task.completedAt = ts();
          return { ok: true, data: { taskId: task.id, result } };
        } catch (err: unknown) {
          task.status = "failed";
          task.error = err instanceof Error ? err.message : "Handler failed";
          return { ok: false, error: task.error };
        }
      }

      return { ok: true, data: { taskId: task.id, status: "queued" } };
    }

    case "task/status": {
      const taskId = typeof req.payload === "string" ? req.payload : undefined;
      if (!taskId) {return { ok: false, error: "Task ID required" };}
      const task = tasks.get(taskId);
      if (!task) {return { ok: false, error: "Task not found" };}
      return { ok: true, data: { taskId, status: task.status, result: task.result } };
    }

    case "agent/info":
      return {
        ok: true,
        data: {
          id: "republic",
          name: "HoC Republic",
          framework: "hoc-republic",
          capabilities: ["reasoning", "coding", "research", "memory", "vision"],
        },
      };

    case "agent/capabilities":
      return {
        ok: true,
        data: {
          capabilities: getEnabledToolNames(),
        },
      };

    default:
      return { ok: false, error: `Unknown method: ${String(req.method)}` };
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function getEnabledToolNames(): string[] {
  try {
    const { getEnabledTools } = require("./tool-executor.js") as typeof import("./tool-executor.js");
    return getEnabledTools().map((t) => t.id);
  } catch {
    return [];
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export function acpBridgeDiagnostics(): ACPBridgeDiagnostics {
  const allTasks = [...tasks.values()];
  return {
    registeredAgents: agents.size,
    onlineAgents: [...agents.values()].filter((a) => a.status === "online").length,
    totalTasksSent: allTasks.filter((t) => t.fromAgentId !== "republic").length,
    totalTasksReceived: allTasks.filter((t) => t.toAgentId === "republic").length,
    activeTaskCount: allTasks.filter((t) => t.status === "running" || t.status === "pending").length,
    completedTaskCount: allTasks.filter((t) => t.status === "completed").length,
    failedTaskCount: allTasks.filter((t) => t.status === "failed").length,
  };
}

// ─── State Reset (Testing) ──────────────────────────────────────

export function resetACPState(): void {
  agents.clear();
  tasks.clear();
  incomingTaskHandler = null;
}
