/**
 * Node Capability Registry
 *
 * Auto-detects hardware capabilities (GPUs, CPU, RAM) on the current node
 * and publishes them to the cluster via Redis so the plugin scheduler can
 * make placement decisions.
 *
 * Detection strategies:
 *   GPU   — nvidia-smi (CUDA), rocm-smi (AMD ROCm), wmic (Windows fallback)
 *   CPU   — os.cpus()
 *   RAM   — os.totalmem()
 *   Tags  — HOC_NODE_TAGS env var (comma-separated)
 */

import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import { createSubsystemLogger } from "../logging.js";

const logger = createSubsystemLogger("cluster:capabilities");
const execFileAsync = promisify(execFile);

// ─── Types ───────────────────────────────────────────────────────

export interface GpuInfo {
  /** GPU product name, e.g. "NVIDIA GeForce RTX 4090" */
  name: string;
  /** Total VRAM in GiB */
  vramGb: number;
  /** Free VRAM in GiB (at detection time) */
  freeVramGb: number;
  /** CUDA toolkit version, e.g. "12.4" (undefined for AMD) */
  cuda?: string;
  /** ROCm version (undefined for NVIDIA) */
  rocm?: string;
  /** Device index (0-based) */
  index: number;
}

export interface NodeCapabilities {
  /** Detected GPUs on this node */
  gpus: GpuInfo[];
  /** Total VRAM across all GPUs (GiB) */
  totalVramGb: number;
  /** Free VRAM across all GPUs (GiB) */
  freeVramGb: number;
  /** Number of logical CPU cores */
  cpuCores: number;
  /** CPU model name */
  cpuModel: string;
  /** Total system RAM in GiB */
  ramGb: number;
  /** Free system RAM in GiB (at detection time) */
  freeRamGb: number;
  /** CPU architecture */
  arch: string;
  /** OS platform */
  platform: NodeJS.Platform;
  /** User-defined tags (from HOC_NODE_TAGS env var) */
  tags: string[];
  /** Manually pinned plugin IDs (from HOC_PLUGIN_AFFINITIES env var) */
  pluginAffinities: string[];
  /** When capabilities were last detected */
  detectedAt: number;
}

// ─── GPU Detection ──────────────────────────────────────────────

/**
 * Detect NVIDIA GPUs via nvidia-smi.
 * Returns empty array if nvidia-smi is not available.
 */
async function detectNvidiaGpus(): Promise<GpuInfo[]> {
  try {
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      [
        "--query-gpu=index,name,memory.total,memory.free,driver_version",
        "--format=csv,noheader,nounits",
      ],
      { timeout: 10_000 },
    );

    const gpus: GpuInfo[] = [];

    for (const line of stdout.trim().split("\n")) {
      const parts = line.split(",").map((s) => s.trim());
      if (parts.length < 4) {
        continue;
      }

      const [indexStr, name, totalMb, freeMb] = parts;
      const index = parseInt(indexStr, 10);
      const vramGb = Math.round((parseInt(totalMb, 10) / 1024) * 100) / 100;
      const freeVramGb = Math.round((parseInt(freeMb, 10) / 1024) * 100) / 100;

      gpus.push({ name, vramGb, freeVramGb, index });
    }

    // Try to get CUDA version
    if (gpus.length > 0) {
      try {
        // nvidia-smi reports driver_version; extract CUDA version from the header
        const { stdout: headerOut } = await execFileAsync("nvidia-smi", [], { timeout: 5_000 });
        const cudaMatch = headerOut.match(/CUDA Version:\s*([\d.]+)/);
        if (cudaMatch) {
          for (const gpu of gpus) {
            gpu.cuda = cudaMatch[1];
          }
        }
      } catch {
        // CUDA version detection is optional
      }
    }

    if (gpus.length > 0) {
      logger.info(`Detected ${gpus.length} NVIDIA GPU(s)`, {
        gpus: gpus.map((g) => `${g.name} (${g.vramGb}GB)`),
      });
    }

    return gpus;
  } catch {
    return [];
  }
}

/**
 * Detect AMD ROCm GPUs via rocm-smi.
 * Returns empty array if rocm-smi is not available.
 */
async function detectRocmGpus(): Promise<GpuInfo[]> {
  try {
    const { stdout } = await execFileAsync("rocm-smi", ["--showmeminfo", "vram", "--json"], {
      timeout: 10_000,
    });

    const data = JSON.parse(stdout);
    const gpus: GpuInfo[] = [];

    // rocm-smi JSON output varies by version; handle common shapes
    for (const [key, value] of Object.entries(data)) {
      const match = key.match(/card(\d+)/);
      if (!match) {
        continue;
      }

      const card = value as Record<string, string>;
      const totalBytes = parseInt(card["VRAM Total Memory (B)"] || "0", 10);
      const usedBytes = parseInt(card["VRAM Total Used Memory (B)"] || "0", 10);
      const vramGb = Math.round((totalBytes / 1024 ** 3) * 100) / 100;
      const freeVramGb = Math.round(((totalBytes - usedBytes) / 1024 ** 3) * 100) / 100;

      gpus.push({
        name: `AMD GPU ${match[1]}`,
        vramGb,
        freeVramGb,
        index: parseInt(match[1], 10),
        rocm: "detected",
      });
    }

    if (gpus.length > 0) {
      logger.info(`Detected ${gpus.length} AMD ROCm GPU(s)`);
    }

    return gpus;
  } catch {
    return [];
  }
}

