/**
 * Plugin Lifecycle Manager — Warm/Cold/Loading/Evict state machine
 *
 * Manages plugin readiness for the production pipeline without depending
 * on the heavy plugin-manager internals. Acts as a thin coordination layer:
 *
 *   discovered → loading → warm → (busy while jobs run) → idle → evicted
 *                   ↑_cold-start triggered automatically_↑
 *
 * Key features:
 *   - Auto cold-start: when demand > 0 for a cold plugin, activatePlugin()
 *     is called automatically and pending jobs coalesce.
 *   - Pre-warm: if pending queue depth ≥ PRE_WARM_THRESHOLD and plugin is
 *     cold, warm it proactively before a scheduler slot becomes available.
 *   - Auto-evict: after IDLE_TTL_MS of 0 running jobs, deactivatePlugin()
 *     is called to release RAM/VRAM.
 *   - Idempotent activation: concurrent cold-start requests coalesce into
 *     one activatePlugin() call.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("plugin-lifecycle");

// ─── Config ────────────────────────────────────────────────────────────────

/** Minimum pending jobs to trigger pre-warm (proactive activation). */
const PRE_WARM_THRESHOLD = 3;

/**
 * How long (ms) a plugin must be idle (0 running jobs) before eviction.
 * Light TTS plugins evict quickly; heavy video plugins stay longer.
 */
const IDLE_TTL_DEFAULTS: Record<string, number> = {
  "hoc-plugin-bark":          2 * 60_000,   // 2 min
  "hoc-plugin-chatterbox":    2 * 60_000,
  "hoc-plugin-qwen3-tts":     2 * 60_000,
  "hoc-plugin-mmaudio":       5 * 60_000,   // 5 min
  "hoc-plugin-funmusic":      5 * 60_000,
  "hoc-plugin-switti":        5 * 60_000,
  "hoc-plugin-omnigen":      10 * 60_000,   // 10 min
  "hoc-plugin-glm-image":    10 * 60_000,
  "hoc-plugin-deforum":      15 * 60_000,   // 15 min — heavy
  "hoc-plugin-storydiffusion":15 * 60_000,
  "hoc-plugin-magicanimate": 15 * 60_000,
  "hoc-plugin-sparc3d":      20 * 60_000,   // 20 min — very heavy
  "hoc-plugin-easyvolcap":   20 * 60_000,
  "hoc-plugin-ai-scientist":  30 * 60_000,  // 30 min — extremely heavy
};
const DEFAULT_IDLE_TTL_MS = 10 * 60_000;

/** Check interval for eviction loop. */
const EVICTION_CHECK_INTERVAL_MS = 30_000;

// ─── Types ─────────────────────────────────────────────────────────────────

export type PluginReadyState =
  | "cold"      // not loaded
  | "loading"   // activatePlugin() called, waiting for it to finish
  | "warm"      // loaded, 0 running jobs
  | "busy"      // loaded, ≥1 running jobs
  | "failed"    // last activation attempt failed
  | "evicted";  // was warm, idle TTL elapsed, deactivated

export interface PluginStatus {
  pluginId: string;
  state: PluginReadyState;
  runningJobs: number;
  pendingWakeJobs: number; // jobs queued waiting for cold-start
  idleSince: number | null;
  lastActivatedAt: number | null;
  lastEvictedAt: number | null;
  failError: string | null;
  coldStartEtaSec: number | null; // null if warm
}

interface PluginRecord {
  pluginId: string;
  state: PluginReadyState;
  runningJobs: number;
  pendingWake: Array<() => void>; // resolve callbacks waiting for warm
  idleSince: number | null;
  lastActivatedAt: number | null;
  lastEvictedAt: number | null;
  failError: string | null;
  activatingPromise: Promise<void> | null;
}

// ─── Gateway hook type (injected at init) ────────────────────────────────

