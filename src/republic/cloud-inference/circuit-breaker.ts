/**
 * Cloud Inference — Provider Circuit Breaker
 *
 * Prevents cascading failure by tracking consecutive errors per provider.
 * When a provider trips (hits the threshold), it enters a cooldown period
 * during which requests are rejected immediately — no wasted latency.
 *
 * States:
 *   CLOSED  → normal operation, requests pass through
 *   OPEN    → provider is broken, requests rejected instantly
 *   HALF    → cooldown expired, next request is a probe
 *
 * This is critical for reliability: without it, a dead provider wastes
 * 15s (timeout) on every citizen tick before falling through.
 */

// ─── Configuration ──────────────────────────────────────────────

/** Consecutive failures to trip the breaker */
const FAILURE_THRESHOLD = 3;

/** Cooldown before allowing a probe request (ms) */
const COOLDOWN_MS = 60_000;

/** Reset breaker after this many successes in half-open (ms counted from first success) */
const _RECOVERY_WINDOW_MS = 30_000;

// ─── State ──────────────────────────────────────────────────────

type BreakerState = "closed" | "open" | "half-open";

interface BreakerEntry {
  state: BreakerState;
  consecutiveFailures: number;
  lastFailureAt: number;
  trippedAt: number;
  totalFailures: number;
  totalSuccesses: number;
}

const breakers = new Map<string, BreakerEntry>();

function getOrCreate(provider: string): BreakerEntry {
  let entry = breakers.get(provider);
  if (!entry) {
    entry = {
      state: "closed",
      consecutiveFailures: 0,
      lastFailureAt: 0,
      trippedAt: 0,
      totalFailures: 0,
      totalSuccesses: 0,
    };
    breakers.set(provider, entry);
  }
  return entry;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Check if a provider is available (not tripped).
 * Automatically transitions from OPEN → HALF-OPEN when cooldown expires.
 */
export function isProviderHealthy(provider: string): boolean {
  const entry = getOrCreate(provider);

  if (entry.state === "closed") {
    return true;
  }

  if (entry.state === "open") {
    const elapsed = Date.now() - entry.trippedAt;
    if (elapsed >= COOLDOWN_MS) {
      entry.state = "half-open";
      return true; // allow probe
    }
    return false; // still cooling down
  }

  // half-open → allow probe
  return true;
}

/**
 * Report a successful request — resets the breaker to CLOSED.
 */
export function reportSuccess(provider: string): void {
  const entry = getOrCreate(provider);
  entry.consecutiveFailures = 0;
  entry.state = "closed";
  entry.totalSuccesses++;
}

/**
 * Report a failed request — may trip the breaker.
 */
export function reportFailure(provider: string): void {
  const entry = getOrCreate(provider);
  entry.consecutiveFailures++;
  entry.lastFailureAt = Date.now();
  entry.totalFailures++;

  if (entry.consecutiveFailures >= FAILURE_THRESHOLD) {
    entry.state = "open";
    entry.trippedAt = Date.now();
  }
}

/**
 * Execute a function with circuit breaker protection.
 * Throws immediately if the provider is tripped.
 */
export async function withCircuitBreaker<T>(provider: string, fn: () => Promise<T>): Promise<T> {
  if (!isProviderHealthy(provider)) {
    throw new Error(`Provider ${provider} circuit breaker tripped — skipping`);
  }

  try {
    const result = await fn();
    reportSuccess(provider);
    return result;
  } catch (err) {
    reportFailure(provider);
    throw err;
  }
}

/**
 * Get diagnostics for all circuit breakers.
 */
export function getCircuitBreakerStatus(): Record<
  string,
  {
    state: BreakerState;
    consecutiveFailures: number;
    totalFailures: number;
    totalSuccesses: number;
    cooldownRemainingMs: number;
  }
> {
  const now = Date.now();
  const result: Record<
    string,
    {
      state: BreakerState;
      consecutiveFailures: number;
      totalFailures: number;
      totalSuccesses: number;
      cooldownRemainingMs: number;
    }
  > = {};

  for (const [provider, entry] of breakers) {
    const cooldownRemaining =
      entry.state === "open" ? Math.max(0, COOLDOWN_MS - (now - entry.trippedAt)) : 0;
    result[provider] = {
      state: entry.state,
      consecutiveFailures: entry.consecutiveFailures,
      totalFailures: entry.totalFailures,
      totalSuccesses: entry.totalSuccesses,
      cooldownRemainingMs: cooldownRemaining,
    };
  }

  return result;
}

/**
 * Reset a specific provider's circuit breaker. Useful for manual recovery.
 */
export function resetCircuitBreaker(provider: string): void {
  breakers.delete(provider);
}

/**
 * Reset all circuit breakers. Useful on config change.
 */
export function resetAllCircuitBreakers(): void {
  breakers.clear();
}
