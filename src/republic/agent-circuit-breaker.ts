/**
 * Republic Platform — Agent Runtime Circuit Breakers
 *
 * Extracted from agent-runtime.ts (Phase 2: Split God Modules).
 *
 * Per-provider adaptive circuit breakers with:
 * - Tier-aware failure thresholds (BitNet lenient, Cloud strict)
 * - Slow-call detection (latency-based half-failures)
 * - Rolling-window health scoring (success rate + p95 latency)
 * - Gradual half-open recovery (probe tokens → ramp → closed)
 * - Adaptive escalating cooldowns (30s → 60s → 120s → 300s)
 * - Per-model failure tracking (prevents one bad model killing all inference)
 * - Full observability metrics for diagnostics
 */

// ─── Types ──────────────────────────────────────────────────────

export type CircuitState = "closed" | "open" | "half-open" | "abandoned";

export interface AdaptiveCircuitBreaker {
  state: CircuitState;
  /** Consecutive failures in current closed-state window */
  failures: number;
  /** Total trip count (lifetime) */
  tripCount: number;
  /** Timestamp when the circuit opened */
  openUntil: number;
  /** Remaining probe tokens in half-open state */
  probeTokens: number;
  /** Successful probes in half-open state */
  probeSuccesses: number;
  /** Rolling window of recent outcomes (true = success, false = failure) */
  recentOutcomes: boolean[];
  /** Rolling window of recent latencies (ms) */
  recentLatencies: number[];
  /** Total lifetime request count through this breaker */
  totalRequests: number;
  /** Total lifetime successes */
  totalSuccesses: number;
  totalSlowCalls: number;
  /** Timestamp of last successful request */
  lastSuccessAt: number;
  /** Timestamp of last failure */
  lastFailureAt: number;
  /** Consecutive trips without full recovery (for escalating cooldown) */
  consecutiveTrips: number;
}

// ─── Per-Tier Configuration ─────────────────────────────────────

/** Per-tier configuration: how aggressive each provider's circuit breaker is */
const TIER_CONFIG: Record<
  string,
  {
    failureThreshold: number;
    slowCallThresholdMs: number;
    slowCallCountsAsHalfFailure: boolean;
    baseCooldownMs: number;
    maxCooldownMs: number;
    probeTokensOnHalfOpen: number;
    probesRequiredToClose: number;
    rollingWindowSize: number;
  }
> = {
  bitnet: {
    failureThreshold: 5, // BitNet is local, more tolerant
    slowCallThresholdMs: 8_000,
    slowCallCountsAsHalfFailure: false, // 1-bit models are slow by design
    baseCooldownMs: 30_000,
    maxCooldownMs: 120_000,
    probeTokensOnHalfOpen: 3,
    probesRequiredToClose: 2,
    rollingWindowSize: 20,
  },
  lmstudio: {
    failureThreshold: 6, // Local, tolerant — cold model loads take 15-30s
    slowCallThresholdMs: 60_000, // Cold VRAM loads are expected, don't penalize
    slowCallCountsAsHalfFailure: false, // Slow local inference is normal, not failure
    baseCooldownMs: 15_000,
    maxCooldownMs: 120_000,
    probeTokensOnHalfOpen: 3,
    probesRequiredToClose: 2,
    rollingWindowSize: 20,
  },
  ollama: {
    failureThreshold: 6, // Local, tolerant — cold model loads take 15-30s
    slowCallThresholdMs: 60_000, // Cold VRAM loads are expected, don't penalize
    slowCallCountsAsHalfFailure: false, // Slow local inference is normal, not failure
    baseCooldownMs: 15_000,
    maxCooldownMs: 120_000,
    probeTokensOnHalfOpen: 3,
    probesRequiredToClose: 2,
    rollingWindowSize: 20,
  },
  cloud: {
    failureThreshold: 3, // Cloud is expensive, strict breaker
    slowCallThresholdMs: 15_000,
    slowCallCountsAsHalfFailure: true,
    baseCooldownMs: 60_000,
    maxCooldownMs: 300_000,
    probeTokensOnHalfOpen: 1,
    probesRequiredToClose: 1,
    rollingWindowSize: 10,
  },
};

