/**
 * Agent Sandbox Pool Manager — Type Definitions
 *
 * All shared types, interfaces, and type aliases for the sandbox pool system.
 */

// ─── Sandbox Flavors ────────────────────────────────────────────

export type SandboxFlavor =
  | "exec"
  | "browse"
  | "playwright"
  | "dev"
  | "diffusion"
  | "video"
  | "audio"
  | "ml";

// ─── Task Types ─────────────────────────────────────────────────

export type SandboxTaskType = "exec" | "browse" | "build" | "file_op" | "custom";
export type SandboxTaskStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "cancelled"
  | "timeout";

export interface SandboxTask {
  id: string;
  citizenId: string;
  citizenName: string;
  type: SandboxTaskType;
  /** Sandbox flavor — determines which image and GPU requirements */
  flavor: SandboxFlavor;
  /** Priority 0-100. Higher = runs sooner. Elite citizens get boost. */
  priority: number;
  /** Shell command, URL, or build config */
  payload: Record<string, unknown>;
  /** Created timestamp */
  createdAt: string;
  /** Started timestamp */
  startedAt?: string;
  /** Completed timestamp */
  completedAt?: string;
  status: SandboxTaskStatus;
  /** Workspace dir inside container */
  workspaceDir: string;
  /** Which node is running this (local or remote Tailscale IP) */
  targetNode?: string;
  /** Number of times this task has been retried after a transient failure */
  retryCount?: number;
  /** Result from execution */
  result?: SandboxTaskResult;
}

export interface SandboxTaskResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  filesCreated: string[];
  error?: string;
}

// ─── Pool Status ────────────────────────────────────────────────

export interface PoolStatus {
  containerRunning: boolean;
  containerReady: boolean;
  /** True if the container is in a restart loop (restartCount > 2 or state=restarting) */
  containerFailing: boolean;
  /** Number of times Docker has restarted this container */
  restartCount: number;
  /** Whether the running image is the real custom image or the ubuntu fallback */
  imageKind: "custom" | "fallback" | "unknown";
  containerId: string | null;
  queueDepth: number;
  activeTasks: number;
  maxConcurrent: number;
  totalCompleted: number;
  totalFailed: number;
  availableFlavors: SandboxFlavor[];
  gpuAvailable: boolean;
  modelVolumes: string[];
  ports: { novnc: number; preview: number; api: number };
  urls: { novnc: string; preview: string; api: string };
  /** True when the sandbox HTTP API (port 3100) is reachable */
  apiAvailable: boolean;
  /** True when noVNC (port 6080) is reachable */
  novncAvailable: boolean;
}

export interface QueueSnapshot {
  queued: SandboxTask[];
  active: SandboxTask[];
  recent: SandboxTask[];
}

// ─── GPU Registry ───────────────────────────────────────────────

export interface ClusterGpuNode {
  id: string;
  host: string;
  gpuModel?: string;
  gpuVramMB?: number;
  sandboxApiUrl?: string;
  available: boolean;
}
