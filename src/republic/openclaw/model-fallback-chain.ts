/**
 * OpenClaw — Model Fallback Chain for Republic Inference
 *
 * Adapted from upstream OpenClaw `agents/model-fallback.ts`.
 *
 * Provides a structured fallback mechanism for cloud inference:
 *  - Ordered candidate list based on provider availability + priority
 *  - Per-provider probe throttling to avoid hammering rate-limited APIs
 *  - Cooldown tracking with automatic recovery probes
 *  - Attempt telemetry for diagnostics
 *
 * This module is provider-agnostic — it wraps any async inference function
 * with retry/fallback logic without knowing about the provider internals.
 *
 * Usage:
 *   const result = await runWithFallback({
 *     candidates: [
 *       { provider: "groq", model: "llama-3.3-70b" },
 *       { provider: "nvidia-nim", model: "nemotron-3-super" },
 *       { provider: "deepseek", model: "deepseek-chat" },
 *     ],
 *     run: async (provider, model) => { ... },
 *   });
 */

// ─── Types ──────────────────────────────────────────────────────

export interface ModelCandidate {
  provider: string;
  model: string;
}

export interface FallbackAttempt {
  provider: string;
  model: string;
  error: string;
  reason: FailoverReason;
  durationMs?: number;
}

export type FailoverReason =
  | "rate_limit"
  | "overloaded"
  | "timeout"
  | "auth"
  | "billing"
  | "model_not_found"
  | "context_overflow"
  | "network"
  | "unknown";

export interface FallbackRunResult<T> {
  result: T;
  provider: string;
  model: string;
  attempts: FallbackAttempt[];
  /** True if a fallback candidate was used (not the primary). */
  usedFallback: boolean;
}

export type FallbackRunFn<T> = (provider: string, model: string) => Promise<T>;

// ─── Error Classification ───────────────────────────────────────

/**
 * Classify an error into a FailoverReason based on common patterns.
 */
function classifyError(err: unknown): { reason: FailoverReason; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("rate_limit")) {
    return { reason: "rate_limit", message: msg };
  }
  if (lower.includes("503") || lower.includes("overloaded") || lower.includes("capacity")) {
    return { reason: "overloaded", message: msg };
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborted")) {
    return { reason: "timeout", message: msg };
  }
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden")
  ) {
    return { reason: "auth", message: msg };
  }
  if (lower.includes("402") || lower.includes("billing") || lower.includes("payment")) {
    return { reason: "billing", message: msg };
  }
  if (lower.includes("404") || lower.includes("not found") || lower.includes("model_not_found")) {
    return { reason: "model_not_found", message: msg };
  }
  if (lower.includes("context") || lower.includes("token limit") || lower.includes("too long")) {
    return { reason: "context_overflow", message: msg };
  }
  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("network") ||
    lower.includes("fetch failed")
  ) {
    return { reason: "network", message: msg };
  }

  return { reason: "unknown", message: msg };
}

// ─── Cooldown Tracking ──────────────────────────────────────────

/** Per-provider cooldown state. */
interface CooldownEntry {
  until: number;
  reason: FailoverReason;
  consecutiveFailures: number;
}

const providerCooldowns = new Map<string, CooldownEntry>();

/** Minimum cooldown duration: 10 seconds. */
const MIN_COOLDOWN_MS = 10_000;
/** Maximum cooldown duration: 5 minutes. */
const MAX_COOLDOWN_MS = 5 * 60_000;

function getCooldownMs(consecutiveFailures: number, reason: FailoverReason): number {
  // Rate limits get longer cooldowns
  const base = reason === "rate_limit" ? 30_000 : MIN_COOLDOWN_MS;
  // Exponential backoff: base * 2^(failures-1), capped
  const ms = base * Math.pow(2, Math.max(0, consecutiveFailures - 1));
  return Math.min(ms, MAX_COOLDOWN_MS);
}

function isProviderInCooldown(provider: string): { inCooldown: boolean; reason?: FailoverReason } {
  const entry = providerCooldowns.get(provider);
  if (!entry) {
    return { inCooldown: false };
  }
  if (Date.now() >= entry.until) {
    providerCooldowns.delete(provider);
    return { inCooldown: false };
  }
  return { inCooldown: true, reason: entry.reason };
}

function recordProviderFailure(provider: string, reason: FailoverReason): void {
  const existing = providerCooldowns.get(provider);
  const consecutive = (existing?.consecutiveFailures ?? 0) + 1;
  const cooldownMs = getCooldownMs(consecutive, reason);
  providerCooldowns.set(provider, {
    until: Date.now() + cooldownMs,
    reason,
    consecutiveFailures: consecutive,
  });
}

function recordProviderSuccess(provider: string): void {
  providerCooldowns.delete(provider);
}

// ─── Probe Throttling ───────────────────────────────────────────

const lastProbeAttempt = new Map<string, number>();
const MIN_PROBE_INTERVAL_MS = 30_000;

function canProbeProvider(provider: string): boolean {
  const last = lastProbeAttempt.get(provider) ?? 0;
  return Date.now() - last >= MIN_PROBE_INTERVAL_MS;
}

function markProbeAttempt(provider: string): void {
  lastProbeAttempt.set(provider, Date.now());
  // Prune old entries
  if (lastProbeAttempt.size > 128) {
    const now = Date.now();
    for (const [k, ts] of lastProbeAttempt) {
      if (now - ts > 24 * 60 * 60_000) {
        lastProbeAttempt.delete(k);
      }
    }
  }
}

