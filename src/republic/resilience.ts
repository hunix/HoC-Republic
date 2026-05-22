/**
 * Republic Platform — Resilience & Self-Healing
 *
 * Phase 30: Making the republic indestructible.
 *
 * - Circuit breaker for external calls (LLM, APIs, webhooks)
 * - Health probe system with auto-recovery actions
 * - Watchdog timer for tick loop monitoring
 * - Self-healing loop (independent from tick loop)
 */

import { cpus, freemem, loadavg, totalmem } from "node:os";

// ─── Circuit Breaker ────────────────────────────────────────────

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit */
  failureThreshold?: number;
  /** Ms to wait before half-opening */
  resetTimeoutMs?: number;
  /** Number of successful probes in half-open to close */
  halfOpenProbes?: number;
  /** Name for logging */
  name?: string;
}

/**
 * Circuit breaker pattern — prevents cascading failures.
 *
 * CLOSED → (failures exceed threshold) → OPEN
 * OPEN → (timeout expires) → HALF_OPEN
 * HALF_OPEN → (probes succeed) → CLOSED
 * HALF_OPEN → (probe fails) → OPEN
 */
export class CircuitBreaker {
  private _state: CircuitState = "closed";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureAt = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenProbes: number;
  readonly name: string;

  // Telemetry
  private _totalCalls = 0;
  private _totalSuccesses = 0;
  private _totalFailures = 0;
  private _totalRejections = 0;
  private _stateChanges: Array<{ from: CircuitState; to: CircuitState; at: number }> = [];

  constructor(opts?: CircuitBreakerOptions) {
    this.failureThreshold = opts?.failureThreshold ?? 5;
    this.resetTimeoutMs = opts?.resetTimeoutMs ?? 30_000;
    this.halfOpenProbes = opts?.halfOpenProbes ?? 3;
    this.name = opts?.name ?? "default";
  }

  get state(): CircuitState {
    // Check if we should transition from open → half_open
    if (this._state === "open" && Date.now() - this.lastFailureAt > this.resetTimeoutMs) {
      this.transitionTo("half_open");
    }
    return this._state;
  }

  /** Execute a function through the circuit breaker */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this._totalCalls++;

    if (this.state === "open") {
      this._totalRejections++;
      throw new Error(`Circuit breaker [${this.name}] is OPEN — call rejected`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /** Execute with a fallback when circuit is open */
  async executeWithFallback<T>(fn: () => Promise<T>, fallback: () => T): Promise<T> {
    try {
      return await this.execute(fn);
    } catch (error) {
      if (this._state === "open") {
        return fallback();
      }
      throw error;
    }
  }

  onSuccess(): void {
    this._totalSuccesses++;
    if (this._state === "half_open") {
      this.successCount++;
      if (this.successCount >= this.halfOpenProbes) {
        this.transitionTo("closed");
      }
    } else {
      this.failureCount = 0;
    }
  }

  onFailure(): void {
    this._totalFailures++;
    this.lastFailureAt = Date.now();

    if (this._state === "half_open") {
      this.transitionTo("open");
    } else {
      this.failureCount++;
      if (this.failureCount >= this.failureThreshold) {
        this.transitionTo("open");
      }
    }
  }

  private transitionTo(newState: CircuitState): void {
    const from = this._state;
    this._state = newState;
    this.failureCount = 0;
    this.successCount = 0;
    this._stateChanges.push({ from, to: newState, at: Date.now() });
    if (this._stateChanges.length > 50) {
      this._stateChanges.splice(0, this._stateChanges.length - 50);
    }
  }

  /** Force-reset to closed state */
  reset(): void {
    this.transitionTo("closed");
    this.failureCount = 0;
    this.lastFailureAt = 0;
  }

  get diagnostics() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      totalCalls: this._totalCalls,
      totalSuccesses: this._totalSuccesses,
      totalFailures: this._totalFailures,
      totalRejections: this._totalRejections,
      recentTransitions: this._stateChanges.slice(-5),
    };
  }
}

// ─── Circuit Breaker Registry ───────────────────────────────────

const breakers = new Map<string, CircuitBreaker>();

