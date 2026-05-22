/**
 * Tick Orchestrator — Type Definitions
 */

import type { RepublicState } from "../types.js";

/** Tick lifecycle phase */
export type TickPhase = "idle" | "preparing" | "executing" | "settling" | "persisting" | "complete";

/** Circuit breaker state */
export type CircuitState = "closed" | "open" | "half_open";

/** Backpressure severity */
export type BackpressureSeverity = "none" | "mild" | "heavy" | "critical";

/** Handler signature for dispatching — return type is ignored by orchestrator */
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type HandlerFn = (state: RepublicState, tick: number) => unknown | Promise<unknown>;

/** Extended handler registration with orchestrator metadata */
export interface OrchestratedHandler {
  /** Unique name for this handler */
  name: string;
  /** The handler function */
  handler: HandlerFn;
  /** Dependencies: names of handlers that must run before this one */
  after: string[];
  /** Cadence config: how often this handler should run */
  cadence: CadenceConfig;
  /** Max execution time budget per call (ms) */
  budgetMs: number;
  /** Whether this handler is safe to run concurrently with others in its tier */
  concurrent: boolean;
  /** Handler group/category for dashboard grouping */
  group: string;
  /** Whether this handler is enabled */
  enabled: boolean;
  /** Optional lifecycle hooks for pause/resume/shutdown */
  onPause?: () => void;
  onResume?: () => void;
  onShutdown?: () => void;
}

/** Cadence configuration for adaptive scheduling */
export interface CadenceConfig {
  /** Run every N ticks (minimum — fastest allowed) */
  min: number;
  /** Run every N ticks (maximum — slowest allowed) */
  max: number;
  /** Current cadence (auto-adjusted by adaptive scheduler) */
  current: number;
}

/** Per-handler runtime state managed by the orchestrator */
// oxlint-disable-next-line no-unused-vars
interface HandlerRuntimeState {
  /** Circuit breaker state */
  circuit: CircuitState;
  /** Consecutive failure count */
  consecutiveFailures: number;
  /** Tick at which circuit was opened */
  circuitOpenedAtTick: number;
  /** Last tick this handler was executed */
  lastExecutedTick: number;
  /** Rolling latency samples (ms) */
  latencies: number[];
  /** Total execution count */
  totalExecutions: number;
  /** Total error count */
  totalErrors: number;
  /** Exponential moving average of latency (ms) */
  emaLatencyMs: number;
  /** Exponential moving average of error rate */
  emaErrorRate: number;
  /** Whether this handler was deferred (budget exceeded mid-tick) */
  deferred: boolean;
  /** Adaptive cadence: current computed cadence */
  adaptiveCadence: number;
}

/** Timing result from a single handler execution */
export interface HandlerExecution {
  name: string;
  durationMs: number;
  error: string | null;
  skipped: boolean;
  skipReason?: "circuit_open" | "cadence" | "budget_exceeded" | "disabled" | "deferred";
  tier: number;
}

/** Complete tick execution report */
export interface TickReport {
  tickNumber: number;
  phase: TickPhase;
  totalDurationMs: number;
  budgetMs: number;
  budgetUsedPct: number;
  handlersExecuted: number;
  handlersSkipped: number;
  handlersErrored: number;
  handlersDeferred: number;
  tierCount: number;
  executions: HandlerExecution[];
  timestamp: number;
  /** Backpressure severity for this tick */
  backpressure: BackpressureSeverity;
  /** Names of deferred handlers */
  deferredHandlers: string[];
}

/** Profiler stats for a specific handler */
export interface HandlerProfile {
  name: string;
  group: string;
  totalExecutions: number;
  totalErrors: number;
  errorRate: number;
  cadence: number;
  circuitState: CircuitState;
  latency: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    max: number;
    ema: number;
  };
  /** Trend: positive = getting slower, negative = getting faster */
  trend: number;
  budgetMs: number;
  /** Fraction of budget consumed (0-1) */
  budgetUtilization: number;
}

/** Global orchestrator stats */
export interface OrchestratorStats {
  totalTicks: number;
  totalHandlers: number;
  activeHandlers: number;
  circuitOpenCount: number;
  avgTickDurationMs: number;
  p95TickDurationMs: number;
  handlerProfiles: HandlerProfile[];
  tierBreakdown: Array<{ tier: number; handlers: string[]; concurrent: boolean }>;
  systemLoad: {
    cpuPercent: number;
    heapUsedMB: number;
    rssUsedMB: number;
  };
  ticksPerMinute: number;
  currentPhase: TickPhase;
  /** System health score (0-100) */
  healthScore: number;
  /** Current backpressure severity */
  backpressure: BackpressureSeverity;
  /** Group budget utilization map */
  groupBudgets: Record<string, { budgetMs: number; usedMs: number; utilization: number }>;
}
