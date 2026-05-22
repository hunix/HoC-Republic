/**
 * Republic Platform — Model Pool Manager
 *
 * Demand-driven model lifecycle manager for LM Studio instances.
 * Automatically loads popular models, unloads idle ones, and downloads
 * missing models — all based on real-time citizen inference demand.
 *
 * Features:
 *   - Demand tracking per model per 5-minute window
 *   - Auto-load: model requested 5+ times → load into LM Studio
 *   - Auto-unload: 15 min idle → free VRAM
 *   - Pre-warm: load commonly used models on startup
 *   - VRAM budget enforcement (don't exceed 90% capacity)
 *   - Auto-download if model not found locally
 *   - Quantization selection based on available VRAM
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { emitNationalEvent } from "./event-sourcing.js";
import { getLatestSurvey, onHardwareEvent } from "./hardware-manager.js";
import {
    cleanupStaleSessions, downloadModel,
    getDownloadStatus,
    getLoadedModels, listModels,
    loadModel,
    unloadModel, type LMStudioModelInfo
} from "./lmstudio-driver.js";

const logger = createSubsystemLogger("model-pool");

// ─── Types ──────────────────────────────────────────────────────

export interface ModelDemand {
  modelKey: string;
  requests: number;
  lastRequested: number;
  windowStart: number;
}

export interface PoolConfig {
  /** Requests in a 5-min window to trigger auto-load (default: 5) */
  autoLoadThreshold: number;
  /** Minutes idle before auto-unload (default: 15) */
  idleUnloadMinutes: number;
  /** Max VRAM usage percentage before refusing loads (default: 0.9) */
  maxVramUsage: number;
  /** Total VRAM in bytes (auto-detected from hardware survey, fallback: 8 GB) */
  totalVramBytes: number;
  /** Poll interval in ms (default: 60_000) */
  pollIntervalMs: number;
  /** Models to pre-warm on startup */
  preWarmModels: string[];
}

export interface PoolStats {
  totalLoadedModels: number;
  totalAvailableModels: number;
  estimatedVramUsedBytes: number;
  vramUsagePercent: number;
  autoLoads: number;
  autoUnloads: number;
  autoDownloads: number;
  demandMap: Record<string, number>;
}

// ─── State ──────────────────────────────────────────────────────

const DEMAND_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

const demand = new Map<string, ModelDemand>();
const lastUsed = new Map<string, number>(); // model → timestamp of last inference request
const pendingDownloads = new Map<string, string>(); // model → jobId

let poolConfig: PoolConfig = {
  autoLoadThreshold: parseInt(process.env.POOL_AUTOLOAD_THRESHOLD ?? "5", 10),
  idleUnloadMinutes: parseInt(process.env.POOL_IDLE_UNLOAD_MIN ?? "60", 10),
  maxVramUsage: parseFloat(process.env.POOL_MAX_VRAM ?? "0.9"),
  totalVramBytes: parseInt(process.env.GPU_VRAM_BYTES ?? String(8 * 1024 * 1024 * 1024), 10),
  pollIntervalMs: 60_000,
  preWarmModels: (process.env.POOL_PREWARM_MODELS ?? "").split(",").filter(Boolean),
};

/**
 * When true, the management loop will NOT auto-load new models.
 * Set by RAM pressure alerts, cleared when pressure resolves.
 */
let pauseNewLoads = false;

let pollInterval: NodeJS.Timeout | null = null;
let stats = { autoLoads: 0, autoUnloads: 0, autoDownloads: 0 };

// ─── Lifecycle ──────────────────────────────────────────────────

/**
 * Initialize the model pool manager.
 * Pre-warms configured models and starts the demand-driven management loop.
 */
