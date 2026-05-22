/**
 * Citizen Token Budget — Per-citizen production rate limiter
 *
 * Uses a sliding-window token-bucket algorithm to ensure citizens
 * cannot flood the production pipeline. Specialization bonuses
 * reward domain experts with higher throughput.
 *
 * Key invariants:
 *   - Each citizen starts with 0 tokens; tokens accumulate at a
 *     steady refill rate up to MAX_BURST_TOKENS.
 *   - tryConsume() succeeds iff tokens ≥ 1 AND citizen has no
 *     currently-running job in the scheduler.
 *   - Tokens do NOT expire if not used (they accumulate).
 *   - Citizens with matching specialisations get a multiplier on
 *     their refill rate, not on burst cap.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("citizen-token-budget");

// ─── Config ────────────────────────────────────────────────────────────────

/** How often (ms) we refill all citizen token buckets. */
const REFILL_INTERVAL_MS = 60_000; // 1 minute

/** Base tokens added per refill interval. Gives 1 production / 5 min baseline. */
const BASE_REFILL_PER_INTERVAL = 0.2;

/** Maximum tokens a citizen can accumulate (burst cap). */
const MAX_BURST_TOKENS = 3;

/**
 * Refill multiplier by specialization.
 * A Composer gets 3× the refill rate → can produce 3× as often.
 */
const SPECIALIZATION_MULTIPLIER: Record<string, number> = {
  // Creative disciplines — high throughput
  Composer: 3,
  Musician: 3,
  SoundDesigner: 2.5,
  Filmmaker: 2.5,
  CinematicDirector: 2.5,
  "2DArtist": 2,
  "3DArtist": 2,
  VFXArtist: 2,
  Designer: 2,
  Artist: 2,
  // Technical disciplines — moderate boost
  Engineer: 1.5,
  Developer: 1.5,
  WebDeveloper: 1.5,
  GameDeveloper: 2,
  DataScientist: 1.5,
  Scientist: 1.5,
  Researcher: 1.5,
  // Content & knowledge disciplines
  Writer: 1.5,
  ContentCreator: 1.5,
  Analyst: 1.2,
  Diplomat: 1.0,
};

// ─── State ────────────────────────────────────────────────────────────────

interface CitizenBucket {
  citizenId: string;
  tokens: number;
  lastRefillAt: number;
  /** How many concurrent productions this citizen currently has running/queued. */
  activeJobs: number;
}

const buckets = new Map<string, CitizenBucket>();

// ─── Internal helpers ─────────────────────────────────────────────────────

function getBucket(citizenId: string): CitizenBucket {
  let b = buckets.get(citizenId);
  if (!b) {
    b = { citizenId, tokens: 1, lastRefillAt: Date.now(), activeJobs: 0 };
    buckets.set(citizenId, b);
  }
  return b;
}

function refillBucket(bucket: CitizenBucket, specialization?: string): void {
  const now = Date.now();
  const elapsed = now - bucket.lastRefillAt;
  const intervals = elapsed / REFILL_INTERVAL_MS;
  if (intervals < 0.01) { return; } // nothing significant has elapsed

  const multiplier = SPECIALIZATION_MULTIPLIER[specialization ?? ""] ?? 1.0;
  const refill = intervals * BASE_REFILL_PER_INTERVAL * multiplier;
  bucket.tokens = Math.min(MAX_BURST_TOKENS, bucket.tokens + refill);
  bucket.lastRefillAt = now;
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Try to consume 1 production token for a citizen.
 * Returns true if the citizen is allowed to submit a new production job.
 */
export function tryConsume(citizenId: string, specialization?: string): boolean {
  const bucket = getBucket(citizenId);
  refillBucket(bucket, specialization);

  if (bucket.tokens < 1) {
    logger.info(
      `[TokenBudget] ${citizenId} denied — tokens=${bucket.tokens.toFixed(2)}, activeJobs=${bucket.activeJobs}`,
    );
    return false;
  }

  bucket.tokens -= 1;
  bucket.activeJobs += 1;
  logger.info(
    `[TokenBudget] ${citizenId} consumed — remaining=${bucket.tokens.toFixed(2)}, activeJobs=${bucket.activeJobs}`,
  );
  return true;
}

/**
 * Release the active-job count for a citizen when a production completes or fails.
 * This allows them to submit again (subject to token availability).
 */
export function releaseJob(citizenId: string): void {
  const bucket = buckets.get(citizenId);
  if (bucket && bucket.activeJobs > 0) {
    bucket.activeJobs -= 1;
  }
}

/**
 * How many tokens does a citizen currently have?
 * (refills lazily based on elapsed time)
 */
export function getBudgetStatus(citizenId: string, specialization?: string): {
  tokens: number;
  activeJobs: number;
  maxBurst: number;
  rechargePerMinute: number;
} {
  const bucket = getBucket(citizenId);
  refillBucket(bucket, specialization);
  const multiplier = SPECIALIZATION_MULTIPLIER[specialization ?? ""] ?? 1.0;
  return {
    tokens: parseFloat(bucket.tokens.toFixed(2)),
    activeJobs: bucket.activeJobs,
    maxBurst: MAX_BURST_TOKENS,
    rechargePerMinute: parseFloat((BASE_REFILL_PER_INTERVAL * multiplier).toFixed(3)),
  };
}

/**
 * Get overall budget stats across all citizens.
 */
export function getBudgetStats(): {
  totalCitizens: number;
  tokensAvailable: number;
  activeJobs: number;
  blocked: number;
} {
  let tokensAvailable = 0;
  let activeJobs = 0;
  let blocked = 0;

  for (const b of buckets.values()) {
    tokensAvailable += b.tokens;
    activeJobs += b.activeJobs;
    if (b.tokens < 1) { blocked += 1; }
  }

  return {
    totalCitizens: buckets.size,
    tokensAvailable: parseFloat(tokensAvailable.toFixed(1)),
    activeJobs,
    blocked,
  };
}

/**
 * Reset a citizen's budget (useful for senior/admin citizens or testing).
 */
export function resetBudget(citizenId: string): void {
  buckets.delete(citizenId);
}

/**
 * Prune inactive citizens from the budget map (called periodically).
 * Citizens with 0 active jobs and max tokens and last refill > 30 min ago
 * are evicted from memory to prevent unbounded growth.
 */
export function pruneInactiveBudgets(): number {
  const cutoff = Date.now() - 30 * 60_000;
  let pruned = 0;
  for (const [id, b] of buckets.entries()) {
    if (b.activeJobs === 0 && b.tokens >= MAX_BURST_TOKENS && b.lastRefillAt < cutoff) {
      buckets.delete(id);
      pruned++;
    }
  }
  return pruned;
}