/** Get or create a named circuit breaker */
export function getCircuitBreaker(name: string, opts?: CircuitBreakerOptions): CircuitBreaker {
  let cb = breakers.get(name);
  if (!cb) {
    cb = new CircuitBreaker({ ...opts, name });
    breakers.set(name, cb);
  }
  return cb;
}

/** Get diagnostics for all circuit breakers */
export function getAllCircuitBreakerDiagnostics() {
  return [...breakers.values()].map((cb) => cb.diagnostics);
}

// ─── Health Probes ──────────────────────────────────────────────

export type ProbeCriticality = "critical" | "warning" | "info";
export type ProbeStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthProbeResult {
  name: string;
  status: ProbeStatus;
  criticality: ProbeCriticality;
  message: string;
  value?: number;
  threshold?: number;
  recoveryAction?: string;
}

export type HealthProbeCheck = () => HealthProbeResult;

/** Built-in health probes */
export function createSystemProbes(): HealthProbeCheck[] {
  return [
    // Memory probe
    () => {
      const free = freemem();
      const total = totalmem();
      const usedPercent = ((total - free) / total) * 100;
      return {
        name: "memory_usage",
        status: usedPercent > 90 ? "unhealthy" : usedPercent > 80 ? "degraded" : "healthy",
        criticality: "critical",
        message: `Memory: ${usedPercent.toFixed(1)}% used (${(free / 1e9).toFixed(2)} GB free)`,
        value: usedPercent,
        threshold: 90,
        recoveryAction: usedPercent > 80 ? "force_gc_and_prune" : undefined,
      };
    },

    // CPU probe
    () => {
      const load = loadavg()[0]; // 1-minute average
      const cpuCount = cpus().length;
      const loadPercent = (load / cpuCount) * 100;
      return {
        name: "cpu_load",
        status: loadPercent > 90 ? "unhealthy" : loadPercent > 70 ? "degraded" : "healthy",
        criticality: "warning",
        message: `CPU: ${loadPercent.toFixed(1)}% load (${cpuCount} cores)`,
        value: loadPercent,
        threshold: 90,
        recoveryAction: loadPercent > 90 ? "reduce_tick_rate" : undefined,
      };
    },

    // Circuit breaker probe
    () => {
      const openBreakers = [...breakers.values()].filter((cb) => cb.state === "open");
      return {
        name: "circuit_breakers",
        status:
          openBreakers.length > 2 ? "unhealthy" : openBreakers.length > 0 ? "degraded" : "healthy",
        criticality: "warning",
        message: `${openBreakers.length} circuit breakers open: ${openBreakers.map((cb) => cb.name).join(", ") || "none"}`,
        value: openBreakers.length,
        threshold: 3,
      };
    },
  ];
}

// ─── Health Check System ────────────────────────────────────────

export interface SystemHealth {
  overall: ProbeStatus;
  probes: HealthProbeResult[];
  checkedAt: string;
  recoveryActions: string[];
}

const customProbes: HealthProbeCheck[] = [];

/** Register a custom health probe */
export function registerHealthProbe(probe: HealthProbeCheck): void {
  customProbes.push(probe);
}

