/**
 * Heap Monitor — Memory Pressure Detection & Proactive Defense
 *
 * Monitors heap usage and RSS to detect memory pressure before it causes
 * native crashes. Provides 4 pressure levels with automatic responses:
 *
 *   NORMAL  (< 70%)  — Business as usual
 *   WARNING (70-85%) — Proactive GC, log warning
 *   CRITICAL(85-95%) — Shed load (pause polling, reduce tick frequency)
 *   EMERGENCY(> 95%) — Graceful shutdown with state save
 *
 * Also tracks RSS delta over time to detect memory leaks.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("heap-monitor");

// ─── Types ──────────────────────────────────────────────────────

export type PressureLevel = "normal" | "warning" | "critical" | "emergency";

export interface HeapSnapshot {
  timestamp: number;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
  arrayBuffersMB: number;
  pressureLevel: PressureLevel;
  heapPct: number;
}

export interface HeapMonitorConfig {
  /** Check interval in ms (default: 30000) */
  intervalMs?: number;
  /** Max old space size in MB — used for pressure calculation.
   *  Should match --max-old-space-size flag. Default: 4096 */
  maxHeapMB?: number;
  /** Warning threshold as fraction (default: 0.70) */
  warningThreshold?: number;
  /** Critical threshold as fraction (default: 0.85) */
  criticalThreshold?: number;
  /** Emergency threshold as fraction (default: 0.95) */
  emergencyThreshold?: number;
  /** RSS growth alert: MB per hour that indicates a leak (default: 100) */
  leakRateMBPerHour?: number;
  /** Callback for pressure changes */
  onPressureChange?: (level: PressureLevel, snapshot: HeapSnapshot) => void;
  /** Callback for emergency — should trigger graceful shutdown */
  onEmergency?: (snapshot: HeapSnapshot) => void;
  /** Callback for load shedding — should reduce work */
  onShedLoad?: (shedding: boolean) => void;
}

// ─── State ──────────────────────────────────────────────────────

let _timer: NodeJS.Timeout | null = null;
let _currentLevel: PressureLevel = "normal";
let _shedding = false;
let _config: Required<HeapMonitorConfig>;
let _startTime = 0;
let _startRSS = 0;
let _consecutiveWarnings = 0;
let _lastGcTime = 0;
const _history: HeapSnapshot[] = [];
const MAX_HISTORY = 120; // 1 hour at 30s intervals

// ─── Defaults ───────────────────────────────────────────────────

const DEFAULTS: Required<HeapMonitorConfig> = {
  intervalMs: 30_000,
  maxHeapMB: 4096,
  warningThreshold: 0.70,
  criticalThreshold: 0.85,
  emergencyThreshold: 0.95,
  leakRateMBPerHour: 100,
  onPressureChange: () => {},
  onEmergency: () => {},
  onShedLoad: () => {},
};

// ─── Public API ─────────────────────────────────────────────────

/**
 * Start the heap monitor. Call once during gateway startup.
 */
export function startHeapMonitor(config: HeapMonitorConfig = {}): void {
  if (_timer) { return; } // Already running

  _config = { ...DEFAULTS, ...config };
  _startTime = Date.now();
  _startRSS = process.memoryUsage.rss() / (1024 * 1024);

  logger.info(
    `Heap monitor started (max=${_config.maxHeapMB}MB, warning=${(_config.warningThreshold * 100).toFixed(0)}%, ` +
    `critical=${(_config.criticalThreshold * 100).toFixed(0)}%, emergency=${(_config.emergencyThreshold * 100).toFixed(0)}%)`,
  );

  // First check immediately
  checkHeap();

  // Then periodic — unref so it doesn't prevent clean shutdown
  _timer = setInterval(checkHeap, _config.intervalMs);
  _timer.unref();
}

/**
 * Stop the heap monitor.
 */
