/**
 * OpenClaw — Auth Profile Rotation Manager
 *
 * Adapted from upstream OpenClaw `agents/auth-profiles/`.
 *
 * Multi-key resilience system for API provider authentication:
 *  - Multiple API keys per provider with rotation
 *  - Automatic cooldown on rate-limit (429) or auth errors
 *  - Round-robin key selection with health-aware weighting
 *  - Key validation and health probing
 *  - Per-key usage tracking (request count, last used, last error)
 *  - Automatic recovery when cooled-down keys become available
 *
 * This decouples key management from the inference pipeline:
 * cloud-inference.ts calls `getKey("gemini")` instead of `process.env.GEMINI_API_KEY`
 * and the rotation manager handles the rest.
 *
 * Memory Safety:
 *  - MAX_PROFILES caps total key profiles at 100
 *  - MAX_KEYS_PER_PROVIDER caps at 20 keys per provider
 *  - Cooldown state is fixed-size (one entry per key)
 */

// ─── Types ──────────────────────────────────────────────────────

export interface AuthProfile {
  /** Unique key identifier */
  id: string;
  /** Provider name (gemini, openai, anthropic, etc.) */
  provider: string;
  /** The actual API key value */
  apiKey: string;
  /** Human-readable label for this key */
  label: string;
  /** Whether this key is currently enabled */
  enabled: boolean;
  /** Priority (lower = preferred). Default: 0 */
  priority: number;
  /** When this key was added */
  createdAtMs: number;
}

export interface KeyHealth {
  /** Total requests made with this key */
  requestCount: number;
  /** Total successful requests */
  successCount: number;
  /** Total failed requests */
  errorCount: number;
  /** Last time this key was used */
  lastUsedMs: number;
  /** Last error message */
  lastError?: string;
  /** Cooldown state */
  cooldown: {
    active: boolean;
    reason?: CooldownReason;
    until?: number;
    /** How many consecutive failures triggered the cooldown */
    consecutiveFailures: number;
  };
}

export type CooldownReason =
  | "rate_limit"
  | "auth_error"
  | "quota_exceeded"
  | "server_error"
  | "timeout"
  | "unknown";

export interface RotationResult {
  /** The selected API key value */
  apiKey: string;
  /** Profile ID of the selected key */
  profileId: string;
  /** Label for logging */
  label: string;
  /** How many keys were skipped (in cooldown) */
  skipped: number;
}

// ─── Constants ──────────────────────────────────────────────────

const MAX_PROFILES = 100;
const MAX_KEYS_PER_PROVIDER = 20;

/** Cooldown durations by reason (milliseconds) */
const COOLDOWN_DURATIONS: Record<CooldownReason, number> = {
  rate_limit: 60_000, // 1 minute
  auth_error: 300_000, // 5 minutes (likely permanent, but allow retry)
  quota_exceeded: 3600_000, // 1 hour
  server_error: 30_000, // 30 seconds
  timeout: 15_000, // 15 seconds
  unknown: 30_000, // 30 seconds
};

/** Exponential backoff multiplier for consecutive failures */
const BACKOFF_MULTIPLIER = 2;
const MAX_BACKOFF_MS = 3600_000; // 1 hour max

// ─── State ──────────────────────────────────────────────────────

/** Profile store: profileId → AuthProfile */
const profiles = new Map<string, AuthProfile>();
/** Health tracking: profileId → KeyHealth */
const health = new Map<string, KeyHealth>();
/** Round-robin index per provider */
const rotationIndex = new Map<string, number>();

// ─── Profile Management ─────────────────────────────────────────

function addProfile(profile: AuthProfile): boolean {
  // Check per-provider limit
  const providerCount = [...profiles.values()].filter(
    (p) => p.provider === profile.provider,
  ).length;
  if (providerCount >= MAX_KEYS_PER_PROVIDER && !profiles.has(profile.id)) {
    return false;
  }

  // Check global limit
  if (profiles.size >= MAX_PROFILES && !profiles.has(profile.id)) {
    return false;
  }

  profiles.set(profile.id, profile);

  // Initialize health if new
  if (!health.has(profile.id)) {
    health.set(profile.id, {
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      lastUsedMs: 0,
      cooldown: { active: false, consecutiveFailures: 0 },
    });
  }

  return true;
}

function removeProfile(profileId: string): boolean {
  health.delete(profileId);
  return profiles.delete(profileId);
}

function getProfile(profileId: string): AuthProfile | null {
  return profiles.get(profileId) ?? null;
}