/** Run all health probes and return system health */
export function checkSystemHealth(): SystemHealth {
  const allProbes = [...createSystemProbes(), ...customProbes];
  const results = allProbes.map((probe) => {
    try {
      return probe();
    } catch (error) {
      return {
        name: "unknown",
        status: "unhealthy" as ProbeStatus,
        criticality: "warning" as ProbeCriticality,
        message: `Probe failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  const recoveryActions = results.filter((r) => r.recoveryAction).map((r) => r.recoveryAction!);

  const hasUnhealthy = results.some(
    (r) => r.status === "unhealthy" && r.criticality === "critical",
  );
  const hasDegraded = results.some((r) => r.status !== "healthy");

  return {
    overall: hasUnhealthy ? "unhealthy" : hasDegraded ? "degraded" : "healthy",
    probes: results,
    checkedAt: new Date().toISOString(),
    recoveryActions,
  };
}

// ─── Watchdog Timer ─────────────────────────────────────────────

export interface WatchdogOptions {
  /** Max time (ms) between ticks before triggering recovery */
  maxTickGapMs?: number;
  /** Callback when watchdog triggers */
  onTrigger?: (lastTickAt: number, gapMs: number) => void;
}

/**
 * Watchdog timer — monitors the tick loop.
 * If no tick completes for maxTickGapMs, triggers recovery.
 */
export class WatchdogTimer {
  private lastTickAt = Date.now();
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly maxTickGapMs: number;
  private readonly onTrigger: (lastTickAt: number, gapMs: number) => void;
  private _triggers = 0;

  constructor(opts?: WatchdogOptions) {
    this.maxTickGapMs = opts?.maxTickGapMs ?? 30_000;
    this.onTrigger =
      opts?.onTrigger ??
      (() => {
        /* noop */
      });
  }

  /** Call this at the end of each tick to reset the watchdog */
  kick(): void {
    this.lastTickAt = Date.now();
  }

  /** Start the watchdog */
  start(checkIntervalMs = 5000): void {
    this.lastTickAt = Date.now();
    this.timer = setInterval(() => {
      const gap = Date.now() - this.lastTickAt;
      if (gap > this.maxTickGapMs) {
        this._triggers++;
        this.onTrigger(this.lastTickAt, gap);
        this.lastTickAt = Date.now(); // Reset to avoid re-triggering
      }
    }, checkIntervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /** Stop the watchdog */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get diagnostics() {
    return {
      running: this.timer !== null,
      lastTickAt: new Date(this.lastTickAt).toISOString(),
      maxTickGapMs: this.maxTickGapMs,
      totalTriggers: this._triggers,
      timeSinceLastTick: Date.now() - this.lastTickAt,
    };
  }
}

// ─── Self-Healing Loop ──────────────────────────────────────────

export interface HealingEvent {
  timestamp: string;
  action: string;
  probe: string;
  details: string;
}

const MAX_HEALING_EVENTS = 200;
const healingEvents: HealingEvent[] = [];
let healingTimer: ReturnType<typeof setInterval> | null = null;

/** Recovery action handlers */
const recoveryHandlers: Record<string, () => void> = {
  force_gc_and_prune: () => {
    if (global.gc) {
      global.gc();
    }
    // Trigger array pruning across modules (modules self-prune to MAX_* constants)
  },
  reduce_tick_rate: () => {
    // Signal to adaptive tick controller to slow down
    // (handled by state.ts integration)
  },
};

/** Register a custom recovery action */
export function registerRecoveryAction(name: string, handler: () => void): void {
  recoveryHandlers[name] = handler;
}

/**
 * Start the self-healing loop.
 * Runs independently of the tick loop every `intervalMs`.
 */
export function startSelfHealingLoop(intervalMs = 5000): void {
  if (healingTimer) {return;}

  healingTimer = setInterval(() => {
    const health = checkSystemHealth();

    for (const action of health.recoveryActions) {
      const handler = recoveryHandlers[action];
      if (handler) {
        try {
          handler();
          healingEvents.push({
            timestamp: new Date().toISOString(),
            action,
            probe: health.probes.find((p) => p.recoveryAction === action)?.name ?? "unknown",
            details: `Recovery action '${action}' executed successfully`,
          });
        } catch (error) {
          healingEvents.push({
            timestamp: new Date().toISOString(),
            action,
            probe: "error",
            details: `Recovery action '${action}' failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
    }

    if (healingEvents.length > MAX_HEALING_EVENTS) {
      healingEvents.splice(0, healingEvents.length - MAX_HEALING_EVENTS);
    }
  }, intervalMs);

  if (healingTimer.unref) {
    healingTimer.unref();
  }
}

/** Stop the self-healing loop */
export function stopSelfHealingLoop(): void {
  if (healingTimer) {
    clearInterval(healingTimer);
    healingTimer = null;
  }
}

/** Get self-healing diagnostics */
export function getSelfHealingDiagnostics() {
  return {
    running: healingTimer !== null,
    totalHealingEvents: healingEvents.length,
    recentEvents: healingEvents.slice(-10),
    registeredActions: Object.keys(recoveryHandlers),
    systemHealth: checkSystemHealth(),
  };
}
