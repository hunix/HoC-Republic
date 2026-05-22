/**
 * Infrastructure — AutoGPT Engine
 *
 * Manages the AutoGPT platform lifecycle:
 *   1. Auto-clones the repository
 *   2. Launches via Docker Compose (or detects existing server)
 *   3. Communicates with the AutoGPT Server REST API
 *
 * Supports both self-hosted (Docker) and remote server modes.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type {
    AgentExecution, AutoGPTAgent, AutoGPTConfig, PlatformStatus,
    Workflow
} from "../domain/types.ts";

// ─── Auto-Detection ─────────────────────────────────────────────

const REPO_URL = "https://github.com/Significant-Gravitas/AutoGPT.git";

/**
 * Check whether the AutoGPT server API is reachable.
 */
export async function checkServer(config: AutoGPTConfig): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${config.serverUrl}/api/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok || res.status === 404; // 404 means server is up but no health route
  } catch {
    return false;
  }
}

/**
 * Auto-clone the AutoGPT repository.
 */
export function ensureRepoCloned(repoDir: string): {
  cloned: boolean;
  autoCloned: boolean;
  error?: string;
} {
  if (fs.existsSync(path.join(repoDir, ".git"))) {
    return { cloned: true, autoCloned: false };
  }

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    execSync(`git clone --depth 1 "${REPO_URL}" "${repoDir}"`, {
      timeout: 300_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { cloned: true, autoCloned: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return {
      cloned: false,
      autoCloned: false,
      error: `Clone failed: ${e.message ?? "unknown"}`,
    };
  }
}

/**
 * Check whether Docker is available.
 */
export function checkDocker(): boolean {
  try {
    execSync("docker --version", {
      timeout: 10_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether Docker Compose is available.
 */
export function checkDockerCompose(): boolean {
  try {
    execSync("docker compose version", {
      timeout: 10_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Installation Status ────────────────────────────────────────

export interface AutoGPTInstallStatus {
  ready: boolean;
  serverReachable: boolean;
  repoCloned: boolean;
  autoClonedRepo: boolean;
  dockerAvailable: boolean;
  dockerComposeAvailable: boolean;
  errors: string[];
}

/**
 * Full detection + auto-bootstrap.
 */
export async function detectInstallation(config: AutoGPTConfig): Promise<AutoGPTInstallStatus> {
  const errors: string[] = [];

  // 1. Check server reachability
  const serverReachable = await checkServer(config);

  // 2. Auto-clone repo
  const repoResult = ensureRepoCloned(config.repoDir);
  if (!repoResult.cloned && repoResult.error) {
    errors.push(repoResult.error);
  }

  // 3. Check Docker (for self-hosting)
  const dockerAvailable = checkDocker();
  const dockerComposeAvailable = dockerAvailable ? checkDockerCompose() : false;

  if (!serverReachable && !dockerAvailable) {
    errors.push("AutoGPT server not reachable and Docker not available for self-hosting");
  }

  const ready = serverReachable || (repoResult.cloned && dockerAvailable && dockerComposeAvailable);

  return {
    ready,
    serverReachable,
    repoCloned: repoResult.cloned,
    autoClonedRepo: repoResult.autoCloned,
    dockerAvailable,
    dockerComposeAvailable,
    errors,
  };
}

// ─── API Client ─────────────────────────────────────────────────

async function apiRequest<T>(
  config: AutoGPTConfig,
  method: string,
  endpoint: string,
  body?: unknown,
): Promise<{ data?: T; error?: string }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    const res = await fetch(`${config.serverUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { error: `API error: ${res.status} ${res.statusText}` };
    }

    const data = (await res.json()) as T;
    return { data };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { error: `Request failed: ${e.message ?? "unknown"}` };
  }
}

// ─── Agent Operations ───────────────────────────────────────────

export async function listAgents(
  config: AutoGPTConfig,
): Promise<{ agents: AutoGPTAgent[]; error?: string }> {
  const result = await apiRequest<AutoGPTAgent[]>(config, "GET", "/api/agents");
  return { agents: result.data ?? [], error: result.error };
}

export async function createAgent(
  config: AutoGPTConfig,
  name: string,
  description: string,
): Promise<{ agent?: AutoGPTAgent; error?: string }> {
  const result = await apiRequest<AutoGPTAgent>(config, "POST", "/api/agents", {
    name,
    description,
  });
  return { agent: result.data, error: result.error };
}

export async function getAgent(
  config: AutoGPTConfig,
  agentId: string,
): Promise<{ agent?: AutoGPTAgent; error?: string }> {
  const result = await apiRequest<AutoGPTAgent>(config, "GET", `/api/agents/${agentId}`);
  return { agent: result.data, error: result.error };
}

export async function startAgent(
  config: AutoGPTConfig,
  agentId: string,
  input?: Record<string, unknown>,
): Promise<{ execution?: AgentExecution; error?: string }> {
  const result = await apiRequest<AgentExecution>(
    config,
    "POST",
    `/api/agents/${agentId}/execute`,
    { input: input ?? {} },
  );
  return { execution: result.data, error: result.error };
}

export async function stopAgent(
  config: AutoGPTConfig,
  agentId: string,
): Promise<{ stopped: boolean; error?: string }> {
  const result = await apiRequest<{ stopped: boolean }>(
    config,
    "POST",
    `/api/agents/${agentId}/stop`,
  );
  return { stopped: result.data?.stopped ?? false, error: result.error };
}

// ─── Execution Operations ───────────────────────────────────────

export async function getExecution(
  config: AutoGPTConfig,
  executionId: string,
): Promise<{ execution?: AgentExecution; error?: string }> {
  const result = await apiRequest<AgentExecution>(config, "GET", `/api/executions/${executionId}`);
  return { execution: result.data, error: result.error };
}

export async function listExecutions(
  config: AutoGPTConfig,
  agentId?: string,
): Promise<{ executions: AgentExecution[]; error?: string }> {
  const endpoint = agentId ? `/api/agents/${agentId}/executions` : "/api/executions";
  const result = await apiRequest<AgentExecution[]>(config, "GET", endpoint);
  return { executions: result.data ?? [], error: result.error };
}

export async function cancelExecution(
  config: AutoGPTConfig,
  executionId: string,
): Promise<{ cancelled: boolean; error?: string }> {
  const result = await apiRequest<{ cancelled: boolean }>(
    config,
    "POST",
    `/api/executions/${executionId}/cancel`,
  );
  return { cancelled: result.data?.cancelled ?? false, error: result.error };
}

// ─── Workflow Operations ────────────────────────────────────────

export async function listWorkflows(
  config: AutoGPTConfig,
): Promise<{ workflows: Workflow[]; error?: string }> {
  const result = await apiRequest<Workflow[]>(config, "GET", "/api/workflows");
  return { workflows: result.data ?? [], error: result.error };
}

export async function getWorkflow(
  config: AutoGPTConfig,
  workflowId: string,
): Promise<{ workflow?: Workflow; error?: string }> {
  const result = await apiRequest<Workflow>(config, "GET", `/api/workflows/${workflowId}`);
  return { workflow: result.data, error: result.error };
}

// ─── Platform Status ────────────────────────────────────────────

export async function getPlatformStatus(config: AutoGPTConfig): Promise<PlatformStatus> {
  const serverReachable = await checkServer(config);
  if (!serverReachable) {
    return {
      serverReachable: false,
      totalAgents: 0,
      activeAgents: 0,
      totalExecutions: 0,
      runningExecutions: 0,
      queuedExecutions: 0,
      completedExecutions: 0,
      failedExecutions: 0,
    };
  }

  const { agents } = await listAgents(config);
  const { executions } = await listExecutions(config);

  return {
    serverReachable: true,
    totalAgents: agents.length,
    activeAgents: agents.filter((a) => a.status === "active").length,
    totalExecutions: executions.length,
    runningExecutions: executions.filter((e) => e.status === "running").length,
    queuedExecutions: executions.filter((e) => e.status === "queued").length,
    completedExecutions: executions.filter((e) => e.status === "completed").length,
    failedExecutions: executions.filter((e) => e.status === "failed").length,
  };
}
