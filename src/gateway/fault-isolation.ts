/**
 * Gateway — Fault Isolation Wrapper
 *
 * Wraps every RPC handler with:
 * 1. Per-handler timeout (configurable, default 5s)
 * 2. Isolated try/catch so one handler crash can't affect others
 * 3. Structured error shape on failure
 * 4. Optional latency tracking for telemetry
 *
 * Usage:
 *   import { withTimeout } from './fault-isolation.js';
 *   const handlers = withTimeout(myHandlers, { timeoutMs: 8000 });
 */

import type { GatewayRequestHandlers } from "./server-methods/types.js";
import { ErrorCodes, errorShape } from "./protocol/index.js";

interface FaultIsolationOptions {
  /** Maximum ms to wait for a handler before returning INTERNAL error */
  timeoutMs?: number;
  /** Callback called on handler timeout/error (for telemetry) */
  onError?: (method: string, err: unknown) => void;
}

/**
 * Wrap each handler in a timeout + isolated error boundary.
 * Returns a new handlers object — the originals are not mutated.
 */
export function withTimeout(
  handlers: GatewayRequestHandlers,
  options: FaultIsolationOptions = {},
): GatewayRequestHandlers {
  const { timeoutMs = 5000, onError } = options;
  const wrapped: GatewayRequestHandlers = {};

  for (const [method, handler] of Object.entries(handlers)) {
    wrapped[method] = (ctx) => {
      const start = Date.now();
      let timedOut = false;

      // Create a race between the actual handler and a timeout
      const handlerPromise = Promise.resolve().then(() => handler(ctx));
      const timeoutPromise = new Promise<void>((_, reject) => {
        const t = setTimeout(() => {
          timedOut = true;
          reject(new Error(`[${method}] handler timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        // Don't block Node.js exit
        t.unref?.();
      });

      return Promise.race([handlerPromise, timeoutPromise]).catch((err: unknown) => {
        onError?.(method, err);
        const elapsed = Date.now() - start;
        const isTimeout = timedOut || elapsed >= timeoutMs;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[rpc:fault-isolation] ${method} ${isTimeout ? "TIMEOUT" : "ERROR"}: ${msg}`);
        ctx.respond(
          false,
          undefined,
          errorShape(
            isTimeout ? ErrorCodes.AGENT_TIMEOUT : ErrorCodes.INTERNAL_ERROR,
            isTimeout ? `Handler exceeded ${timeoutMs}ms` : msg,
          ),
        );
      });
    };
  }

  return wrapped;
}

// ─── 3-State Circuit Breaker ─────────────────────────────────────
//
// States:
//   CLOSED    → Normal operation. Counting failures.
//   OPEN      → All requests rejected. Waiting for cooldown.
//   HALF_OPEN → Allow limited probe requests to test recovery.
//
// Transitions:
//   CLOSED → OPEN       : failures >= threshold
//   OPEN → HALF_OPEN    : resetMs elapsed
//   HALF_OPEN → CLOSED  : successThreshold consecutive successes
//   HALF_OPEN → OPEN    : any failure during probing

type BreakerPhase = "closed" | "open" | "half-open";

interface BreakerState {
  phase: BreakerPhase;
  failures: number;
  successes: number;           // consecutive successes (for half-open → closed)
  openedAt: number | null;
  lastFailure: number | null;
  halfOpenProbes: number;      // probes allowed in half-open
}

interface MethodClassConfig {
  failureThreshold: number;
  resetMs: number;
  halfOpenMaxProbes: number;
  successThresholdToClose: number;
}

/** Classify a method into a resilience class */
function getMethodClass(method: string): string {
  // Fast infrastructure reads — very tolerant, quick recovery
  if (method.startsWith("config.") || method.startsWith("health.")) { return "fast"; }
  // Heavy operations — less tolerant, longer recovery
  if (method.startsWith("models.manager.") || method.startsWith("republic.plugins.")) { return "slow"; }
  // HPICS external calls — medium tolerance
  if (method.startsWith("hpics.")) { return "external"; }
  return "default";
}

const METHOD_CLASS_CONFIGS: Record<string, MethodClassConfig> = {
  fast: {
    failureThreshold: 15,         // Very tolerant — config reads fail a lot during boot
    resetMs: 10_000,              // Quick recovery (10s, not 60s)
    halfOpenMaxProbes: 3,
    successThresholdToClose: 1,   // One success = back to normal
  },
  slow: {
    failureThreshold: 5,
    resetMs: 30_000,
    halfOpenMaxProbes: 2,
    successThresholdToClose: 2,
  },
  external: {
    failureThreshold: 5,
    resetMs: 45_000,
    halfOpenMaxProbes: 2,
    successThresholdToClose: 2,
  },
  default: {
    failureThreshold: 5,
    resetMs: 30_000,
    halfOpenMaxProbes: 3,
    successThresholdToClose: 2,
  },
};

export class CircuitBreaker {
  private states = new Map<string, BreakerState>();

  private getConfig(method: string): MethodClassConfig {
    return METHOD_CLASS_CONFIGS[getMethodClass(method)] ?? METHOD_CLASS_CONFIGS.default;
  }

  private getState(method: string): BreakerState {
    let state = this.states.get(method);
    if (!state) {
      state = {
        phase: "closed",
        failures: 0,
        successes: 0,
        openedAt: null,
        lastFailure: null,
        halfOpenProbes: 0,
      };
      this.states.set(method, state);
    }
    return state;
  }

  isOpen(method: string): boolean {
    const state = this.getState(method);
    const config = this.getConfig(method);

    if (state.phase === "closed") { return false; }

    if (state.phase === "open") {
      // Check if cooldown has elapsed → transition to half-open
      if (state.openedAt && Date.now() - state.openedAt >= config.resetMs) {
        state.phase = "half-open";
        state.halfOpenProbes = 0;
        state.successes = 0;
        return false; // Allow this request as a probe
      }
      return true; // Still in cooldown
    }

    // half-open: allow limited probes
    if (state.phase === "half-open") {
      if (state.halfOpenProbes < config.halfOpenMaxProbes) {
        state.halfOpenProbes++;
        return false; // Allow probe
      }
      return true; // Max probes reached, wait for results
    }

    return false;
  }

  recordFailure(method: string): void {
    const state = this.getState(method);
    const config = this.getConfig(method);

    state.failures++;
    state.successes = 0;
    state.lastFailure = Date.now();

    if (state.phase === "half-open") {
      // Any failure in half-open → back to open
      state.phase = "open";
      state.openedAt = Date.now();
      state.halfOpenProbes = 0;
      return;
    }

    if (state.phase === "closed" && state.failures >= config.failureThreshold) {
      state.phase = "open";
      state.openedAt = Date.now();
      console.warn(
        `[circuit-breaker] ⚡ ${method} OPENED after ${state.failures} failures ` +
        `(class: ${getMethodClass(method)}, reset in ${config.resetMs / 1000}s)`,
      );
    }
  }

  recordSuccess(method: string): void {
    const state = this.getState(method);
    const config = this.getConfig(method);

    if (state.phase === "half-open") {
      state.successes++;
      if (state.successes >= config.successThresholdToClose) {
        // Recovery confirmed → close circuit
        this.states.delete(method);
        console.info(`[circuit-breaker] ✅ ${method} CLOSED — recovered after half-open probe`);
        return;
      }
    } else {
      // In closed state, a success resets failure count
      this.states.delete(method);
    }
  }

  getStatus(): Record<string, {
    phase: BreakerPhase;
    failures: number;
    successes: number;
    open: boolean;
    openedAt: number | null;
    methodClass: string;
  }> {
    const result: Record<string, {
      phase: BreakerPhase;
      failures: number;
      successes: number;
      open: boolean;
      openedAt: number | null;
      methodClass: string;
    }> = {};
    for (const [method, state] of this.states) {
      result[method] = {
        ...state,
        open: this.isOpen(method),
        methodClass: getMethodClass(method),
      };
    }
    return result;
  }
}

// Singleton breaker instance shared across all handlers
export const gatewayBreaker = new CircuitBreaker();
