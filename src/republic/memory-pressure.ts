/**
 * Republic Platform — Memory Pressure Manager
 *
 * Monitors V8 heap utilization and applies graduated pressure responses:
 *
 *   Level 0 (< 80%):  Normal operation
 *   Level 1 (80-90%): Hint GC, trim caches
 *   Level 2 (90-95%): Aggressive array trimming, warn log
 *   Level 3 (> 95%):  Emergency handler shedding via orchestrator
 *
 * Integrates with:
 *   - TickOrchestrator (auto-shed/re-enable handlers)
 *   - State arrays (aggressive trimming)
 *   - Intelligence bus (publish hardware.alert)
 */

import v8 from "node:v8";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("republic:memory-pressure");

// ─── Types ──────────────────────────────────────────────────────

export type PressureLevel = 0 | 1 | 2 | 3;

export interface MemorySnapshot {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
  externalMB: number;
  utilization: number; // 0-1
  level: PressureLevel;
  timestamp: number;
}

export interface MemoryPressureStats {
  current: MemorySnapshot;
  peakHeapMB: number;
  level: PressureLevel;
  gcHints: number;
  aggressiveTrims: number;
  emergencySheds: number;
  shedHandlers: string[];
  eventLoopLagMs: number;
}

// ─── Configuration ──────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000; // Check every 10s
const LEVEL_1_THRESHOLD = 0.80;
const LEVEL_2_THRESHOLD = 0.90;
const LEVEL_3_THRESHOLD = 0.95;

/** Low-priority handler groups to shed first under memory pressure */
const SHED_PRIORITY = [
  "civilization",
  "agi",
  "self-evolving",
  "cognition",
  "gap",
  "integration",
] as const;

// ─── Manager ────────────────────────────────────────────────────

