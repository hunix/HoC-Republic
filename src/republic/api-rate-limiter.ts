/**
 * Republic Platform — API Rate Limiter
 *
 * Global token-bucket rate limiter with per-provider quotas, backpressure
 * queuing, 429/Retry-After handling, and adaptive quota reduction.
 *
 * All LLM call sites (agent-runtime, cloud-inference, real-execution,
 * vision) gate through this module before making API requests.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────┐
 * │  acquire("gemini")  ──►  TokenBucket(gemini)    │
 * │  acquire("openai")  ──►  TokenBucket(openai)    │
 * │  acquire("anthropic")──► TokenBucket(anthropic)  │
 * │  acquire("ollama")  ──►  TokenBucket(ollama)    │
 * │  acquire("lmstudio") ─► TokenBucket(lmstudio)   │
 * │  acquire("local")   ──►  TokenBucket(local)     │
 * └─────────────────────────────────────────────────┘
 *    └── backpressure queue per bucket ──►  FIFO resolve
 *    └── 429 detection ──► pause bucket for retryAfter
 *    └── adaptive RPM ──► reduce on repeated 429s
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("republic:rate-limiter");

// ─── Types ──────────────────────────────────────────────────────

export type ProviderName =
  | "gemini"
  | "openai"
  | "anthropic"
  | "groq"
  | "nvidia-nim"
  | "deepseek"
  | "openrouter"
  | "ollama"
  | "lmstudio"
  | "local"
  | "cluster-proxy";

export interface ProviderQuota {
  /** Requests per minute */
  rpm: number;
  /** Max concurrent in-flight requests */
  maxConcurrent: number;
  /** Whether this provider is a cloud API (subject to stricter limits) */
  isCloud: boolean;
}

export interface BucketStats {
  provider: ProviderName;
  /** Current token count (available requests) */
  tokens: number;
  /** Max tokens (= RPM) */
  maxTokens: number;
  /** Current RPM after adaptive reduction */
  effectiveRpm: number;
  /** Requests currently in-flight */
  inFlight: number;
  /** Max concurrent */
  maxConcurrent: number;
  /** Requests waiting in the backpressure queue */
  queueDepth: number;
  /** Total requests served */
  totalRequests: number;
  /** Total 429s received */
  total429s: number;
  /** Whether the bucket is currently paused (due to 429) */
  paused: boolean;
  /** Pause remaining (ms) — 0 if not paused */
  pauseRemainingMs: number;
  /** Adaptive reduction factor (1.0 = no reduction) */
  adaptiveFactor: number;
}

export interface RateLimiterStats {
  providers: Record<ProviderName, BucketStats>;
  globalTotalRequests: number;
  globalTotal429s: number;
  globalQueueDepth: number;
}

// ─── Configuration ──────────────────────────────────────────────

/** Default quotas per provider */
const DEFAULT_QUOTAS: Record<ProviderName, ProviderQuota> = {
  gemini:       { rpm: 60,  maxConcurrent: 5,  isCloud: true },  // Paid Tier 1: 60 RPM
  openai:       { rpm: 500, maxConcurrent: 8,  isCloud: true },  // Tier 1: 500 RPM ($5+ spent)
  anthropic:    { rpm: 50,  maxConcurrent: 4,  isCloud: true },  // Tier 1: 50 RPM (strictest)
  groq:         { rpm: 30,  maxConcurrent: 3,  isCloud: true },  // Free tier: 30 RPM
  "nvidia-nim": { rpm: 40,  maxConcurrent: 3,  isCloud: true },  // Free tier: 40 RPM per model
  deepseek:     { rpm: 60,  maxConcurrent: 5,  isCloud: true },  // Free tier: ~60 RPM
  openrouter:   { rpm: 20,  maxConcurrent: 3,  isCloud: true },  // Free tier: 20 RPM
  ollama:       { rpm: 120, maxConcurrent: 8,  isCloud: false },
  lmstudio:     { rpm: 60,  maxConcurrent: 4,  isCloud: false },
  local:        { rpm: 300, maxConcurrent: 16, isCloud: false },
  "cluster-proxy": { rpm: 1000, maxConcurrent: 16, isCloud: false },
};

/** Minimum RPM after adaptive reduction */
const MIN_RPM = 2;

/** How much to reduce RPM on each 429 */
const ADAPTIVE_REDUCTION_FACTOR = 0.8;

/** How quickly to recover RPM when no 429s (per refill cycle) */
const ADAPTIVE_RECOVERY_FACTOR = 1.02;

/** Time window for 429 tracking (ms) */
const RATE_LIMIT_WINDOW_MS = 60_000;

