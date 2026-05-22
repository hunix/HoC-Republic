/**
 * Infrastructure — GPU Monitor
 *
 * Lightweight GPU resource monitor using nvidia-smi on Windows.
 * Provides utilization, VRAM usage, and job admission gating.
 */

import type { GpuStatus } from "../domain/types.ts";

// ─── Constants ──────────────────────────────────────────────────

const GPU_UTIL_THRESHOLD = 80; // Don't start new jobs above this %
const VRAM_HEADROOM_MB = 2048; // Require at least 2GB free VRAM
const POLL_CACHE_MS = 5_000; // Cache nvidia-smi results for 5s

// ─── Cached State ───────────────────────────────────────────────

let lastGpuStatus: GpuStatus = {
  available: false,
  utilizationPercent: 0,
  vramUsedMB: 0,
  vramTotalMB: 0,
  vramFreeMB: 0,
};
let lastPollAt = 0;

// ─── nvidia-smi Polling ─────────────────────────────────────────

/**
 * Query GPU status via nvidia-smi.
 * Returns cached result if polled within POLL_CACHE_MS.
 */
export function getGpuStatus(): GpuStatus {
  const now = Date.now();

  if (now - lastPollAt < POLL_CACHE_MS) {
    return lastGpuStatus;
  }

  try {
    const { execFileSync } = require("node:child_process");
    const output: string = execFileSync(
      "nvidia-smi",
      [
        "--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu",
        "--format=csv,noheader,nounits",
      ],
      { encoding: "utf-8", timeout: 5_000, stdio: ["pipe", "pipe", "pipe"] },
    );

    // Parse: "45, 4096, 12288, 65"
    const parts = output
      .trim()
      .split(",")
      .map((s) => parseFloat(s.trim()));

    if (parts.length >= 3 && !isNaN(parts[0])) {
      lastGpuStatus = {
        available: true,
        utilizationPercent: parts[0],
        vramUsedMB: parts[1],
        vramTotalMB: parts[2],
        vramFreeMB: parts[2] - parts[1],
        temperature: parts[3] && !isNaN(parts[3]) ? parts[3] : undefined,
      };
    }
  } catch {
    // nvidia-smi not available — GPU monitoring unavailable
    lastGpuStatus = {
      available: false,
      utilizationPercent: 0,
      vramUsedMB: 0,
      vramTotalMB: 0,
      vramFreeMB: 0,
    };
  }

  lastPollAt = now;
  return lastGpuStatus;
}

// ─── Admission Control ──────────────────────────────────────────

/**
 * Determine if the GPU can accept a new FaceFusion job.
 *
 * Returns true when:
 * - nvidia-smi is unavailable (assume CPU-only, allow job)
 * - GPU utilization < GPU_UTIL_THRESHOLD
 * - Free VRAM > VRAM_HEADROOM_MB
 */
export function canAcceptJob(): boolean {
  const status = getGpuStatus();

  // If no GPU detected, allow job (will run on CPU)
  if (!status.available) {
    return true;
  }

  // Gate on utilization
  if (status.utilizationPercent >= GPU_UTIL_THRESHOLD) {
    return false;
  }

  // Gate on VRAM headroom
  if (status.vramFreeMB < VRAM_HEADROOM_MB) {
    return false;
  }

  return true;
}

/**
 * Get a human-readable summary of GPU conditions.
 */
export function getGpuSummary(): string {
  const status = getGpuStatus();

  if (!status.available) {
    return "GPU not detected — FaceFusion will use CPU (slower)";
  }

  const temp = status.temperature ? `, ${status.temperature}°C` : "";
  return `GPU: ${status.utilizationPercent}% util, ${status.vramUsedMB}/${status.vramTotalMB}MB VRAM${temp}`;
}