type ActivateFn = (pluginId: string) => Promise<{ ok: boolean; error?: string }>;
type DeactivateFn = (pluginId: string) => Promise<{ ok: boolean }>;

let _activate: ActivateFn | null = null;
let _deactivate: DeactivateFn | null = null;
let _evictionTimer: ReturnType<typeof setInterval> | null = null;

// ─── State ─────────────────────────────────────────────────────────────────

const plugins = new Map<string, PluginRecord>();

function getRecord(pluginId: string): PluginRecord {
  let r = plugins.get(pluginId);
  if (!r) {
    r = {
      pluginId,
      state: "cold",
      runningJobs: 0,
      pendingWake: [],
      idleSince: null,
      lastActivatedAt: null,
      lastEvictedAt: null,
      failError: null,
      activatingPromise: null,
    };
    plugins.set(pluginId, r);
  }
  return r;
}

// ─── Internal helpers ─────────────────────────────────────────────────────

async function doActivate(rec: PluginRecord): Promise<void> {
  if (!_activate) {
    logger.warn(`[Lifecycle] No activateFn registered — cannot warm ${rec.pluginId}`);
    rec.state = "failed";
    rec.failError = "No activation function registered";
    rec.activatingPromise = null;
    flushPending(rec);
    return;
  }

  logger.info(`[Lifecycle] Cold-starting ${rec.pluginId}…`);
  rec.state = "loading";

  try {
    const result = await _activate(rec.pluginId);
    if (result.ok) {
      rec.state = "warm";
      rec.lastActivatedAt = Date.now();
      rec.idleSince = Date.now();
      rec.failError = null;
      logger.info(`[Lifecycle] ${rec.pluginId} is now warm`);
    } else {
      rec.state = "failed";
      rec.failError = result.error ?? "activation failed";
      logger.warn(`[Lifecycle] ${rec.pluginId} activation failed: ${rec.failError}`);
    }
  } catch (err) {
    rec.state = "failed";
    rec.failError = String(err);
    logger.warn(`[Lifecycle] ${rec.pluginId} activation threw: ${rec.failError}`);
  }

  rec.activatingPromise = null;
  flushPending(rec);
}

/** Resolve all pending-wake callbacks when plugin becomes warm (or failed). */
function flushPending(rec: PluginRecord): void {
  const wake = rec.pendingWake.splice(0);
  for (const fn of wake) {
    try { fn(); } catch { /* no-op */ }
  }
}