/** Token refill interval (ms) — refill tokens every second */
const REFILL_INTERVAL_MS = 1_000;

/** Maximum queue depth per provider before rejecting */
const MAX_QUEUE_DEPTH = 80;

// ─── Token Bucket ───────────────────────────────────────────────

interface QueueEntry {
  resolve: () => void;
  reject: (err: Error) => void;
  enqueuedAt: number;
  /** Max wait time before giving up (ms) */
  timeoutMs: number;
}

class TokenBucket {
  readonly provider: ProviderName;
  private quota: ProviderQuota;

  // Token state
  private tokens: number;
  private effectiveRpm: number;
  private adaptiveFactor: number = 1.0;

  // Concurrency tracking
  private inFlight: number = 0;

  // Backpressure queue
  private queue: QueueEntry[] = [];

  // Pause state (429 handling)
  private pausedUntil: number = 0;

  // Stats
  private totalRequests: number = 0;
  private total429s: number = 0;
  private recent429Timestamps: number[] = [];

  // Refill timer
  private refillTimer: ReturnType<typeof setInterval> | null = null;

  constructor(provider: ProviderName, quota: ProviderQuota) {
    this.provider = provider;
    this.quota = { ...quota };
    this.effectiveRpm = quota.rpm;
    this.tokens = quota.rpm; // Start with full bucket

    // Start refill timer
    this.refillTimer = setInterval(() => this.refill(), REFILL_INTERVAL_MS);
    this.refillTimer.unref?.();
  }

  // ── Acquire a slot ──────────────────────────────────────────────

  /**
   * Acquire a rate limit slot. Returns a promise that resolves when
   * a slot is available. If the queue is full, rejects immediately.
   *
   * @param timeoutMs Max time to wait for a slot (default 30s)
   * @returns A release function to call when the request completes
   */
  async acquire(timeoutMs: number = 30_000): Promise<() => void> {
    // Check if provider is paused
    if (this.isPaused()) {
      const waitMs = this.pausedUntil - Date.now();
      if (waitMs > timeoutMs) {
        throw new Error(
          `Provider "${this.provider}" is rate-limited for ${Math.ceil(waitMs / 1000)}s — exceeds timeout`,
        );
      }
      // Wait for pause to end
      await this.waitForUnpause(waitMs);
    }

    // Fast path: tokens available and under concurrency limit
    if (this.tokens >= 1 && this.inFlight < this.quota.maxConcurrent) {
      return this.consumeToken();
    }

    // Slow path: queue the request
    if (this.queue.length >= MAX_QUEUE_DEPTH) {
      throw new Error(
        `Provider "${this.provider}" queue full (${MAX_QUEUE_DEPTH} pending) — rejecting request`,
      );
    }

    return new Promise<() => void>((resolve, reject) => {
      const entry: QueueEntry = {
        resolve: () => resolve(this.consumeToken()),
        reject,
        enqueuedAt: Date.now(),
        timeoutMs,
      };
      this.queue.push(entry);
    });
  }

  // ── Token management ────────────────────────────────────────────

  private consumeToken(): () => void {
    this.tokens = Math.max(0, this.tokens - 1);
    this.inFlight++;
    this.totalRequests++;

    let released = false;
    return () => {
      if (released) {return;}
      released = true;
      this.inFlight = Math.max(0, this.inFlight - 1);
      // Try to drain the queue
      this.drainQueue();
    };
  }

  private refill(): void {
    // Refill tokens: add tokens per second based on effective RPM
    const tokensPerSecond = this.effectiveRpm / 60;
    this.tokens = Math.min(this.effectiveRpm, this.tokens + tokensPerSecond);

    // Adaptive recovery: slowly increase RPM if no recent 429s
    const now = Date.now();
    this.recent429Timestamps = this.recent429Timestamps.filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS,
    );

    if (this.recent429Timestamps.length === 0 && this.adaptiveFactor < 1.0) {
      this.adaptiveFactor = Math.min(1.0, this.adaptiveFactor * ADAPTIVE_RECOVERY_FACTOR);
      this.effectiveRpm = Math.max(MIN_RPM, Math.round(this.quota.rpm * this.adaptiveFactor));
    }

    // Expire timed-out queue entries
    this.expireQueue();

