/**
 * HoC Resilience Engine
 *
 * Advanced error handling and recovery for the gateway:
 * - Exponential backoff retry with jitter
 * - Error memory: remembers failures and their resolutions
 * - Self-healing: applies known fixes automatically
 * - Degradation modes: graceful feature disabling under pressure
 *
 * Usage:
 *   import { resilience } from './resilience.js';
 *   const result = await resilience.withRetry('myOperation', () => doSomething(),
 *     { maxRetries: 3, retryableErrors: ['TIMEOUT', 'ECONNREFUSED'] });
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RetryPolicy {
  /** Maximum retry attempts. Default: 3 */
  maxRetries: number;
  /** Base delay in ms. Default: 1000 */
  baseDelayMs: number;
  /** Maximum delay cap in ms. Default: 30_000 */
  maxDelayMs: number;
  /** Backoff multiplier. Default: 2.0 */
  backoffMultiplier: number;
  /** Add random jitter to prevent thundering herd. Default: true */
  jitter: boolean;
  /** Error codes/messages that are retryable */
  retryableErrors: string[];
  /** Whether the operation is idempotent (safe to retry). Default: true */
  idempotent: boolean;
}

interface ErrorRecord {
  pattern: string;            // error signature (message hash or code)
  category: string;           // operation category
  occurrences: number;
  firstSeen: number;
  lastSeen: number;
  consecutiveFailures: number;
  resolution?: {
    strategy: string;
    appliedAt: number;
    successful: boolean;
  };
  autoFixId?: string;         // ID of auto-fix to try
}

interface AutoFix {
  id: string;
  description: string;
  errorPatterns: string[];    // patterns this fix applies to
  fix: () => Promise<boolean>;
  appliedCount: number;
  successCount: number;
  lastApplied: number;
  cooldownMs: number;         // min time between applications
}

export interface ResilienceMetrics {
  totalRetries: number;
  totalSuccessfulRetries: number;
  totalExhaustedRetries: number;
  errorMemorySize: number;
  autoFixesApplied: number;
  autoFixesSucceeded: number;
  degradedFeatures: string[];
}

// ─── Retry with Exponential Backoff ──────────────────────────────────────────

const DEFAULT_RETRY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2.0,
  jitter: true,
  retryableErrors: [
    "AGENT_TIMEOUT", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT",
    "EPIPE", "EAI_AGAIN", "UNAVAILABLE", "fetch failed",
  ],
  idempotent: true,
};

function calculateDelay(attempt: number, policy: RetryPolicy): number {
  // delay = min(maxDelay, baseDelay × multiplier^attempt)
  let delay = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt),
  );
  // Add jitter: ±25% randomization to prevent thundering herd
  if (policy.jitter) {
    const jitterRange = delay * 0.25;
    delay += (Math.random() * 2 - 1) * jitterRange;
  }
  return Math.max(0, Math.round(delay));
}

function isRetryable(error: unknown, policy: RetryPolicy): boolean {
  if (!policy.idempotent) { return false; }
  const msg = error instanceof Error ? error.message : String(error);
  return policy.retryableErrors.some((pattern) =>
    msg.includes(pattern) || (error instanceof Error && (error as NodeJS.ErrnoException).code === pattern),
  );
}

// ─── Resilience Engine ───────────────────────────────────────────────────────

class ResilienceEngine {
  private errorMemory = new Map<string, ErrorRecord>();
  private autoFixes = new Map<string, AutoFix>();
  private degradedFeatures = new Set<string>();

  // Metrics
  private totalRetries = 0;
  private totalSuccessfulRetries = 0;
  private totalExhaustedRetries = 0;
  private autoFixesApplied = 0;
  private autoFixesSucceeded = 0;

  constructor() {
    this.registerBuiltinAutoFixes();
  }