export async function initModelPool(config?: Partial<PoolConfig>): Promise<void> {
  if (config) {poolConfig = { ...poolConfig, ...config };}

  // ── Auto-detect VRAM from hardware survey (unless explicitly set via env) ──
  if (!process.env.GPU_VRAM_BYTES) {
    const survey = getLatestSurvey();
    if (survey && survey.vramGB > 0) {
      poolConfig.totalVramBytes = Math.round(survey.vramGB * 1024 * 1024 * 1024);
      logger.info(
        `VRAM budget auto-detected: ${survey.vramGB} GB ` +
        `(${survey.gpuName ?? "unknown GPU"})`,
      );
    } else {
      logger.info(
        `No GPU detected — using fallback VRAM budget: ` +
        `${(poolConfig.totalVramBytes / (1024 * 1024 * 1024)).toFixed(0)} GB`,
      );
    }
  }

  // ── Subscribe to RAM pressure alerts from hardware-manager ──
  onHardwareEvent("ram-warn", () => {
    if (!pauseNewLoads) {
      pauseNewLoads = true;
      logger.warn("[RAM-WARN] Pausing new model auto-loads due to RAM pressure");
      emitNationalEvent("infrastructure", "pool_loads_paused", "model-pool", {
        reason: "ram-warn",
      });
    }
  });
  onHardwareEvent("ram-critical", () => {
    pauseNewLoads = true;
    logger.warn("[RAM-CRITICAL] Emergency-unloading idle models to free RAM");
    emergencyUnloadIdle().catch(() => {});
  });
  onHardwareEvent("ram-recovered-warn", () => {
    if (pauseNewLoads) {
      pauseNewLoads = false;
      logger.info("[RAM-RECOVERED] Resuming model auto-loads");
      emitNationalEvent("infrastructure", "pool_loads_resumed", "model-pool", {
        reason: "ram-recovered",
      });
    }
  });
  onHardwareEvent("ram-recovered-critical", () => {
    if (pauseNewLoads) {
      pauseNewLoads = false;
      logger.info("[RAM-RECOVERED] Resuming model auto-loads (critical cleared)");
    }
  });

  // Pre-warm models
  for (const modelKey of poolConfig.preWarmModels) {
    try {
      const loaded = getLoadedModels();
      if (!loaded.some((m) => m.key === modelKey)) {
        await loadModel({ model: modelKey });
        emitNationalEvent("infrastructure", "pool_prewarm", "model-pool", { model: modelKey });
      }
    } catch {
      // Model may not be available — non-fatal
    }
  }

  // Seed lastUsed for ALL currently-loaded models so they don't get
  // immediately evicted on startup (managementLoop checks idle time).
  try {
    const currentModels = await listModels().catch(() => [] as LMStudioModelInfo[]);
    const currentLoaded = currentModels.filter((m) => m.loadedInstances.length > 0);
    const now = Date.now();
    for (const m of currentLoaded) {
      lastUsed.set(m.key, now);
    }
    if (currentLoaded.length > 0) {
      logger.info(`Seeded lastUsed for ${currentLoaded.length} pre-loaded model(s) — won't auto-unload`);
    }
  } catch { /* non-fatal */ }

  // Start management loop
  pollInterval = setInterval(managementLoop, poolConfig.pollIntervalMs);

  // Initial sweep (safe now — lastUsed seeded above)
  managementLoop().catch(() => {});
}

/**
 * Shut down the model pool manager.
 */