    // Try to drain the queue
    this.drainQueue();
  }

  private drainQueue(): void {
    while (
      this.queue.length > 0 &&
      this.tokens >= 1 &&
      this.inFlight < this.quota.maxConcurrent &&
      !this.isPaused()
    ) {
      const entry = this.queue.shift()!;
      entry.resolve();
    }
  }

  private expireQueue(): void {
    const now = Date.now();
    const expired: QueueEntry[] = [];
    this.queue = this.queue.filter((entry) => {
      if (now - entry.enqueuedAt > entry.timeoutMs) {
        expired.push(entry);
        return false;
      }
      return true;
    });
    for (const entry of expired) {
      entry.reject(
        new Error(`Rate limiter timeout: waited ${entry.timeoutMs}ms for "${this.provider}" slot`),
      );
    }
  }

  // ── Pause handling (429s) ───────────────────────────────────────

  isPaused(): boolean {
    return Date.now() < this.pausedUntil;
  }

  /**
   * Report a 429 rate limit response from this provider.
   * Pauses the bucket and adaptively reduces RPM.
   */
  reportRateLimit(retryAfterSec?: number): void {
    const now = Date.now();
    this.total429s++;
    this.recent429Timestamps.push(now);

    // Pause for retryAfter or default 10s
    const pauseDurationMs = (retryAfterSec ?? 10) * 1000;
    this.pausedUntil = Math.max(this.pausedUntil, now + pauseDurationMs);

    // Adaptive reduction
    this.adaptiveFactor *= ADAPTIVE_REDUCTION_FACTOR;
    this.effectiveRpm = Math.max(MIN_RPM, Math.round(this.quota.rpm * this.adaptiveFactor));

    // Reset tokens to prevent burst after unpause
    this.tokens = Math.min(this.tokens, Math.floor(this.effectiveRpm / 10));

    logger.warn(`Rate limit hit for "${this.provider}"`, {
      retryAfterSec: retryAfterSec ?? 10,
      effectiveRpm: this.effectiveRpm,
      adaptiveFactor: Math.round(this.adaptiveFactor * 100) / 100,
      queueDepth: this.queue.length,
      total429s: this.total429s,
    });
  }

  private async waitForUnpause(waitMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, waitMs + 50);
      if (typeof timer === "object" && "unref" in timer) {timer.unref();}
    });
  }

  // ── Stats ───────────────────────────────────────────────────────

  getStats(): BucketStats {
    const now = Date.now();
    return {
      provider: this.provider,
      tokens: Math.round(this.tokens * 100) / 100,
      maxTokens: this.effectiveRpm,
      effectiveRpm: this.effectiveRpm,
      inFlight: this.inFlight,
      maxConcurrent: this.quota.maxConcurrent,
      queueDepth: this.queue.length,
      totalRequests: this.totalRequests,
      total429s: this.total429s,
      paused: this.isPaused(),
      pauseRemainingMs: this.isPaused() ? Math.max(0, this.pausedUntil - now) : 0,
      adaptiveFactor: Math.round(this.adaptiveFactor * 100) / 100,
    };
  }

  // ── Configuration ───────────────────────────────────────────────

  updateQuota(quota: Partial<ProviderQuota>): void {
    if (quota.rpm !== undefined) {
      this.quota.rpm = quota.rpm;
      this.effectiveRpm = Math.max(MIN_RPM, Math.round(quota.rpm * this.adaptiveFactor));
    }
    if (quota.maxConcurrent !== undefined) {
      this.quota.maxConcurrent = quota.maxConcurrent;
    }
  }

  // ── Shutdown ────────────────────────────────────────────────────

  shutdown(): void {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
    // Reject all queued requests
    for (const entry of this.queue) {
      entry.reject(new Error("Rate limiter shutting down"));
    }
    this.queue = [];
  }
}

// ─── Global Rate Limiter ────────────────────────────────────────

class ApiRateLimiter {
  private buckets = new Map<ProviderName, TokenBucket>();
  private customQuotas = new Map<ProviderName, ProviderQuota>();

  constructor() {
    // Initialize all default buckets
    for (const [name, quota] of Object.entries(DEFAULT_QUOTAS)) {
      this.buckets.set(name as ProviderName, new TokenBucket(name as ProviderName, quota));
    }
  }

  /**
   * Acquire a rate limit slot for the given provider.
   * Returns a release function — MUST be called when the request completes.
   *
   * Usage:
   * ```ts
   * const release = await rateLimiter.acquire("gemini");
   * try {
   *   const result = await fetch(...);
   *   return result;
   * } finally {
   *   release();
   * }
   * ```
   */
  async acquire(provider: ProviderName, timeoutMs?: number): Promise<() => void> {
    const bucket = this.getBucket(provider);
    return bucket.acquire(timeoutMs);
  }

  /**
   * Report a 429 rate limit response from a provider.
   * Will pause the provider's bucket and adaptively reduce RPM.
   */
  reportRateLimit(provider: ProviderName, retryAfterSec?: number): void {
    const bucket = this.getBucket(provider);
    bucket.reportRateLimit(retryAfterSec);
  }