function listProfiles(provider?: string): AuthProfile[] {
  const all = [...profiles.values()];
  if (provider) {
    return all.filter((p) => p.provider === provider);
  }
  return all;
}

/**
 * Auto-seed profiles from environment variables.
 * For each provider, checks the standard env var (e.g., GEMINI_API_KEY)
 * and registers it as the primary key.
 */
function seedFromEnv(): number {
  const envMap: Record<string, string> = {
    gemini: "GEMINI_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    groq: "GROQ_API_KEY",
    nvidia: "NVIDIA_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };

  let seeded = 0;
  for (const [provider, envVar] of Object.entries(envMap)) {
    const key = process.env[envVar];
    if (!key) {
      continue;
    }

    // Also check for multi-key env vars (e.g., GEMINI_API_KEY_2, GEMINI_API_KEY_3)
    const keys = [key];
    for (let i = 2; i <= 10; i++) {
      const extra = process.env[`${envVar}_${i}`];
      if (extra) {
        keys.push(extra);
      }
    }

    for (let i = 0; i < keys.length; i++) {
      const profileId = `${provider}-env-${i + 1}`;
      if (profiles.has(profileId)) {
        continue;
      }

      addProfile({
        id: profileId,
        provider,
        apiKey: keys[i],
        label: i === 0 ? `${provider} (primary)` : `${provider} (key ${i + 1})`,
        enabled: true,
        priority: i, // primary key has lowest priority number (preferred)
        createdAtMs: Date.now(),
      });
      seeded++;
    }
  }
  return seeded;
}

// ─── Key Selection (Rotation) ───────────────────────────────────

/**
 * Get the best available API key for a provider.
 *
 * Selection order:
 * 1. Filter to enabled keys for this provider
 * 2. Sort by priority (lower is preferred)
 * 3. Skip keys in cooldown
 * 4. Round-robin among equal-priority keys
 *
 * Falls back to process.env if no profiles are registered.
 */
function getKey(provider: string): RotationResult | null {
  const candidates = [...profiles.values()]
    .filter((p) => p.provider === provider && p.enabled)
    .toSorted((a, b) => a.priority - b.priority);

  if (candidates.length === 0) {
    // Fall back to env var
    const envKey = getEnvKey(provider);
    if (envKey) {
      return {
        apiKey: envKey,
        profileId: `${provider}-env-fallback`,
        label: `${provider} (env fallback)`,
        skipped: 0,
      };
    }
    return null;
  }

  const now = Date.now();
  let skipped = 0;

  // Try candidates in priority order, with round-robin for ties
  const currentIdx = rotationIndex.get(provider) ?? 0;

  for (let attempt = 0; attempt < candidates.length; attempt++) {
    const idx = (currentIdx + attempt) % candidates.length;
    const candidate = candidates[idx];
    const keyHealth = health.get(candidate.id);

    if (keyHealth?.cooldown.active && keyHealth.cooldown.until) {
      if (now < keyHealth.cooldown.until) {
        skipped++;
        continue;
      }
      // Cooldown expired — clear it
      keyHealth.cooldown.active = false;
      keyHealth.cooldown.reason = undefined;
      keyHealth.cooldown.until = undefined;
    }

    // Found a usable key — advance rotation index
    rotationIndex.set(provider, (idx + 1) % candidates.length);

    return {
      apiKey: candidate.apiKey,
      profileId: candidate.id,
      label: candidate.label,
      skipped,
    };
  }

  // All keys in cooldown — return the one with the soonest recovery
  const soonest = candidates
    .map((c) => ({ profile: c, until: health.get(c.id)?.cooldown.until ?? Infinity }))
    .toSorted((a, b) => a.until - b.until)[0];

  if (soonest) {
    return {
      apiKey: soonest.profile.apiKey,
      profileId: soonest.profile.id,
      label: `${soonest.profile.label} (cooldown, forced)`,
      skipped: candidates.length - 1,
    };
  }

  return null;
}

function getEnvKey(provider: string): string | null {
  const envMap: Record<string, string> = {
    gemini: "GEMINI_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    groq: "GROQ_API_KEY",
    nvidia: "NVIDIA_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };
  const envVar = envMap[provider];
  if (!envVar) {
    return null;
  }
  const val = process.env[envVar];
  return val && val.length > 0 ? val : null;
}

// ─── Health Recording ───────────────────────────────────────────

function recordSuccess(profileId: string): void {
  const h = health.get(profileId);
  if (!h) {
    return;
  }

  h.requestCount++;
  h.successCount++;
  h.lastUsedMs = Date.now();

  // Clear cooldown on success
  h.cooldown.active = false;
  h.cooldown.reason = undefined;
  h.cooldown.until = undefined;
  h.cooldown.consecutiveFailures = 0;
}

function recordFailure(profileId: string, reason: CooldownReason): void {
  const h = health.get(profileId);
  if (!h) {
    return;
  }

  h.requestCount++;
  h.errorCount++;
  h.lastUsedMs = Date.now();
  h.lastError = reason;

  // Increment consecutive failures
  h.cooldown.consecutiveFailures++;

  // Calculate cooldown duration with exponential backoff
  const baseDuration = COOLDOWN_DURATIONS[reason] ?? COOLDOWN_DURATIONS.unknown;
  const backoff = Math.min(
    baseDuration * Math.pow(BACKOFF_MULTIPLIER, h.cooldown.consecutiveFailures - 1),
    MAX_BACKOFF_MS,
  );

  h.cooldown.active = true;
  h.cooldown.reason = reason;
  h.cooldown.until = Date.now() + backoff;
}

/**
 * Classify an HTTP status or error message into a CooldownReason.
 */
function classifyError(statusOrMessage: number | string): CooldownReason {
  if (typeof statusOrMessage === "number") {
    if (statusOrMessage === 429) {
      return "rate_limit";
    }
    if (statusOrMessage === 401 || statusOrMessage === 403) {
      return "auth_error";
    }
    if (statusOrMessage === 402) {
      return "quota_exceeded";
    }
    if (statusOrMessage >= 500) {
      return "server_error";
    }
    return "unknown";
  }

  const lower = statusOrMessage.toLowerCase();
  if (lower.includes("429") || lower.includes("rate limit")) {
    return "rate_limit";
  }
  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden")
  ) {
    return "auth_error";
  }
  if (lower.includes("quota") || lower.includes("402") || lower.includes("billing")) {
    return "quota_exceeded";
  }
  if (lower.includes("500") || lower.includes("503") || lower.includes("server")) {
    return "server_error";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "timeout";
  }
  return "unknown";
}

// ─── Diagnostics ────────────────────────────────────────────────

function getDiagnostics(): {
  totalProfiles: number;
  maxProfiles: number;
  providers: Record<
    string,
    {
      totalKeys: number;
      activeKeys: number;
      inCooldown: number;
      totalRequests: number;
      totalErrors: number;
    }
  >;
} {
  const providers: Record<
    string,
    {
      totalKeys: number;
      activeKeys: number;
      inCooldown: number;
      totalRequests: number;
      totalErrors: number;
    }
  > = {};

  const now = Date.now();

  for (const profile of profiles.values()) {
    if (!providers[profile.provider]) {
      providers[profile.provider] = {
        totalKeys: 0,
        activeKeys: 0,
        inCooldown: 0,
        totalRequests: 0,
        totalErrors: 0,
      };
    }

    const p = providers[profile.provider];
    p.totalKeys++;

    const h = health.get(profile.id);
    if (h) {
      p.totalRequests += h.requestCount;
      p.totalErrors += h.errorCount;

      const inCooldown = h.cooldown.active && h.cooldown.until ? now < h.cooldown.until : false;
      if (inCooldown) {
        p.inCooldown++;
      } else if (profile.enabled) {
        p.activeKeys++;
      }
    } else if (profile.enabled) {
      p.activeKeys++;
    }
  }

  return {
    totalProfiles: profiles.size,
    maxProfiles: MAX_PROFILES,
    providers,
  };
}

function getKeyHealth(profileId: string): KeyHealth | null {
  return health.get(profileId) ?? null;
}

function clearCooldown(profileId: string): boolean {
  const h = health.get(profileId);
  if (!h) {
    return false;
  }
  h.cooldown.active = false;
  h.cooldown.reason = undefined;
  h.cooldown.until = undefined;
  h.cooldown.consecutiveFailures = 0;
  return true;
}

function clearAllCooldowns(): void {
  for (const h of health.values()) {
    h.cooldown.active = false;
    h.cooldown.reason = undefined;
    h.cooldown.until = undefined;
    h.cooldown.consecutiveFailures = 0;
  }
}

// ─── Exported Singleton ─────────────────────────────────────────

export const authProfileRotation = {
  addProfile,
  removeProfile,
  getProfile,
  listProfiles,
  seedFromEnv,
  getKey,
  recordSuccess,
  recordFailure,
  classifyError,
  getDiagnostics,
  getKeyHealth,
  clearCooldown,
  clearAllCooldowns,
} as const;