export function shutdownModelPool(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ─── Demand Tracking ────────────────────────────────────────────

/**
 * Record a demand signal for a model.
 * Called by ClawRouter bridge when a citizen requests inference with a specific model.
 */
export function recordModelDemand(modelKey: string): void {
  lastUsed.set(modelKey, Date.now());

  const now = Date.now();
  let d = demand.get(modelKey);

  if (!d || now - d.windowStart > DEMAND_WINDOW_MS) {
    // New window
    d = { modelKey, requests: 0, windowStart: now, lastRequested: now };
    demand.set(modelKey, d);
  }

  d.requests++;
  d.lastRequested = now;
}

/**
 * Get the current demand level for a model.
 */
export function getModelDemand(modelKey: string): number {
  const d = demand.get(modelKey);
  if (!d || Date.now() - d.windowStart > DEMAND_WINDOW_MS) {return 0;}
  return d.requests;
}

// ─── Management Loop ────────────────────────────────────────────

/**
 * Core management loop: check demand, auto-load/unload models, enforce VRAM budget.
 */
async function managementLoop(): Promise<void> {
  try {
    // 1. Refresh model list from LM Studio
    const allModels = await listModels().catch(() => [] as LMStudioModelInfo[]);
    const loaded = allModels.filter((m) => m.loadedInstances.length > 0);

    // 2. Calculate VRAM usage (estimate from loaded model sizes)
    const vramUsed = loaded.reduce((sum, m) => sum + m.sizeBytes, 0);
    const vramPercent = vramUsed / poolConfig.totalVramBytes;

    // 3. Auto-unload idle models
    const idleThresholdMs = poolConfig.idleUnloadMinutes * 60 * 1000;
    const now = Date.now();

    for (const model of loaded) {
      const lu = lastUsed.get(model.key) ?? 0;
      const isIdle = now - lu > idleThresholdMs;

      // Don't unload pre-warmed models unless VRAM is critical
      const isPreWarm = poolConfig.preWarmModels.includes(model.key);

      if (isIdle && (!isPreWarm || vramPercent > 0.95)) {
        try {
          const instanceId = model.loadedInstances[0]?.id;
          if (instanceId) {
            await unloadModel(instanceId);
            stats.autoUnloads++;
            emitNationalEvent("infrastructure", "pool_auto_unload", "model-pool", {
              model: model.key,
              reason: isPreWarm ? "vram_critical" : "idle",
              idleMinutes: Math.round((now - lu) / 60_000),
            });
          }
        } catch {
          // Non-fatal — will retry next loop
        }
      }
    }

    // 4. Auto-load high-demand models (skip entirely when RAM pressure active)
    if (pauseNewLoads) {
      logger.info("Skipping auto-loads — RAM pressure pause active");
    }
    for (const [modelKey, d] of demand) {
      if (pauseNewLoads) {break;}
      if (d.requests < poolConfig.autoLoadThreshold) {continue;}
      if (Date.now() - d.windowStart > DEMAND_WINDOW_MS) {continue;}

      // Already loaded?
      if (loaded.some((m) => m.key === modelKey)) {continue;}

      // VRAM budget check
      const refreshedVram = loaded.reduce((sum, m) => sum + m.sizeBytes, 0) / poolConfig.totalVramBytes;
      if (refreshedVram >= poolConfig.maxVramUsage) {
        emitNationalEvent("infrastructure", "pool_vram_full", "model-pool", {
          model: modelKey,
          vramPercent: Math.round(refreshedVram * 100),
        });
        continue;
      }

      // Is the model available locally?
      const available = allModels.find((m) => m.key === modelKey);
      if (available) {
        try {
          await loadModel({ model: modelKey });
          stats.autoLoads++;
          emitNationalEvent("infrastructure", "pool_auto_load", "model-pool", {
            model: modelKey,
            demandCount: d.requests,
          });
        } catch {
          // Load failed — may need download
        }
      } else {
        // Model not available — attempt auto-download
        if (!pendingDownloads.has(modelKey)) {
          try {
            const result = await downloadModel(modelKey);
            if (result.jobId) {
              pendingDownloads.set(modelKey, result.jobId);
              stats.autoDownloads++;
              emitNationalEvent("infrastructure", "pool_auto_download", "model-pool", {
                model: modelKey,
                jobId: result.jobId,
              });
            }
          } catch {
            // Download failed — non-fatal
          }
        }
      }
    }

    // 5. Check pending downloads
    for (const [modelKey, jobId] of pendingDownloads) {
      try {
        const status = await getDownloadStatus(jobId);
        if (status.status === "completed") {
          pendingDownloads.delete(modelKey);
          // Auto-load the freshly downloaded model
          try {
            await loadModel({ model: modelKey });
            stats.autoLoads++;
          } catch { /* non-fatal */ }
        } else if (status.status === "failed") {
          pendingDownloads.delete(modelKey);
        }
      } catch {
        pendingDownloads.delete(modelKey);
      }
    }

    // 6. Clean up stale sessions
    cleanupStaleSessions();

  } catch (err) {
    logger.warn(`Management loop error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── Emergency Unload ───────────────────────────────────────────

/**
 * Emergency-unload all idle LM Studio models to free RAM.
 * Called automatically when `ram-critical` fires.
 */
async function emergencyUnloadIdle(): Promise<void> {
  try {
    const allModels = await listModels().catch(() => [] as LMStudioModelInfo[]);
    const loaded = allModels.filter((m) => m.loadedInstances.length > 0);
    let unloaded = 0;

    for (const model of loaded) {
      const instanceId = model.loadedInstances[0]?.id;
      if (!instanceId) {continue;}
      try {
        await unloadModel(instanceId);
        unloaded++;
        stats.autoUnloads++;
        logger.warn(`[EMERGENCY] Unloaded model "${model.key}" to free RAM`);
      } catch {
        // Non-fatal — some models may be in use
      }
    }

    if (unloaded > 0) {
      emitNationalEvent("infrastructure", "pool_emergency_unload", "model-pool", {
        unloaded,
        reason: "ram-critical",
      });
    }
  } catch {
    // Emergency unload is best-effort
  }
}

// ─── Configuration ──────────────────────────────────────────────

/**
 * Update pool configuration at runtime.
 */
export function updatePoolConfig(updates: Partial<PoolConfig>): void {
  poolConfig = { ...poolConfig, ...updates };

  if (updates.pollIntervalMs && pollInterval) {
    clearInterval(pollInterval);
    pollInterval = setInterval(managementLoop, poolConfig.pollIntervalMs);
  }
}

/**
 * Get current pool configuration.
 */
export function getPoolConfig(): PoolConfig {
  return { ...poolConfig };
}

// ─── Diagnostics ────────────────────────────────────────────────

/**
 * Get model pool statistics.
 */
export async function getPoolStats(): Promise<PoolStats> {
  try {
    const allModels = await listModels().catch(() => [] as LMStudioModelInfo[]);
    const loaded = allModels.filter((m) => m.loadedInstances.length > 0);
    const vramUsed = loaded.reduce((sum, m) => sum + m.sizeBytes, 0);

    const demandMap: Record<string, number> = {};
    for (const [key, d] of demand) {
      if (Date.now() - d.windowStart <= DEMAND_WINDOW_MS) {
        demandMap[key] = d.requests;
      }
    }

    return {
      totalLoadedModels: loaded.length,
      totalAvailableModels: allModels.length,
      estimatedVramUsedBytes: vramUsed,
      vramUsagePercent: Math.round((vramUsed / poolConfig.totalVramBytes) * 100),
      autoLoads: stats.autoLoads,
      autoUnloads: stats.autoUnloads,
      autoDownloads: stats.autoDownloads,
      demandMap,
    };
  } catch {
    return {
      totalLoadedModels: 0,
      totalAvailableModels: 0,
      estimatedVramUsedBytes: 0,
      vramUsagePercent: 0,
      autoLoads: stats.autoLoads,
      autoUnloads: stats.autoUnloads,
      autoDownloads: stats.autoDownloads,
      demandMap: {},
    };
  }
}