  /**
   * Convenience: wrap an async function with rate limiting.
   * Handles acquire + release automatically.
   */
  async withLimit<T>(provider: ProviderName, fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
    const release = await this.acquire(provider, timeoutMs);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /**
   * Parse a fetch Response for rate limit signals.
   * Call this after every API response to detect 429s.
   */
  handleResponse(
    provider: ProviderName,
    response: { status: number; headers?: { get?(name: string): string | null } },
  ): void {
    if (response.status === 429) {
      let retryAfter: number | undefined;
      const retryHeader = response.headers?.get?.("retry-after");
      if (retryHeader) {
        const parsed = Number(retryHeader);
        retryAfter = Number.isNaN(parsed) ? undefined : parsed;
      }
      this.reportRateLimit(provider, retryAfter);
    }
  }

  /**
   * Check if a provider is currently available (not paused, has tokens).
   */
  isAvailable(provider: ProviderName): boolean {
    const bucket = this.getBucket(provider);
    return !bucket.isPaused();
  }

  /**
   * Update quota for a provider at runtime.
   */
  setQuota(provider: ProviderName, quota: Partial<ProviderQuota>): void {
    this.customQuotas.set(provider, { ...DEFAULT_QUOTAS[provider], ...quota });
    const bucket = this.getBucket(provider);
    bucket.updateQuota(quota);
  }

  /**
   * Get stats for all providers.
   */
  getStats(): RateLimiterStats {
    const providers = {} as Record<ProviderName, BucketStats>;
    let globalTotalRequests = 0;
    let globalTotal429s = 0;
    let globalQueueDepth = 0;

    for (const [name, bucket] of this.buckets) {
      const stats = bucket.getStats();
      providers[name] = stats;
      globalTotalRequests += stats.totalRequests;
      globalTotal429s += stats.total429s;
      globalQueueDepth += stats.queueDepth;
    }

    return {
      providers,
      globalTotalRequests,
      globalTotal429s,
      globalQueueDepth,
    };
  }

  /**
   * Shutdown all buckets — cleanup timers.
   */
  shutdown(): void {
    for (const bucket of this.buckets.values()) {
      bucket.shutdown();
    }
    logger.info("API rate limiter shut down");
  }

  private getBucket(provider: ProviderName): TokenBucket {
    let bucket = this.buckets.get(provider);
    if (!bucket) {
      const quota =
        this.customQuotas.get(provider) ?? DEFAULT_QUOTAS[provider] ?? DEFAULT_QUOTAS.local;
      bucket = new TokenBucket(provider, quota);
      this.buckets.set(provider, bucket);
    }
    return bucket;
  }
}

// ─── Singleton ──────────────────────────────────────────────────

let instance: ApiRateLimiter | null = null;

/** Get the global API rate limiter instance. */
export function getRateLimiter(): ApiRateLimiter {
  if (!instance) {
    instance = new ApiRateLimiter();
    logger.info("API rate limiter initialized", {
      providers: Object.keys(DEFAULT_QUOTAS),
    });
  }
  return instance;
}

/** Shutdown the rate limiter and cleanup timers. */
export function shutdownRateLimiter(): void {
  instance?.shutdown();
  instance = null;
}

// ─── Convenience Exports ────────────────────────────────────────

/**
 * Map a provider string (from agent-runtime, compute-router, etc.)
 * to a canonical ProviderName for rate limiting.
 */
export function resolveProvider(engine: string): ProviderName {
  const lower = engine.toLowerCase();
  if (lower.includes("gemini")) {return "gemini";}
  if (lower.includes("openai") || lower.includes("gpt")) {return "openai";}
  if (lower.includes("anthropic") || lower.includes("claude")) {return "anthropic";}
  if (lower.includes("groq")) {return "groq";}
  if (lower.includes("nvidia") || lower.includes("nemotron") || lower.includes("nim")) {return "nvidia-nim";}
  if (lower.includes("openrouter")) {return "openrouter";}
  if (lower.includes("ollama")) {return "ollama";}
  if (lower.includes("lmstudio") || lower.includes("lm-studio") || lower.includes("lm_studio"))
    {return "lmstudio";}
  return "local";
}

/**
 * Extract Retry-After seconds from a fetch Response.
 * Returns undefined if not present.
 */
export function parseRetryAfter(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) {return undefined;}
  const secs = Number(header);
  if (!Number.isNaN(secs)) {return secs;}
  // Try parsing as HTTP date
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {return Math.max(0, Math.ceil((date - Date.now()) / 1000));}
  return undefined;
}