/** Eviction loop — runs every EVICTION_CHECK_INTERVAL_MS. */
function runEvictionCheck(): void {
  const now = Date.now();
  for (const rec of plugins.values()) {
    if (rec.state !== "warm") { continue; }
    if (rec.runningJobs > 0) { continue; }

    const idleTtl = IDLE_TTL_DEFAULTS[rec.pluginId] ?? DEFAULT_IDLE_TTL_MS;
    const idleSince = rec.idleSince ?? now;

    if (now - idleSince >= idleTtl) {
      rec.state = "evicted";
      rec.lastEvictedAt = now;
      logger.info(`[Lifecycle] Evicting idle plugin ${rec.pluginId} (idle ${Math.round((now - idleSince) / 1000)}s)`);

      if (_deactivate) {
        _deactivate(rec.pluginId).catch((err) => {
          logger.warn(`[Lifecycle] deactivate(${rec.pluginId}) failed: ${String(err)}`);
        });
      }
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Initialize the lifecycle manager with gateway hook functions.
 * Call once at gateway startup before any scheduler activity.
 */
export function initLifecycleManager(
  activateFn: ActivateFn,
  deactivateFn: DeactivateFn,
): void {
  _activate = activateFn;
  _deactivate = deactivateFn;

  if (_evictionTimer) { clearInterval(_evictionTimer); }
  _evictionTimer = setInterval(runEvictionCheck, EVICTION_CHECK_INTERVAL_MS);
  logger.info("[Lifecycle] Manager initialized");
}

/**
 * Ensure a plugin is warm. If cold/evicted, triggers activation and returns
 * a promise that resolves when the plugin is ready (or rejects on failure).
 *
 * If the plugin is already warm, resolves immediately.
 * If already loading, coalesces onto the existing activating promise.
 */
export async function ensureWarm(pluginId: string): Promise<void> {
  const rec = getRecord(pluginId);

  if (rec.state === "warm" || rec.state === "busy") {
    return;
  }

  if (rec.state === "loading" && rec.activatingPromise) {
    return rec.activatingPromise;
  }

  if (rec.state === "cold" || rec.state === "evicted" || rec.state === "failed") {
    rec.activatingPromise = doActivate(rec);
    return rec.activatingPromise;
  }
}

/**
 * Notify lifecycle manager that a job has started running on a plugin.
 * Call AFTER ensureWarm() succeeds and the job is dispatched.
 */
export function onJobStart(pluginId: string): void {
  const rec = getRecord(pluginId);
  rec.runningJobs = Math.max(0, rec.runningJobs) + 1;
  rec.state = rec.runningJobs > 0 ? "busy" : "warm";
  rec.idleSince = null;
}

/**
 * Notify lifecycle manager that a job has finished (completed or failed).
 * Transitions to warm if no other jobs running.
 */
export function onJobEnd(pluginId: string): void {
  const rec = getRecord(pluginId);
  rec.runningJobs = Math.max(0, rec.runningJobs - 1);
  if (rec.runningJobs === 0) {
    rec.state = "warm";
    rec.idleSince = Date.now();
  }
}

/**
 * Inform lifecycle that a plugin was externally activated (e.g. operator
 * manually activated it via plugins.activate RPC).
 */
export function notifyPluginActivated(pluginId: string): void {
  const rec = getRecord(pluginId);
  rec.state = "warm";
  rec.lastActivatedAt = Date.now();
  rec.idleSince = Date.now();
  rec.failError = null;
  rec.activatingPromise = null;
  flushPending(rec);
}

/**
 * Inform lifecycle that a plugin was externally deactivated.
 */
export function notifyPluginDeactivated(pluginId: string): void {
  const rec = getRecord(pluginId);
  rec.state = "cold";
  rec.runningJobs = 0;
  rec.idleSince = null;
  rec.lastEvictedAt = Date.now();
}

/**
 * Pre-warm a plugin proactively if pending jobs exceed threshold.
 * Call this from the scheduler when enqueueing jobs for a cold plugin.
 */
export function considerPreWarm(pluginId: string, pendingCount: number): void {
  if (pendingCount < PRE_WARM_THRESHOLD) { return; }
  const rec = getRecord(pluginId);
  if (rec.state === "cold" || rec.state === "evicted") {
    logger.info(`[Lifecycle] Pre-warming ${pluginId} (${pendingCount} pending jobs)`);
    rec.activatingPromise = doActivate(rec);
  }
}

/**
 * Get the readiness state and stats for a plugin.
 */
export function getPluginStatus(pluginId: string): PluginStatus {
  const rec = getRecord(pluginId);
  return {
    pluginId: rec.pluginId,
    state: rec.state,
    runningJobs: rec.runningJobs,
    pendingWakeJobs: rec.pendingWake.length,
    idleSince: rec.idleSince,
    lastActivatedAt: rec.lastActivatedAt,
    lastEvictedAt: rec.lastEvictedAt,
    failError: rec.failError,
    coldStartEtaSec:
      rec.state === "loading" ? 60 : null, // will be improved with real timing
  };
}

/**
 * Get all tracked plugin statuses.
 */
export function getAllPluginStatuses(): PluginStatus[] {
  return [...plugins.values()].map((r) => getPluginStatus(r.pluginId));
}

/** Total count of warm/busy plugins. */
export function warmPluginCount(): number {
  return [...plugins.values()].filter((r) => r.state === "warm" || r.state === "busy").length;
}