/**
 * Detect all GPUs on this node (NVIDIA first, then AMD ROCm).
 */
async function detectGpus(): Promise<GpuInfo[]> {
  const nvidia = await detectNvidiaGpus();
  if (nvidia.length > 0) {
    return nvidia;
  }

  const amd = await detectRocmGpus();
  if (amd.length > 0) {
    return amd;
  }

  logger.info("No GPUs detected on this node");
  return [];
}

// ─── Full Detection ─────────────────────────────────────────────

/** CPU model from the first core */
function getCpuModel(): string {
  const cpus = os.cpus();
  return cpus.length > 0 ? cpus[0].model : "unknown";
}

/** Parse comma-separated env var into string array, trimmed, empty strings removed */
function parseEnvList(envVar: string): string[] {
  const raw = process.env[envVar];
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Detect all hardware capabilities of the current node.
 * This is safe to call repeatedly — it re-probes each time.
 */
export async function detectNodeCapabilities(): Promise<NodeCapabilities> {
  const gpus = await detectGpus();

  const totalVramGb = gpus.reduce((sum, g) => sum + g.vramGb, 0);
  const freeVramGb = gpus.reduce((sum, g) => sum + g.freeVramGb, 0);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  const capabilities: NodeCapabilities = {
    gpus,
    totalVramGb: Math.round(totalVramGb * 100) / 100,
    freeVramGb: Math.round(freeVramGb * 100) / 100,
    cpuCores: os.cpus().length,
    cpuModel: getCpuModel(),
    ramGb: Math.round((totalMem / 1024 ** 3) * 100) / 100,
    freeRamGb: Math.round((freeMem / 1024 ** 3) * 100) / 100,
    arch: os.arch(),
    platform: os.platform(),
    tags: parseEnvList("HOC_NODE_TAGS"),
    pluginAffinities: parseEnvList("HOC_PLUGIN_AFFINITIES"),
    detectedAt: Date.now(),
  };

  logger.info("Node capabilities detected", {
    gpus: capabilities.gpus.length,
    totalVramGb: capabilities.totalVramGb,
    cpuCores: capabilities.cpuCores,
    ramGb: capabilities.ramGb,
    arch: capabilities.arch,
    tags: capabilities.tags,
  });

  return capabilities;
}

/**
 * Check whether a node's capabilities satisfy a set of requirements.
 */
export function capabilitiesSatisfy(
  node: NodeCapabilities,
  requirements: {
    minVramGb?: number;
    minRamGb?: number;
    minCpuCores?: number;
    tags?: string[];
    anyTags?: string[];
    requiredNodeId?: string;
  },
  nodeId?: string,
): boolean {
  if (requirements.requiredNodeId && nodeId !== requirements.requiredNodeId) {
    return false;
  }

  if (requirements.minVramGb && node.totalVramGb < requirements.minVramGb) {
    return false;
  }

  if (requirements.minRamGb && node.ramGb < requirements.minRamGb) {
    return false;
  }

  if (requirements.minCpuCores && node.cpuCores < requirements.minCpuCores) {
    return false;
  }

  // Must have ALL specified tags
  if (requirements.tags && requirements.tags.length > 0) {
    for (const tag of requirements.tags) {
      if (!node.tags.includes(tag)) {
        return false;
      }
    }
  }

  // Must have at least ONE of the specified tags
  if (requirements.anyTags && requirements.anyTags.length > 0) {
    const hasAny = requirements.anyTags.some((tag) => node.tags.includes(tag));
    if (!hasAny) {
      return false;
    }
  }

  return true;
}

/**
 * Score a node for plugin placement. Higher = better fit.
 *
 * Factors:
 *   - Free VRAM (40% weight)
 *   - Free RAM (30% weight)
 *   - CPU availability (20% weight)
 *   - Affinity bonus (10% weight)
 */
export function scoreNode(
  node: NodeCapabilities,
  health: { cpu: number; memory: number },
  pluginId?: string,
): number {
  // Normalise free VRAM (0–1), capped at 48 GB
  const vramScore = node.totalVramGb > 0 ? Math.min(node.freeVramGb / 48, 1) : 0;

  // Normalise free RAM (0–1), capped at 128 GB
  const ramScore = Math.min(node.freeRamGb / 128, 1);

  // CPU availability (0–1): 100% - usage%
  const cpuScore = Math.max(0, (100 - health.cpu) / 100);

  // Affinity bonus: if node explicitly lists this plugin ID
  const affinityBonus = pluginId && node.pluginAffinities.includes(pluginId) ? 1 : 0;

  return vramScore * 0.4 + ramScore * 0.3 + cpuScore * 0.2 + affinityBonus * 0.1;
}