// ─── Exhaustion Error ───────────────────────────────────────────

export class FallbackExhaustedError extends Error {
  readonly attempts: FallbackAttempt[];
  readonly soonestRetryMs: number | null;

  constructor(message: string, attempts: FallbackAttempt[], soonestRetryMs: number | null) {
    super(message);
    this.name = "FallbackExhaustedError";
    this.attempts = attempts;
    this.soonestRetryMs = soonestRetryMs;
  }
}

export function isFallbackExhaustedError(err: unknown): err is FallbackExhaustedError {
  return err instanceof FallbackExhaustedError;
}

// ─── Main Fallback Runner ───────────────────────────────────────

/**
 * Run a function with automatic model fallback across ordered candidates.
 *
 * Tries each candidate in order, skipping those in cooldown (unless probing).
 * On success, clears the provider's cooldown. On failure, classifies the error,
 * records cooldown, and moves to the next candidate.
 *
 * @throws FallbackExhaustedError if all candidates fail
 */
export async function runWithFallback<T>(params: {
  candidates: ModelCandidate[];
  run: FallbackRunFn<T>;
  /** Called on each failure for diagnostics. */
  onError?: (attempt: FallbackAttempt, index: number, total: number) => void;
}): Promise<FallbackRunResult<T>> {
  const { candidates, run, onError } = params;
  const attempts: FallbackAttempt[] = [];
  let _lastError: unknown;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const isPrimary = i === 0;

    // Check cooldown
    const cooldown = isProviderInCooldown(candidate.provider);
    if (cooldown.inCooldown) {
      // Persistent auth/billing issues — skip entirely
      if (cooldown.reason === "auth" || cooldown.reason === "billing") {
        const attempt: FallbackAttempt = {
          provider: candidate.provider,
          model: candidate.model,
          error: `Provider ${candidate.provider} in ${cooldown.reason} cooldown — skipped`,
          reason: cooldown.reason,
        };
        attempts.push(attempt);
        onError?.(attempt, i, candidates.length);
        continue;
      }

      // Transient issues — probe if allowed
      if (!isPrimary || !canProbeProvider(candidate.provider)) {
        const attempt: FallbackAttempt = {
          provider: candidate.provider,
          model: candidate.model,
          error: `Provider ${candidate.provider} in cooldown (${cooldown.reason}) — skipped`,
          reason: cooldown.reason!,
        };
        attempts.push(attempt);
        onError?.(attempt, i, candidates.length);
        continue;
      }
      // Primary + probe allowed → try it
      markProbeAttempt(candidate.provider);
    }

    // Attempt the call
    const t0 = Date.now();
    try {
      const result = await run(candidate.provider, candidate.model);
      recordProviderSuccess(candidate.provider);
      return {
        result,
        provider: candidate.provider,
        model: candidate.model,
        attempts,
        usedFallback: i > 0,
      };
    } catch (err: unknown) {
      const { reason, message } = classifyError(err);
      const durationMs = Date.now() - t0;
      _lastError = err;

      // Don't cooldown on context overflow or model-not-found (model-specific, not provider-wide)
      if (reason !== "context_overflow" && reason !== "model_not_found") {
        recordProviderFailure(candidate.provider, reason);
      }

      const attempt: FallbackAttempt = {
        provider: candidate.provider,
        model: candidate.model,
        error: message,
        reason,
        durationMs,
      };
      attempts.push(attempt);
      onError?.(attempt, i, candidates.length);

      // AbortError (user cancel) should not be retried
      if (err instanceof Error && err.name === "AbortError") {
        throw err;
      }
    }
  }

  // All candidates exhausted
  const soonestRetryMs = (() => {
    let soonest: number | null = null;
    for (const candidate of candidates) {
      const entry = providerCooldowns.get(candidate.provider);
      if (!entry) {
        return 0;
      } // At least one provider has no cooldown
      const remaining = entry.until - Date.now();
      if (soonest === null || remaining < soonest) {
        soonest = remaining;
      }
    }
    return soonest;
  })();

  const summary = attempts.map((a) => `${a.provider}/${a.model}: ${a.reason}`).join(" | ");
  throw new FallbackExhaustedError(
    `All ${candidates.length} model candidates failed: ${summary}`,
    attempts,
    soonestRetryMs,
  );
}

// ─── Diagnostics ────────────────────────────────────────────────

/** Get the current cooldown status of all tracked providers. */
export function getFallbackDiagnostics(): {
  providerCooldowns: Array<{
    provider: string;
    reason: FailoverReason;
    remainingMs: number;
    consecutiveFailures: number;
  }>;
} {
  const now = Date.now();
  const cooldowns: Array<{
    provider: string;
    reason: FailoverReason;
    remainingMs: number;
    consecutiveFailures: number;
  }> = [];

  for (const [provider, entry] of providerCooldowns) {
    const remaining = entry.until - now;
    if (remaining > 0) {
      cooldowns.push({
        provider,
        reason: entry.reason,
        remainingMs: remaining,
        consecutiveFailures: entry.consecutiveFailures,
      });
    }
  }

  return { providerCooldowns: cooldowns };
}

/** Clear all cooldown state. Useful for manual recovery. */
export function clearAllCooldowns(): void {
  providerCooldowns.clear();
  lastProbeAttempt.clear();
}
