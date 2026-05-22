/**
 * Republic Platform — Agent Sandbox Pool Manager
 *
 * Barrel re-export — all public APIs are now in focused submodules
 * under `agent-sandbox/`. This file exists solely for backward
 * compatibility so that existing `import ... from "./agent-sandbox.js"`
 * continues to work with zero breaking changes.
 *
 * 4-Layer Architecture:
 *   Layer 1: Shared Model Storage — host model dirs mounted read-only
 *   Layer 2: Inference-as-a-Service — sandboxes call Ollama/LM Studio/gateway
 *   Layer 3: Specialized Flavors — exec, browse, diffusion, video, audio, ml
 *   Layer 4: GPU-Aware Scheduling — routes to GPU nodes via cluster registry
 */

// ─── Types ──────────────────────────────────────────────────────
export type {
  SandboxFlavor,
  SandboxTaskType,
  SandboxTaskStatus,
  SandboxTask,
  SandboxTaskResult,
  PoolStatus,
  QueueSnapshot,
  ClusterGpuNode,
} from "./agent-sandbox/types.js";

// ─── Configuration & Flavor Utilities ───────────────────────────
export { getImageForFlavor, flavorNeedsGpu, selectNodeForTask } from "./agent-sandbox/config.js";

// ─── Pool State & Status Queries ────────────────────────────────
export {
  isContainerRunning,
  isSandboxRunning,
  getSandboxPoolStatus,
  getSandboxStatus,
  getSandboxQueueSnapshot,
  getDeadLetterQueue,
  clearDeadLetterQueue,
  getSandboxTaskStatus,
} from "./agent-sandbox/pool-state.js";

// ─── Task Queue ─────────────────────────────────────────────────
export { submitSandboxTask, cancelSandboxTask } from "./agent-sandbox/task-queue.js";

// ─── Container Lifecycle ────────────────────────────────────────
export {
  buildSandboxImage,
  ensureContainerRunning,
  startSandbox,
  stopSandbox,
  destroySandbox,
} from "./agent-sandbox/container-lifecycle.js";

// ─── High-Level API Client (auto-start) ─────────────────────────
export {
  sandboxExec,
  sandboxWriteFile,
  sandboxReadFile,
  sandboxListFiles,
  sandboxBrowser,
} from "./agent-sandbox/api-client.js";

// ─── Raw API (no auto-start) ────────────────────────────────────
export { sandboxDockerExec } from "./agent-sandbox/raw-api.js";