export function stopHeapMonitor(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

/**
 * Get the current pressure level.
 */
export function getHeapPressure(): PressureLevel {
  return _currentLevel;
}

/**
 * Check if load shedding is active.
 * Consumers should check this before doing non-essential work:
 *   - Skip LM Studio polling
 *   - Reduce tick frequency
 *   - Pause Intelligence Bus broadcasts
 *   - Defer non-critical model council syncs
 */
export function isLoadShedding(): boolean {
  return _shedding;
}

/**
 * Get the latest heap snapshot.
 */
export function getLatestSnapshot(): HeapSnapshot | null {
  return _history.length > 0 ? _history[_history.length - 1] : null;
}

/**
 * Get heap history (last N snapshots).
 */
export function getHeapHistory(count = 30): HeapSnapshot[] {
  return _history.slice(-count);
}

/**
 * Force a manual GC if --expose-gc is enabled.
 * Returns true if GC was triggered.
 */
export function forceGC(): boolean {
  if (typeof global.gc === "function") {
    const before = process.memoryUsage.rss() / (1024 * 1024);
    global.gc();
    const after = process.memoryUsage.rss() / (1024 * 1024);
    logger.info(`Manual GC: ${before.toFixed(0)} MB → ${after.toFixed(0)} MB (freed ${(before - after).toFixed(0)} MB)`);
    _lastGcTime = Date.now();
    return true;
  }
  return false;
}

// ─── Core Check ─────────────────────────────────────────────────

function checkHeap(): void {
  const mem = process.memoryUsage();
  const heapUsedMB = mem.heapUsed / (1024 * 1024);
  const heapTotalMB = mem.heapTotal / (1024 * 1024);
  const rssMB = mem.rss / (1024 * 1024);
  const externalMB = mem.external / (1024 * 1024);
  const arrayBuffersMB = mem.arrayBuffers / (1024 * 1024);

  // Calculate pressure against configured max
  const heapPct = heapUsedMB / _config.maxHeapMB;

  const snapshot: HeapSnapshot = {
    timestamp: Date.now(),
    heapUsedMB: Math.round(heapUsedMB),
    heapTotalMB: Math.round(heapTotalMB),
    rssMB: Math.round(rssMB),
    externalMB: Math.round(externalMB),
    arrayBuffersMB: Math.round(arrayBuffersMB),
    pressureLevel: "normal",
    heapPct: Math.round(heapPct * 100),
  };

  // ── Determine pressure level ──
  let newLevel: PressureLevel = "normal";
  if (heapPct >= _config.emergencyThreshold) {
    newLevel = "emergency";
  } else if (heapPct >= _config.criticalThreshold) {
    newLevel = "critical";
  } else if (heapPct >= _config.warningThreshold) {
    newLevel = "warning";
  }
  snapshot.pressureLevel = newLevel;

  // ── Track history ──
  _history.push(snapshot);
  if (_history.length > MAX_HISTORY) { _history.shift(); }

  // ── Handle level transitions ──
  if (newLevel !== _currentLevel) {
    const prevLevel = _currentLevel;
    _currentLevel = newLevel;

    logger.warn(
      `Memory pressure: ${prevLevel} → ${newLevel} ` +
      `(heap ${snapshot.heapUsedMB}/${_config.maxHeapMB} MB = ${snapshot.heapPct}%, RSS ${snapshot.rssMB} MB)`,
    );

    _config.onPressureChange(newLevel, snapshot);

    // Handle specific transitions
    if (newLevel === "warning" || newLevel === "critical") {
      _consecutiveWarnings++;

      // Proactive GC — but not more than once per 30s
      if (Date.now() - _lastGcTime > 30_000) {
        forceGC();
      }
    } else if (newLevel === "normal") {
      _consecutiveWarnings = 0;
    }

    // Load shedding
    if (newLevel === "critical" && !_shedding) {
      _shedding = true;
      logger.warn("LOAD SHEDDING ACTIVATED — reducing non-essential work");
      _config.onShedLoad(true);
    } else if (newLevel === "normal" && _shedding) {
      _shedding = false;
      logger.info("Load shedding deactivated — resuming normal operations");
      _config.onShedLoad(false);
    }

    // Emergency
    if (newLevel === "emergency") {
      logger.error(
        `EMERGENCY: Heap at ${snapshot.heapPct}% (${snapshot.heapUsedMB} MB). ` +
        `Triggering graceful shutdown.`,
      );
      _config.onEmergency(snapshot);
    }
  }

  // ── Periodic GC under sustained warning ──
  if (_consecutiveWarnings >= 3 && Date.now() - _lastGcTime > 60_000) {
    forceGC();
  }

  // ── Leak detection (check every 5 minutes) ──
  if (_history.length >= 10) {
    const tenAgo = _history[_history.length - 10];
    const elapsed = (snapshot.timestamp - tenAgo.timestamp) / (1000 * 3600); // hours
    if (elapsed > 0) {
      const rssGrowthRate = (snapshot.rssMB - tenAgo.rssMB) / elapsed; // MB/hour
      if (rssGrowthRate > _config.leakRateMBPerHour) {
        logger.warn(
          `Possible memory leak: RSS growing at ${rssGrowthRate.toFixed(0)} MB/hour ` +
          `(${tenAgo.rssMB} MB → ${snapshot.rssMB} MB)`,
        );
      }
    }
  }

  // ── Periodic status log (every 5 minutes = ~10 checks at 30s) ──
  if (_history.length % 10 === 0) {
    const uptimeMin = Math.round((Date.now() - _startTime) / 60_000);
    const rssGrowth = Math.round(rssMB - _startRSS);
    logger.info(
      `Heap: ${snapshot.heapUsedMB}/${_config.maxHeapMB} MB (${snapshot.heapPct}%) | ` +
      `RSS: ${snapshot.rssMB} MB (+${rssGrowth} MB since start) | ` +
      `Uptime: ${uptimeMin} min | Level: ${snapshot.pressureLevel}`,
    );
  }
}