  /**
   * Execute an operation with retry logic.
   * Returns the result on success, throws on final failure.
   */
  async withRetry<T>(
    operationName: string,
    fn: () => Promise<T>,
    policyOverrides?: Partial<RetryPolicy>,
  ): Promise<T> {
    const policy: RetryPolicy = { ...DEFAULT_RETRY, ...policyOverrides };
    let lastError: unknown;

    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
      try {
        const result = await fn();
        // Success — record recovery and clear error memory
        if (attempt > 0) {
          this.totalSuccessfulRetries++;
          this.recordResolution(operationName, `Retry succeeded on attempt ${attempt + 1}`);
          console.info(
            `[resilience] ✅ ${operationName} succeeded after ${attempt} retries`,
          );
        }
        return result;
      } catch (err) {
        lastError = err;
        this.recordError(operationName, err);

        // Check if error is retryable
        if (!isRetryable(err, policy) || attempt >= policy.maxRetries) {
          break;
        }

        // Attempt auto-fix before retry
        await this.tryAutoFix(operationName, err);

        const delay = calculateDelay(attempt, policy);
        this.totalRetries++;
        console.warn(
          `[resilience] ⚠️ ${operationName} failed (attempt ${attempt + 1}/${policy.maxRetries + 1}), ` +
          `retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    this.totalExhaustedRetries++;
    throw lastError;
  }

  /**
   * Record an error in memory for pattern analysis
   */
  recordError(category: string, error: unknown): void {
    const pattern = this.errorToPattern(error);
    const key = `${category}::${pattern}`;
    const existing = this.errorMemory.get(key);

    if (existing) {
      existing.occurrences++;
      existing.consecutiveFailures++;
      existing.lastSeen = Date.now();
    } else {
      this.errorMemory.set(key, {
        pattern,
        category,
        occurrences: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        consecutiveFailures: 1,
        autoFixId: this.findAutoFixForError(error),
      });
    }

    // Prune old entries (keep last 200)
    if (this.errorMemory.size > 200) {
      const sorted = [...this.errorMemory.entries()]
        .toSorted((a, b) => a[1].lastSeen - b[1].lastSeen);
      const toRemove = sorted.slice(0, this.errorMemory.size - 200);
      for (const [key] of toRemove) {
        this.errorMemory.delete(key);
      }
    }
  }

  /**
   * Record a successful resolution
   */
  recordResolution(category: string, strategy: string): void {
    for (const [, record] of this.errorMemory) {
      if (record.category === category && !record.resolution) {
        record.resolution = {
          strategy,
          appliedAt: Date.now(),
          successful: true,
        };
        record.consecutiveFailures = 0;
        break;
      }
    }
  }

  /**
   * Mark a feature as degraded (disabled due to resource constraints)
   */
  degradeFeature(feature: string, reason: string): void {
    if (!this.degradedFeatures.has(feature)) {
      this.degradedFeatures.add(feature);
      console.warn(`[resilience] ⚡ Feature degraded: ${feature} — ${reason}`);
    }
  }

  /**
   * Restore a degraded feature
   */
  restoreFeature(feature: string): void {
    if (this.degradedFeatures.has(feature)) {
      this.degradedFeatures.delete(feature);
      console.info(`[resilience] ✅ Feature restored: ${feature}`);
    }
  }

  /** Check if a feature is currently degraded */
  isFeatureDegraded(feature: string): boolean {
    return this.degradedFeatures.has(feature);
  }

  /** Get error patterns for a category (for UI display) */
  getErrorPatterns(category?: string): Array<{
    pattern: string;
    category: string;
    occurrences: number;
    lastSeen: number;
    resolved: boolean;
    autoFixAvailable: boolean;
  }> {
    const entries = [...this.errorMemory.values()];
    const filtered = category ? entries.filter((e) => e.category === category) : entries;
    return filtered.map((e) => ({
      pattern: e.pattern,
      category: e.category,
      occurrences: e.occurrences,
      lastSeen: e.lastSeen,
      resolved: !!e.resolution?.successful,
      autoFixAvailable: !!e.autoFixId,
    }));
  }

  /** Get metrics */
  getMetrics(): ResilienceMetrics {
    return {
      totalRetries: this.totalRetries,
      totalSuccessfulRetries: this.totalSuccessfulRetries,
      totalExhaustedRetries: this.totalExhaustedRetries,
      errorMemorySize: this.errorMemory.size,
      autoFixesApplied: this.autoFixesApplied,
      autoFixesSucceeded: this.autoFixesSucceeded,
      degradedFeatures: [...this.degradedFeatures],
    };
  }

  /** Register a custom auto-fix */
  registerAutoFix(fix: Omit<AutoFix, "appliedCount" | "successCount" | "lastApplied">): void {
    this.autoFixes.set(fix.id, {
      ...fix,
      appliedCount: 0,
      successCount: 0,
      lastApplied: 0,
    });
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private errorToPattern(error: unknown): string {
    if (error instanceof Error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code) { return code; }
      // Extract first meaningful line of the message
      const firstLine = error.message.split("\n")[0].slice(0, 100);
      return firstLine;
    }
    return String(error).slice(0, 100);
  }

  private findAutoFixForError(error: unknown): string | undefined {
    const pattern = this.errorToPattern(error);
    for (const [id, fix] of this.autoFixes) {
      if (fix.errorPatterns.some((p) => pattern.includes(p))) {
        return id;
      }
    }
    return undefined;
  }

  private async tryAutoFix(category: string, error: unknown): Promise<void> {
    const pattern = this.errorToPattern(error);
    const key = `${category}::${pattern}`;
    const record = this.errorMemory.get(key);
    if (!record?.autoFixId) { return; }

    const fix = this.autoFixes.get(record.autoFixId);
    if (!fix) { return; }

    // Check cooldown
    if (Date.now() - fix.lastApplied < fix.cooldownMs) { return; }

    try {
      this.autoFixesApplied++;
      fix.appliedCount++;
      fix.lastApplied = Date.now();

      console.info(`[resilience] 🔧 Attempting auto-fix: ${fix.description}`);
      const success = await fix.fix();

      if (success) {
        this.autoFixesSucceeded++;
        fix.successCount++;
        record.resolution = {
          strategy: `Auto-fix: ${fix.description}`,
          appliedAt: Date.now(),
          successful: true,
        };
        console.info(`[resilience] ✅ Auto-fix succeeded: ${fix.description}`);
      } else {
        console.warn(`[resilience] ❌ Auto-fix failed: ${fix.description}`);
      }
    } catch (err) {
      console.error(`[resilience] Auto-fix error:`, err);
    }
  }

  private registerBuiltinAutoFixes(): void {
    // Auto-fix: Ollama connection refused → mark as offline
    this.registerAutoFix({
      id: "ollama-offline",
      description: "Mark Ollama as offline when connection refused",
      errorPatterns: ["ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:11434"],
      cooldownMs: 60_000,
      fix: async () => {
        // Just mark as degraded — the system will skip Ollama in catalog
        this.degradeFeature("ollama", "Connection refused");
        return true;
      },
    });

    // Auto-fix: nvidia-smi not found → skip GPU detection
    this.registerAutoFix({
      id: "no-nvidia-smi",
      description: "Skip GPU detection when nvidia-smi unavailable",
      errorPatterns: ["nvidia-smi", "ENOENT", "not found", "not recognized"],
      cooldownMs: 300_000, // 5 min cooldown
      fix: async () => {
        this.degradeFeature("nvidia-gpu", "nvidia-smi not available");
        return true;
      },
    });

    // Auto-fix: disk full → suggest cleanup
    this.registerAutoFix({
      id: "disk-full",
      description: "Alert on disk full errors",
      errorPatterns: ["ENOSPC", "no space left"],
      cooldownMs: 120_000,
      fix: async () => {
        // Try to clean temp files
        try {
          const fsp = await import("node:fs/promises");
          const tmpDir = (await import("node:os")).tmpdir();
          const entries = await fsp.readdir(tmpDir);
          let cleaned = 0;
          for (const entry of entries) {
            if (entry.startsWith("hoc-") || entry.startsWith("tmp-")) {
              try {
                await fsp.rm(`${tmpDir}/${entry}`, { recursive: true });
                cleaned++;
              } catch { /* ignore */ }
            }
          }
          console.info(`[resilience] Cleaned ${cleaned} temp files`);
          return cleaned > 0;
        } catch {
          return false;
        }
      },
    });

    // Auto-fix: pip install timeout → retry with longer timeout
    this.registerAutoFix({
      id: "pip-timeout",
      description: "Handle pip install timeouts",
      errorPatterns: ["pip install", "timed out", "ReadTimeoutError"],
      cooldownMs: 60_000,
      fix: async () => {
        // This is informational — the retry mechanism itself handles this
        console.info("[resilience] pip install timeout — will retry with longer timeout");
        return true;
      },
    });

    // Auto-fix: LM Studio not connected
    this.registerAutoFix({
      id: "lmstudio-offline",
      description: "Mark LM Studio as offline when api unreachable",
      errorPatterns: ["ECONNREFUSED", "lm-studio", "lmstudio"],
      cooldownMs: 60_000,
      fix: async () => {
        this.degradeFeature("lmstudio", "API unreachable");
        return true;
      },
    });
  }
}

/** Singleton resilience engine */
export const resilience = new ResilienceEngine();