const DEFAULT_TIER_CONFIG = TIER_CONFIG.ollama;
export const MAX_RETRIES = 2;
export const RETRY_BASE_DELAY_MS = 500;
/** After this many consecutive trips, stop probing and mark provider abandoned */
const MAX_CONSECUTIVE_TRIPS = 10;
/** How long an abandoned provider stays abandoned before auto-recovery attempt (5 min) */
const ABANDON_RECOVERY_MS = 5 * 60_000;

const providerBreakers = new Map<string, AdaptiveCircuitBreaker>();
/** Throttle map for "circuit open" log messages (provider → lastLogTimestamp). */
export const _circuitOpenLoggedAt = new Map<string, number>();

// ─── Per-Model Failure Tracking ─────────────────────────────────
//
// When a specific LM Studio model fails, mark it unhealthy for a cooldown
// period instead of immediately tripping the provider-level circuit breaker.
// This prevents one broken model from killing all inference.

interface ModelFailureRecord {
  failures: number;
  lastFailureAt: number;
  /** Model is temporarily blacklisted until this timestamp */
  cooldownUntil: number;
}

const MODEL_FAILURE_MAP = new Map<string, ModelFailureRecord>();
/** After this many failures, blacklist the model for MODEL_COOLDOWN_MS */
const MODEL_FAILURE_THRESHOLD = 2;
/** How long a failed model stays blacklisted (5 min) */
const MODEL_COOLDOWN_MS = 5 * 60_000;

// ─── Model Failure API ──────────────────────────────────────────

export function recordModelFailure(modelId: string): void {
  const record = MODEL_FAILURE_MAP.get(modelId) ?? {
    failures: 0,
    lastFailureAt: 0,
    cooldownUntil: 0,
  };
  record.failures++;
  record.lastFailureAt = Date.now();
  if (record.failures >= MODEL_FAILURE_THRESHOLD) {
    const wasAlreadyBlacklisted = record.cooldownUntil > Date.now();
    record.cooldownUntil = Date.now() + MODEL_COOLDOWN_MS;
    // Only log the FIRST blacklist event — not every subsequent failure
    if (!wasAlreadyBlacklisted) {
      console.warn(
        `[AgentRuntime] Model "${modelId}" blacklisted for ${MODEL_COOLDOWN_MS / 1000}s after ${record.failures} failures`,
      );
    }
  }
  MODEL_FAILURE_MAP.set(modelId, record);
}

export function recordModelSuccess(modelId: string): void {
  MODEL_FAILURE_MAP.delete(modelId);
}

export function isModelBlacklisted(modelId: string): boolean {
  const record = MODEL_FAILURE_MAP.get(modelId);
  if (!record) { return false; }
  if (Date.now() >= record.cooldownUntil) {
    MODEL_FAILURE_MAP.delete(modelId);
    return false;
  }
  return record.cooldownUntil > 0;
}

// ─── Circuit Breaker API ────────────────────────────────────────

function getTierConfig(provider: string) {
  return TIER_CONFIG[provider] ?? DEFAULT_TIER_CONFIG;
}

function getBreaker(provider: string): AdaptiveCircuitBreaker {
  let cb = providerBreakers.get(provider);
  if (!cb) {
    cb = {
      state: "closed",
      failures: 0,
      tripCount: 0,
      openUntil: 0,
      probeTokens: 0,
      probeSuccesses: 0,
      recentOutcomes: [],
      recentLatencies: [],
      totalRequests: 0,
      totalSuccesses: 0,
      totalSlowCalls: 0,
      lastSuccessAt: 0,
      lastFailureAt: 0,
      consecutiveTrips: 0,
    };
    providerBreakers.set(provider, cb);
  }
  return cb;
}

