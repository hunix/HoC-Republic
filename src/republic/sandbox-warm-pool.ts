/**
 * Sandbox Warm-Pool — Container lifecycle management.
 *
 * GPU containers stay warm for 10 minutes after last use, then auto-stop.
 * Non-GPU containers get 30 minutes. Every tool call that uses a container
 * resets the timer. A periodic sweep (every 60s) stops idle containers.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("warm-pool");

// ─── Configuration ──────────────────────────────────────────────

const IDLE_TIMEOUT_GPU_MS = 10 * 60_000; // 10 min for GPU (ComfyUI, ML)
const IDLE_TIMEOUT_DEFAULT_MS = 30 * 60_000; // 30 min for non-GPU

export const containerLastUsed = new Map<string, number>();
export const GPU_CONTAINER_TYPES = new Set(["comfyui", "ml"]);

/** Reset the idle timer for a container (called by GPU tools) */
export function touchContainer(type: string): void {
  containerLastUsed.set(type, Date.now());
}

// ─── Container Stop ─────────────────────────────────────────────

/** Stop a container via orchestrator (async, non-blocking) and remove from warm pool */
async function warmPoolStop(containerName: string, type: string): Promise<void> {
  try {
    const { stopContainer } = await import("./docker-orchestrator.js");
    const ok = await stopContainer(containerName);
    if (ok) {
      logger.info(`[WarmPool] Auto-stopped idle container: ${containerName} (${type})`);
    }
  } catch {
    /* container may already be stopped */
  }
  containerLastUsed.delete(type);
}

// ─── Async Container Discovery ──────────────────────────────────

/** Find a running container by name prefix (async, non-blocking) */
async function findRunningContainer(prefix: string): Promise<string | null> {
  try {
    const { dockerExecAsync } = await import("./docker-orchestrator.js");
    const name = await dockerExecAsync(
      ["ps", "--filter", `name=${prefix}`, "--filter", "status=running", "--format", "{{.Names}}"],
      5_000,
    );
    const firstName = name.trim().split("\n")[0];
    return firstName || null;
  } catch {
    return null;
  }
}

// ─── Idle Sweep Timer ───────────────────────────────────────────

// Uses name prefixes for discovery — the orchestrator names containers as
// hoc-<preset>-<uid>, so we match by prefix instead of exact name.
const containerPrefixes: Record<string, string> = {
  comfyui: "hoc-comfyui",
  ml: "hoc-ml",
  kali: "hoc-kali",
  playwright: "hoc-playwright",
};

let warmPoolSweepStarted = false;

/** Start the idle sweep timer (runs once, checks every 60s) */
export function ensureWarmPoolSweep(): void {
  if (warmPoolSweepStarted) {
    return;
  }
  warmPoolSweepStarted = true;
  const timer = setInterval(() => {
    for (const [type, lastUsed] of containerLastUsed) {
      const timeout = GPU_CONTAINER_TYPES.has(type) ? IDLE_TIMEOUT_GPU_MS : IDLE_TIMEOUT_DEFAULT_MS;
      if (Date.now() - lastUsed > timeout) {
        const prefix = containerPrefixes[type];
        if (prefix) {
          // Async container discovery + stop — never blocks the event loop
          void findRunningContainer(prefix).then((name) => {
            if (name) {
              void warmPoolStop(name, type);
            }
          });
        }
      }
    }
  }, 60_000);
  timer.unref(); // Don't prevent process exit
}
