/**
 * Agent Sandbox Pool Manager — Pool State & Status
 *
 * In-memory state for the task queue, active tasks, recent history,
 * and pool status queries (container health, crash-loop detection).
 */

import { execFileSync } from "node:child_process";
import type { SandboxTask, PoolStatus, QueueSnapshot } from "./types.js";
import { inspectContainer, type ContainerInfo } from "../docker-orchestrator.js";
import {
  SANDBOX_CONTAINER_NAME,
  SANDBOX_API_PORT,
  SANDBOX_NOVNC_PORT,
  SANDBOX_PREVIEW_PORT,
  SANDBOX_API_URL,
  MAX_CONCURRENT,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_TASKS,
} from "./config.js";
import { getModelVolumeMounts } from "./config.js";
import { isPortListening, invalidatePortCache } from "./raw-api.js";

// ─── Pool State (module-level singletons) ───────────────────────

export let containerReady = false;
export let containerInfo: ContainerInfo | null = null;

export const taskQueue: SandboxTask[] = [];
export const activeTasks = new Map<string, SandboxTask>();
export const recentTasks: SandboxTask[] = [];
export const deadLetterQueue: SandboxTask[] = [];
export let totalCompleted = 0;
export let totalFailed = 0;
export let draining = false;

/** Track submission timestamps to prevent burst-flooding */
export const submitTimestamps: number[] = [];

// ─── State Mutators ─────────────────────────────────────────────

export function setContainerReady(value: boolean): void {
  containerReady = value;
}

export function setContainerInfo(info: ContainerInfo | null): void {
  containerInfo = info;
}

export function setDraining(value: boolean): void {
  draining = value;
}

export function incrementCompleted(): void {
  totalCompleted++;
}

export function incrementFailed(): void {
  totalFailed++;
}

export function pushRecent(task: SandboxTask): void {
  recentTasks.push(task);
  if (recentTasks.length > 50) {
    recentTasks.splice(0, recentTasks.length - 50);
  }
}

// ─── Container State Inspection ─────────────────────────────────

export function isContainerRunning(): boolean {
  const info = inspectContainer(SANDBOX_CONTAINER_NAME);
  return info?.status === "running";
}

/** Backward compat alias */
export const isSandboxRunning = isContainerRunning;

let _inspectCache: {
  result: { restartCount: number; state: string; imageKind: "custom" | "fallback" | "unknown" };
  ts: number;
} | null = null;
const INSPECT_CACHE_TTL_MS = 15_000;

export function inspectContainerState(): {
  restartCount: number;
  state: string;
  imageKind: "custom" | "fallback" | "unknown";
} {
  const now = Date.now();
  if (_inspectCache && now - _inspectCache.ts < INSPECT_CACHE_TTL_MS) {
    return _inspectCache.result;
  }
  try {
    const out = execFileSync(
      "docker",
      [
        "inspect",
        "--format",
        `{{.RestartCount}}|{{.State.Status}}|{{index .Config.Labels "hoc.image.kind"}}`,
        SANDBOX_CONTAINER_NAME,
      ],
      { timeout: 3_000, stdio: "pipe" },
    )
      .toString()
      .trim();
    const [rcRaw, state, kind] = out.split("|");
    const restartCount = Number(rcRaw ?? "0");
    const imageKind: "custom" | "fallback" | "unknown" =
      kind === "custom" ? "custom" : kind === "fallback" ? "fallback" : "unknown";
    const result = { restartCount, state: state ?? "unknown", imageKind };
    _inspectCache = { result, ts: now };
    return result;
  } catch {
    const result = { restartCount: 0, state: "unknown", imageKind: "unknown" as const };
    _inspectCache = { result, ts: now };
    return result;
  }
}

export function clearInspectCache(): void {
  _inspectCache = null;
}

// ─── Rate Limiter ───────────────────────────────────────────────

export function checkRateLimit(): void {
  const now = Date.now();
  while (submitTimestamps.length > 0 && submitTimestamps[0]! < now - RATE_LIMIT_WINDOW_MS) {
    submitTimestamps.shift();
  }
  if (submitTimestamps.length >= RATE_LIMIT_MAX_TASKS) {
    throw new Error(
      `Rate limit exceeded: max ${RATE_LIMIT_MAX_TASKS} tasks per ${RATE_LIMIT_WINDOW_MS / 1000}s window`,
    );
  }
  submitTimestamps.push(now);
}

// ─── Pool Status Queries ────────────────────────────────────────

export function getSandboxPoolStatus(): PoolStatus {
  const info = inspectContainer(SANDBOX_CONTAINER_NAME);
  const running = info?.status === "running";

  const { restartCount, state, imageKind } = inspectContainerState();
  const isRestarting = state === "restarting";
  const containerFailing = isRestarting || restartCount >= 3;

  if (running && !isRestarting && !containerReady) {
    containerReady = true;
    if (!containerInfo) {
      containerInfo = info;
    }
  } else if (!running || isRestarting) {
    containerReady = false;
    invalidatePortCache();
    _inspectCache = null;
  }

  const hasGpu = !!process.env.CUDA_VISIBLE_DEVICES || !!process.env.NVIDIA_VISIBLE_DEVICES;
  const apiReachable = running && !isRestarting ? isPortListening(SANDBOX_API_PORT) : false;
  const novncReachable = running && !isRestarting ? isPortListening(SANDBOX_NOVNC_PORT) : false;

  return {
    containerRunning: running || isRestarting,
    containerReady: containerReady && running && !isRestarting,
    containerFailing,
    restartCount,
    imageKind,
    containerId: containerInfo?.id ?? info?.id ?? null,
    queueDepth: taskQueue.length,
    activeTasks: activeTasks.size,
    maxConcurrent: MAX_CONCURRENT,
    totalCompleted,
    totalFailed,
    availableFlavors: hasGpu
      ? ["exec", "browse", "playwright", "dev", "diffusion", "video", "audio", "ml"]
      : ["exec", "browse", "playwright", "dev"],
    gpuAvailable: hasGpu || (process.env.HOC_GPU_NODES ?? "").length > 0,
    modelVolumes: getModelVolumeMounts().map((m) => m.split(":")[0]),
    ports: { novnc: SANDBOX_NOVNC_PORT, preview: SANDBOX_PREVIEW_PORT, api: SANDBOX_API_PORT },
    urls: {
      novnc: `http://127.0.0.1:${SANDBOX_NOVNC_PORT}/vnc.html`,
      preview: `http://127.0.0.1:${SANDBOX_PREVIEW_PORT}`,
      api: SANDBOX_API_URL,
    },
    apiAvailable: apiReachable,
    novncAvailable: novncReachable,
  };
}

/** Backward compat alias */
export const getSandboxStatus = getSandboxPoolStatus;

export function getSandboxQueueSnapshot(): QueueSnapshot {
  return {
    queued: [...taskQueue],
    active: [...activeTasks.values()],
    recent: recentTasks.slice(-20),
  };
}

/** Returns tasks that permanently failed (exhausted all retries). */
export function getDeadLetterQueue(): SandboxTask[] {
  return [...deadLetterQueue];
}

/** Clear the dead-letter queue */
export function clearDeadLetterQueue(): void {
  deadLetterQueue.length = 0;
}

export function getSandboxTaskStatus(taskId: string): SandboxTask | null {
  const active = activeTasks.get(taskId);
  if (active) {
    return active;
  }
  const queued = taskQueue.find((t) => t.id === taskId);
  if (queued) {
    return queued;
  }
  const recent = recentTasks.find((t) => t.id === taskId);
  return recent ?? null;
}