export function isCircuitOpen(provider: string): boolean {
  const cb = getBreaker(provider);
  const config = getTierConfig(provider);

  if (cb.state === "closed") {
    return false;
  }

  // Abandoned: provider has failed too many times — stop probing entirely
  if (cb.state === "abandoned") {
    // Auto-recovery: after ABANDON_RECOVERY_MS of quiet, try once
    if (Date.now() >= cb.openUntil) {
      cb.state = "half-open";
      cb.probeTokens = 1;
      cb.probeSuccesses = 0;
      console.log(
        `[AgentRuntime] Circuit breaker RECOVERY ATTEMPT for abandoned provider ${provider}`,
      );
      return false;
    }
    return true; // Still abandoned
  }

  if (cb.state === "open") {
    if (Date.now() >= cb.openUntil) {
      // Transition to half-open: allow limited probe requests
      cb.state = "half-open";
      cb.probeTokens = config.probeTokensOnHalfOpen;
      cb.probeSuccesses = 0;
      console.log(
        `[AgentRuntime] Circuit breaker HALF-OPEN for ${provider} — allowing ${cb.probeTokens} probe(s)`,
      );
      return false; // Allow the first probe
    }
    return true; // Still in cooldown
  }

  // half-open: allow if we have probe tokens left
  if (cb.state === "half-open") {
    if (cb.probeTokens > 0) {
      cb.probeTokens--;
      return false; // Allow probe
    }
    return true; // No probe tokens left, wait for results
  }

  return false;
}

export function recordProviderSuccess(provider: string, latencyMs?: number): void {
  const cb = getBreaker(provider);
  const config = getTierConfig(provider);

  cb.totalRequests++;
  cb.totalSuccesses++;
  cb.lastSuccessAt = Date.now();

  // Track rolling window
  cb.recentOutcomes.push(true);
  if (cb.recentOutcomes.length > config.rollingWindowSize) {
    cb.recentOutcomes.shift();
  }
  if (latencyMs !== undefined) {
    cb.recentLatencies.push(latencyMs);
    if (cb.recentLatencies.length > config.rollingWindowSize) {
      cb.recentLatencies.shift();
    }
  }

  // Slow-call detection: a slow success counts as a half-failure
  if (
    latencyMs !== undefined &&
    latencyMs > config.slowCallThresholdMs &&
    config.slowCallCountsAsHalfFailure
  ) {
    cb.totalSlowCalls++;
    // Slow calls don't increment failure counter but are tracked
  }

  if (cb.state === "half-open") {
    cb.probeSuccesses++;
    if (cb.probeSuccesses >= config.probesRequiredToClose) {
      // Recovery complete — close the circuit
      cb.state = "closed";
      cb.failures = 0;
      cb.consecutiveTrips = 0;
      console.log(
        `[AgentRuntime] Circuit breaker CLOSED for ${provider} — fully recovered after ${cb.probeSuccesses} successful probe(s)`,
      );
    }
  } else {
    // Regular success in closed state — reset failure counter
    cb.failures = 0;
  }
}

export function recordProviderFailure(provider: string): void {
  const cb = getBreaker(provider);
  const config = getTierConfig(provider);

  cb.failures++;
  cb.lastFailureAt = Date.now();
  cb.totalRequests++;

  // Track rolling window
  cb.recentOutcomes.push(false);
  if (cb.recentOutcomes.length > config.rollingWindowSize) {
    cb.recentOutcomes.shift();
  }

  if (cb.state === "half-open") {
    // Failure during half-open → trip again immediately with escalated cooldown
    tripBreaker(provider, cb, config, true);
  } else if (cb.failures >= config.failureThreshold) {
    tripBreaker(provider, cb, config, false);
  }
}

