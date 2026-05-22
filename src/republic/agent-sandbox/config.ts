/**
 * Agent Sandbox Pool Manager — Configuration & Constants
 *
 * Sandbox flavors, GPU registries, model volume detection,
 * and inference endpoint configuration.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SandboxFlavor, SandboxTaskType, ClusterGpuNode } from "./types.js";

// ─── Container Configuration ────────────────────────────────────

export const SANDBOX_CONTAINER_NAME = "hoc-agent-sandbox";
export const SANDBOX_IMAGE_NAME = "hoc/agent-sandbox:latest";
export const SANDBOX_API_PORT = 3100;
export const SANDBOX_NOVNC_PORT = 6080;
export const SANDBOX_PREVIEW_PORT = 8080;
export const SANDBOX_API_URL = `http://127.0.0.1:${SANDBOX_API_PORT}`;

/** Max concurrent tasks inside the single container */
export const MAX_CONCURRENT = 3;
/** Max task execution time in ms (5 minutes) */
export const TASK_TIMEOUT_MS = 5 * 60 * 1000;
/** Max queue size */
export const MAX_QUEUE_SIZE = 50;

/** The fallback public image when custom sandbox image is unavailable */
export const FALLBACK_SANDBOX_IMAGE = "ubuntu:22.04";

// ─── Rate Limiter ───────────────────────────────────────────────

export const RATE_LIMIT_WINDOW_MS = 10_000; // 10-second window
export const RATE_LIMIT_MAX_TASKS = 20; // Max 20 tasks per window

// ─── Queue Aging ────────────────────────────────────────────────

/** Prevent starvation: boost priority of tasks that have been waiting too long */
export const QUEUE_AGING_INTERVAL_MS = 30_000; // Every 30s, bump queued tasks
export const QUEUE_AGING_BOOST = 5; // Priority bump per aging tick

// ─── Sandbox Flavors ────────────────────────────────────────────

export const FLAVOR_IMAGES: Record<SandboxFlavor, string> = {
  exec: "hoc/sandbox-exec:latest",
  browse: "hoc/agent-sandbox:latest",
  playwright: "hoc/playwright-sandbox:latest",
  dev: "hoc/dev-sandbox:latest",
  diffusion: "hoc/sandbox-gpu-diffusion:latest",
  video: "hoc/sandbox-gpu-video:latest",
  audio: "hoc/sandbox-gpu-audio:latest",
  ml: "hoc/sandbox-gpu-ml:latest",
};

const GPU_FLAVORS = new Set<SandboxFlavor>(["diffusion", "video", "audio", "ml"]);

/** Get the Docker image name for a given sandbox flavor */
export function getImageForFlavor(flavor: SandboxFlavor): string {
  return FLAVOR_IMAGES[flavor] ?? SANDBOX_IMAGE_NAME;
}

/** Check if a flavor requires GPU */
export function flavorNeedsGpu(flavor: SandboxFlavor): boolean {
  return GPU_FLAVORS.has(flavor);
}

/** Infer sandbox flavor from task type when not explicitly specified */
export function inferFlavor(type: SandboxTaskType): SandboxFlavor {
  switch (type) {
    case "browse":
      return "playwright";
    case "build":
      return "exec";
    case "exec":
      return "exec";
    case "file_op":
      return "exec";
    case "custom":
      return "exec";
    default:
      return "exec";
  }
}

/** Select the best node for a task based on flavor requirements */
export function selectNodeForTask(flavor: SandboxFlavor): {
  local: boolean;
  node?: ClusterGpuNode;
} {
  if (!flavorNeedsGpu(flavor)) {
    return { local: true };
  }
  const hasLocalGpu = !!process.env.CUDA_VISIBLE_DEVICES || !!process.env.NVIDIA_VISIBLE_DEVICES;
  if (hasLocalGpu) {
    return { local: true };
  }
  const gpuPeers = (process.env.HOC_GPU_NODES ?? "").split(",").filter(Boolean);
  if (gpuPeers.length > 0) {
    return {
      local: false,
      node: {
        id: gpuPeers[0],
        host: gpuPeers[0],
        sandboxApiUrl: `http://${gpuPeers[0]}:${SANDBOX_API_PORT}`,
        available: true,
      },
    };
  }
  return { local: true };
}

// ─── Model Volume Detection ─────────────────────────────────────

/** Detect host model directories for read-only mounting */
export function getModelVolumeMounts(): string[] {
  const home = homedir();
  const mounts: string[] = [];
  const candidates: Array<[string, string]> = [
    [join(home, ".ollama", "models"), "/models/ollama"],
    [join(home, ".cache", "huggingface"), "/models/huggingface"],
    [join(home, ".cache", "lm-studio", "models"), "/models/lm-studio"],
  ];
  if (process.platform === "win32") {
    candidates.push(
      [join(home, ".lmstudio", "models"), "/models/lm-studio"],
      [
        "C:\\Users\\" + (process.env.USERNAME ?? "") + "\\.cache\\lm-studio\\models",
        "/models/lm-studio",
      ],
    );
  }
  for (const [hostPath, containerPath] of candidates) {
    if (existsSync(hostPath)) {
      mounts.push(`${hostPath}:${containerPath}:ro`);
    }
  }
  return mounts;
}

/** Build inference endpoint environment variables for the sandbox */
export function getInferenceEnvVars(): Record<string, string> {
  return {
    OLLAMA_HOST: process.env.OLLAMA_URL ?? "http://host.docker.internal:11434",
    LMSTUDIO_HOST: process.env.LMSTUDIO_URL ?? "http://host.docker.internal:1234",
    HOC_GATEWAY_URL: `http://host.docker.internal:${process.env.OPENCLAW_PORT ?? "3000"}`,
    INFERENCE_ENDPOINTS: JSON.stringify({
      ollama: process.env.OLLAMA_URL ?? "http://host.docker.internal:11434",
      lmstudio: process.env.LMSTUDIO_URL ?? "http://host.docker.internal:1234",
      gateway: `http://host.docker.internal:${process.env.OPENCLAW_PORT ?? "3000"}`,
    }),
  };
}