export class MemoryPressureManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private _level: PressureLevel = 0;
  private _peakHeapMB = 0;
  private _gcHints = 0;
  private _aggressiveTrims = 0;
  private _emergencySheds = 0;
  private _shedHandlers: string[] = [];
  private _lastSnapshot: MemorySnapshot;
  private _eventLoopLagMs = 0;

  /** Callback to shed/re-enable orchestrator handlers */
  private _orchestratorShed: ((groups: string[], enable: boolean) => void) | null = null;
  /** Callback to trim state arrays aggressively */
  private _stateTrimmer: (() => void) | null = null;

  constructor() {
    this._lastSnapshot = this._sample();
  }

  /**
   * Start periodic monitoring.
   * @param orchestratorShed Callback to shed/enable handler groups
   * @param stateTrimmer Callback to aggressively trim state arrays
   */
  start(opts?: {
    orchestratorShed?: (groups: string[], enable: boolean) => void;
    stateTrimmer?: () => void;
  }): void {
    if (this.timer) {
      return;
    }

    this._orchestratorShed = opts?.orchestratorShed ?? null;
    this._stateTrimmer = opts?.stateTrimmer ?? null;

    this.timer = setInterval(() => this._tick(), POLL_INTERVAL_MS);
    this.timer.unref?.();
    logger.info("Memory pressure manager started", {
      pollMs: POLL_INTERVAL_MS,
      thresholds: { L1: LEVEL_1_THRESHOLD, L2: LEVEL_2_THRESHOLD, L3: LEVEL_3_THRESHOLD },
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Re-enable any shed handlers
    if (this._shedHandlers.length > 0 && this._orchestratorShed) {
      this._orchestratorShed(this._shedHandlers, true);
      this._shedHandlers = [];
    }
  }

  /** Set the current event loop lag for combined pressure scoring */
  setEventLoopLag(lagMs: number): void {
    this._eventLoopLagMs = lagMs;
  }

  get level(): PressureLevel {
    return this._level;
  }

  get snapshot(): MemorySnapshot {
    return this._lastSnapshot;
  }

  get stats(): MemoryPressureStats {
    return {
      current: this._lastSnapshot,
      peakHeapMB: this._peakHeapMB,
      level: this._level,
      gcHints: this._gcHints,
      aggressiveTrims: this._aggressiveTrims,
      emergencySheds: this._emergencySheds,
      shedHandlers: [...this._shedHandlers],
      eventLoopLagMs: this._eventLoopLagMs,
    };
  }

  // ── Internal ────────────────────────────────────────────────────

  private _sample(): MemorySnapshot {
    const mem = process.memoryUsage();
    const heapUsedMB = mem.heapUsed / 1024 / 1024;
    // Use the ACTUAL heap limit (--max-old-space-size), NOT heapTotal.
    // heapTotal is V8's *currently allocated* heap which starts small and grows.
    // On a 64GB system with --max-old-space-size=8192, heapTotal might be 300MB
    // while the real limit is 8192MB. Using heapTotal causes false 96% readings.
    const heapStats = v8.getHeapStatistics();
    const heapLimitMB = heapStats.heap_size_limit / 1024 / 1024;
    const utilization = heapLimitMB > 0 ? heapUsedMB / heapLimitMB : 0;

    return {
      heapUsedMB: parseFloat(heapUsedMB.toFixed(1)),
      heapTotalMB: parseFloat(heapLimitMB.toFixed(1)), // report the LIMIT, not allocated
      rssMB: parseFloat((mem.rss / 1024 / 1024).toFixed(1)),
      externalMB: parseFloat((mem.external / 1024 / 1024).toFixed(1)),
      utilization: parseFloat(utilization.toFixed(3)),
      level: this._computeLevel(utilization),
      timestamp: Date.now(),
    };
  }

  private _computeLevel(utilization: number): PressureLevel {
    if (utilization >= LEVEL_3_THRESHOLD) {
      return 3;
    }
    if (utilization >= LEVEL_2_THRESHOLD) {
      return 2;
    }
    if (utilization >= LEVEL_1_THRESHOLD) {
      return 1;
    }
    return 0;
  }

  private _tick(): void {
    const snap = this._sample();
    this._lastSnapshot = snap;
    this._peakHeapMB = Math.max(this._peakHeapMB, snap.heapUsedMB);

    const prevLevel = this._level;
    this._level = snap.level;

    // ── Level transitions ──
    if (this._level !== prevLevel) {
      if (this._level > prevLevel) {
        logger.warn(
          `Memory pressure INCREASED: L${prevLevel} → L${this._level} (heap: ${snap.heapUsedMB}/${snap.heapTotalMB}MB = ${(snap.utilization * 100).toFixed(1)}%)`,
        );
      } else {
        logger.info(
          `Memory pressure decreased: L${prevLevel} → L${this._level} (heap: ${snap.heapUsedMB}/${snap.heapTotalMB}MB)`,
        );
      }
    }

    // ── Level 1: Hint GC ──
    if (this._level >= 1) {
      this._hintGC();
    }

    // ── Level 2: Aggressive trim ──
    if (this._level >= 2) {
      this._aggressiveTrim();
    }

    // ── Level 3: Emergency shed ──
    if (this._level >= 3 && this._shedHandlers.length === 0) {
      this._emergencyShed();
    }

    // ── Recovery: re-enable shed handlers when pressure drops below L2 ──
    if (this._level < 2 && this._shedHandlers.length > 0) {
      logger.info(`Memory pressure recovered — re-enabling ${this._shedHandlers.length} shed handlers`);
      if (this._orchestratorShed) {
        this._orchestratorShed(this._shedHandlers, true);
      }
      this._shedHandlers = [];
    }
  }

  private _hintGC(): void {
    // global.gc is only available with --expose-gc flag; graceful no-op otherwise
    const gc = (globalThis as unknown as Record<string, unknown>).gc;
    if (typeof gc === "function") {
      try {
        (gc as () => void)();
        this._gcHints++;
      } catch {
        // GC hint failed — non-fatal
      }
    }
  }

  private _aggressiveTrim(): void {
    this._aggressiveTrims++;
    if (this._stateTrimmer) {
      this._stateTrimmer();
    }
  }

  private _emergencyShed(): void {
    this._emergencySheds++;
    if (!this._orchestratorShed) {
      return;
    }

    // Shed lowest-priority groups first
    const toShed = [...SHED_PRIORITY];
    this._shedHandlers = toShed.map((g) => g);
    this._orchestratorShed(toShed, false);
    logger.error(
      `🚨 Emergency handler shedding: disabled ${toShed.length} handler groups due to memory pressure (heap: ${this._lastSnapshot.heapUsedMB}MB)`,
    );
  }
}

// ─── Singleton ──────────────────────────────────────────────────

let _manager: MemoryPressureManager | null = null;

export function getMemoryPressureManager(): MemoryPressureManager {
  if (!_manager) {
    _manager = new MemoryPressureManager();
  }
  return _manager;
}

export function shutdownMemoryPressure(): void {
  if (_manager) {
    _manager.stop();
    _manager = null;
  }
}