function tripBreaker(
  provider: string,
  cb: AdaptiveCircuitBreaker,
  config: typeof DEFAULT_TIER_CONFIG,
  isReTrip: boolean,
): void {
  cb.consecutiveTrips++;
  cb.tripCount++;

  // After too many consecutive trips, abandon the provider entirely
  if (cb.consecutiveTrips >= MAX_CONSECUTIVE_TRIPS) {
    cb.state = "abandoned";
    cb.openUntil = Date.now() + ABANDON_RECOVERY_MS;
    cb.probeTokens = 0;
    cb.probeSuccesses = 0;
    console.warn(
      `[AgentRuntime] Circuit breaker ABANDONED for ${provider}` +
        ` — ${cb.consecutiveTrips} consecutive trips, will retry in ${ABANDON_RECOVERY_MS / 60_000}min`,
    );
    return;
  }

  // Escalating cooldown: baseCooldown * 2^(consecutiveTrips - 1), capped at maxCooldown
  const cooldown = Math.min(
    config.baseCooldownMs * Math.pow(2, cb.consecutiveTrips - 1),
    config.maxCooldownMs,
  );

  cb.state = "open";
  cb.openUntil = Date.now() + cooldown;
  cb.probeTokens = 0;
  cb.probeSuccesses = 0;

  console.warn(
    `[AgentRuntime] Circuit breaker TRIPPED for ${provider}` +
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-template-expression
      `${isReTrip ? " (re-trip during half-open)" : ""}` +
      ` — cooldown ${(cooldown / 1000).toFixed(0)}s` +
      ` (trip #${cb.consecutiveTrips}, threshold ${config.failureThreshold})`,
  );
}

// ─── Health Diagnostics ─────────────────────────────────────────

/** Get health score for a provider — full adaptive metrics */
export function getProviderHealth(provider: string): {
  state: CircuitState;
  successRate: number;
  rollingSuccessRate: number;
  p95LatencyMs: number;
  isOpen: boolean;
  failures: number;
  tripCount: number;
  consecutiveTrips: number;
  slowCalls: number;
  totalRequests: number;
} {
  const cb = getBreaker(provider);

  // Overall success rate
  const successRate = cb.totalRequests > 0 ? cb.totalSuccesses / cb.totalRequests : 1;

  // Rolling window success rate
  const rollingSuccesses = cb.recentOutcomes.filter(Boolean).length;
  const rollingTotal = cb.recentOutcomes.length;
  const rollingSuccessRate = rollingTotal > 0 ? rollingSuccesses / rollingTotal : 1;

  // P95 latency from rolling window
  const sortedLatencies = [...cb.recentLatencies].toSorted((a, b) => a - b);
  const p95Index = Math.floor(sortedLatencies.length * 0.95);
  const p95LatencyMs = sortedLatencies[p95Index] ?? 0;

  return {
    state: cb.state,
    successRate: Math.round(successRate * 100) / 100,
    rollingSuccessRate: Math.round(rollingSuccessRate * 100) / 100,
    p95LatencyMs: Math.round(p95LatencyMs),
    isOpen: isCircuitOpen(provider),
    failures: cb.failures,
    tripCount: cb.tripCount,
    consecutiveTrips: cb.consecutiveTrips,
    slowCalls: cb.totalSlowCalls,
    totalRequests: cb.totalRequests,
  };
}

/** Get health for all known providers — full adaptive diagnostics */
export function getAllProviderHealth(): Record<string, ReturnType<typeof getProviderHealth>> {
  const result: Record<string, ReturnType<typeof getProviderHealth>> = {};
  for (const [name] of providerBreakers) {
    result[name] = getProviderHealth(name);
  }
  return result;
}

/** Retry helper with exponential backoff — feeds latency into health scoring */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  provider: string,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    try {
      const result = await fn();
      recordProviderSuccess(provider, Date.now() - start);
      return result;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  recordProviderFailure(provider);
  throw lastErr;
}
