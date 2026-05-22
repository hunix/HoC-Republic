/**
 * Tick Orchestrator — Configuration Constants
 */

/** Default tick budget (ms) — handlers deferred if exceeded.
 * Set to 5000ms — the system runs 6 meta-learning subsystems, population fitness,
 * and parallel citizen ticks which regularly exceed 1s. 5s budget still catches
 * truly stuck handlers while eliminating constant false-alarm warnings. */
export const DEFAULT_TICK_BUDGET_MS = 5000;

/** Max rolling latency samples per handler */
export const MAX_LATENCY_SAMPLES = 100;

/** EMA smoothing factor for latency */
export const LATENCY_EMA_ALPHA = 0.15;

/** EMA smoothing factor for error rate */
export const ERROR_EMA_ALPHA = 0.1;

/** Circuit breaker: failures before opening */
export const CIRCUIT_FAILURE_THRESHOLD = 5;

/** Circuit breaker: ticks to wait before half-open attempt */
export const CIRCUIT_COOLDOWN_TICKS = 20;

/** Max tick reports stored for telemetry */
export const MAX_TICK_REPORTS = 200;

/** Cadence adjustment: how aggressively to change cadence */
export const CADENCE_ADJUSTMENT_RATE = 0.3;

/** Latency threshold (ms) above which cadence increases */
export const HEAVY_HANDLER_THRESHOLD_MS = 10;

/** Error rate threshold above which cadence increases */
export const HIGH_ERROR_RATE_THRESHOLD = 0.15;

/** CPU sampling interval (ms) */
export const CPU_SAMPLE_INTERVAL_MS = 5000;

/** CPU threshold above which all cadences increase */
export const CPU_PRESSURE_THRESHOLD = 75;

/** Default group budgets (ms) — prevents one handler group from starving others.
 * Tuned to ~60% of original values, leaving ~40% headroom for event loop
 * breathing. Tighter budgets trigger adaptive cadence increases sooner,
 * preventing tick backlog accumulation. */
export const DEFAULT_GROUP_BUDGETS: Record<string, number> = {
  core: 80,
  tech: 40,
  evolution: 30,
  education: 35,
  social: 40,
  coordination: 15,
  learning: 40,
  production: 40,
  cognition: 40,
  economy: 30,
  integration: 15,
  memory: 35,
  gap: 40,
  safety: 15,
  agi: 70,
  "self-evolving": 40,
  "post-tick": 40,
  resilience: 10,
  civilization: 40,
  default: 60,
};
