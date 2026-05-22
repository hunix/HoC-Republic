/**
 * OpenClaw — Bootstrap Budget Manager
 *
 * Adapted from upstream OpenClaw `agents/bootstrap-budget.ts`.
 *
 * Proactive token budget enforcement for agent sessions:
 *  - Per-session token budgets (input + output) with hard caps
 *  - Cost tracking per provider with configurable USD ceiling
 *  - Context window guard that prevents sessions from exceeding model limits
 *  - Budget alerts at configurable thresholds (50%, 75%, 90%)
 *  - Session-scoped accounting with automatic cleanup on session end
 *
 * Integrates with the sandbox-agent-loop's existing MAX_TOTAL_TOKENS and
 * MAX_COST_USD constants, providing structured enforcement and observability
 * instead of just hard kills.
 *
 * Memory Safety:
 *  - MAX_TRACKED_SESSIONS caps active session tracking at 200
 *  - Eviction: oldest completed sessions are removed first
 *  - Per-session data is bounded (fixed-size counters, not growing arrays)
 */

// ─── Types ──────────────────────────────────────────────────────

export interface BudgetConfig {
  /** Max total tokens (input + output) for this session */
  maxTokens: number;
  /** Max cost in USD for this session */
  maxCostUsd: number;
  /** Max context window size in tokens (model-specific) */
  maxContextWindow: number;
  /** Alert thresholds as ratios (0–1). Default: [0.5, 0.75, 0.9] */
  alertThresholds: number[];
  /** Provider cost per million tokens (blended in/out) */
  costPerMillionTokens: number;
}

export interface BudgetSession {
  sessionId: string;
  config: BudgetConfig;
  /** Cumulative input tokens consumed */
  inputTokens: number;
  /** Cumulative output tokens consumed */
  outputTokens: number;
  /** Current context window usage (last turn's total) */
  currentContextTokens: number;
  /** Estimated cost in USD so far */
  estimatedCostUsd: number;
  /** Number of LLM turns completed */
  turnCount: number;
  /** Which alert thresholds have already fired */
  firedAlerts: Set<number>;
  /** Session state */
  state: "active" | "completed" | "exceeded";
  /** When the session started */
  startedAtMs: number;
  /** When the session ended (if completed/exceeded) */
  endedAtMs?: number;
}

export type BudgetCheckResult =
  | { allowed: true; warnings: BudgetWarning[] }
  | { allowed: false; reason: BudgetExceededReason; details: string };

export interface BudgetWarning {
  type: "token_threshold" | "cost_threshold" | "context_pressure";
  threshold: number;
  current: number;
  max: number;
  message: string;
}

export type BudgetExceededReason = "token_limit" | "cost_limit" | "context_overflow";

// ─── Constants ──────────────────────────────────────────────────

const MAX_TRACKED_SESSIONS = 200;

const DEFAULT_CONFIG: BudgetConfig = {
  maxTokens: 500_000,
  maxCostUsd: 5.0,
  maxContextWindow: 128_000,
  alertThresholds: [0.5, 0.75, 0.9],
  costPerMillionTokens: 0.3, // Gemini default
};

/** Provider-specific default costs per million tokens (blended) */
const PROVIDER_COSTS: Record<string, number> = {
  gemini: 0.3,
  openai: 5.0,
  anthropic: 6.0,
  deepseek: 0.55,
  groq: 0.05,
  nvidia: 0.5,
  openrouter: 2.0,
  lmstudio: 0,
  ollama: 0,
};

/** Provider-specific default context window sizes */
const PROVIDER_CONTEXT_WINDOWS: Record<string, number> = {
  gemini: 1_000_000,
  openai: 128_000,
  anthropic: 200_000,
  deepseek: 128_000,
  groq: 128_000,
  nvidia: 128_000,
  openrouter: 128_000,
  lmstudio: 32_000,
  ollama: 32_000,
};

// ─── Session Store ──────────────────────────────────────────────

const sessions = new Map<string, BudgetSession>();

function evictCompletedSessions(targetFree: number): void {
  if (sessions.size + targetFree <= MAX_TRACKED_SESSIONS) {
    return;
  }

  // Remove completed/exceeded sessions first (oldest first)
  const completed = [...sessions.entries()]
    .filter(([, s]) => s.state !== "active")
    .toSorted(([, a], [, b]) => (a.endedAtMs ?? a.startedAtMs) - (b.endedAtMs ?? b.startedAtMs));

  let toRemove = sessions.size + targetFree - MAX_TRACKED_SESSIONS;
  for (const [id] of completed) {
    if (toRemove <= 0) {
      break;
    }
    sessions.delete(id);
    toRemove--;
  }

  // If still not enough, evict oldest active sessions
  if (toRemove > 0) {
    const active = [...sessions.entries()]
      .filter(([, s]) => s.state === "active")
      .toSorted(([, a], [, b]) => a.startedAtMs - b.startedAtMs);

    for (const [id] of active) {
      if (toRemove <= 0) {
        break;
      }
      sessions.delete(id);
      toRemove--;
    }
  }
}

// ─── Session Lifecycle ──────────────────────────────────────────

function createSession(sessionId: string, config?: Partial<BudgetConfig>): BudgetSession {
  evictCompletedSessions(1);

  const session: BudgetSession = {
    sessionId,
    config: { ...DEFAULT_CONFIG, ...config },
    inputTokens: 0,
    outputTokens: 0,
    currentContextTokens: 0,
    estimatedCostUsd: 0,
    turnCount: 0,
    firedAlerts: new Set(),
    state: "active",
    startedAtMs: Date.now(),
  };

  sessions.set(sessionId, session);
  return session;
}

function getSession(sessionId: string): BudgetSession | null {
  return sessions.get(sessionId) ?? null;
}

function endSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }
  if (session.state === "active") {
    session.state = "completed";
  }
  session.endedAtMs = Date.now();
}

/**
 * Build a BudgetConfig from a provider name, merging with any overrides.
 */
function configForProvider(provider: string, overrides?: Partial<BudgetConfig>): BudgetConfig {
  return {
    ...DEFAULT_CONFIG,
    costPerMillionTokens: PROVIDER_COSTS[provider] ?? DEFAULT_CONFIG.costPerMillionTokens,
    maxContextWindow: PROVIDER_CONTEXT_WINDOWS[provider] ?? DEFAULT_CONFIG.maxContextWindow,
    ...overrides,
  };
}

// ─── Budget Tracking ────────────────────────────────────────────

/**
 * Record token usage for a turn and return budget status.
 * This should be called after each LLM API response.
 */
function recordTurn(
  sessionId: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    contextTokens?: number;
  },
): BudgetCheckResult {
  const session = sessions.get(sessionId);
  if (!session) {
    return { allowed: true, warnings: [] };
  }
  if (session.state !== "active") {
    return {
      allowed: false,
      reason: "token_limit",
      details: `Session ${sessionId} is ${session.state}`,
    };
  }

  session.inputTokens += usage.inputTokens;
  session.outputTokens += usage.outputTokens;
  session.currentContextTokens = usage.contextTokens ?? session.currentContextTokens;
  session.turnCount++;

  // Estimate cost
  const totalTokens = session.inputTokens + session.outputTokens;
  session.estimatedCostUsd = (totalTokens / 1_000_000) * session.config.costPerMillionTokens;

  return checkBudget(session);
}

/**
 * Pre-flight budget check before making an LLM call.
 * Returns whether the next call is allowed and any warnings.
 */
function checkBudget(session: BudgetSession): BudgetCheckResult {
  const warnings: BudgetWarning[] = [];
  const totalTokens = session.inputTokens + session.outputTokens;
  const { config } = session;

  // ── Hard limit checks ──

  if (totalTokens >= config.maxTokens) {
    session.state = "exceeded";
    session.endedAtMs = Date.now();
    return {
      allowed: false,
      reason: "token_limit",
      details: `Token budget exceeded: ${totalTokens.toLocaleString()} / ${config.maxTokens.toLocaleString()}`,
    };
  }

  if (session.estimatedCostUsd >= config.maxCostUsd) {
    session.state = "exceeded";
    session.endedAtMs = Date.now();
    return {
      allowed: false,
      reason: "cost_limit",
      details: `Cost budget exceeded: $${session.estimatedCostUsd.toFixed(4)} / $${config.maxCostUsd.toFixed(2)}`,
    };
  }

  if (session.currentContextTokens >= config.maxContextWindow * 0.95) {
    return {
      allowed: false,
      reason: "context_overflow",
      details: `Context window at ${Math.round((session.currentContextTokens / config.maxContextWindow) * 100)}% — compaction required`,
    };
  }

  // ── Threshold warnings ──

  const tokenRatio = totalTokens / config.maxTokens;
  for (const threshold of config.alertThresholds) {
    if (tokenRatio >= threshold && !session.firedAlerts.has(threshold)) {
      session.firedAlerts.add(threshold);
      warnings.push({
        type: "token_threshold",
        threshold,
        current: totalTokens,
        max: config.maxTokens,
        message: `Token usage at ${Math.round(tokenRatio * 100)}% (${totalTokens.toLocaleString()} / ${config.maxTokens.toLocaleString()})`,
      });
    }
  }

  const costRatio = session.estimatedCostUsd / config.maxCostUsd;
  for (const threshold of config.alertThresholds) {
    const costKey = threshold + 100; // offset to distinguish from token thresholds
    if (costRatio >= threshold && !session.firedAlerts.has(costKey)) {
      session.firedAlerts.add(costKey);
      warnings.push({
        type: "cost_threshold",
        threshold,
        current: session.estimatedCostUsd,
        max: config.maxCostUsd,
        message: `Cost at ${Math.round(costRatio * 100)}% ($${session.estimatedCostUsd.toFixed(4)} / $${config.maxCostUsd.toFixed(2)})`,
      });
    }
  }

  // Context pressure warning (at 80%)
  if (session.currentContextTokens >= config.maxContextWindow * 0.8) {
    const contextRatio = session.currentContextTokens / config.maxContextWindow;
    const contextKey = 999; // unique key for context warning
    if (!session.firedAlerts.has(contextKey)) {
      session.firedAlerts.add(contextKey);
      warnings.push({
        type: "context_pressure",
        threshold: 0.8,
        current: session.currentContextTokens,
        max: config.maxContextWindow,
        message: `Context window at ${Math.round(contextRatio * 100)}% — consider compaction`,
      });
    }
  }

  return { allowed: true, warnings };
}

/**
 * Pre-flight check: can this session afford another turn?
 * Lightweight check without recording anything.
 */
function canAffordTurn(sessionId: string): BudgetCheckResult {
  const session = sessions.get(sessionId);
  if (!session) {
    return { allowed: true, warnings: [] };
  }
  return checkBudget(session);
}

// ─── Diagnostics ────────────────────────────────────────────────

function getStats() {
  const activeSessions = [...sessions.values()].filter((s) => s.state === "active");
  const completedSessions = [...sessions.values()].filter((s) => s.state === "completed");
  const exceededSessions = [...sessions.values()].filter((s) => s.state === "exceeded");

  const totalTokens = [...sessions.values()].reduce(
    (sum, s) => sum + s.inputTokens + s.outputTokens,
    0,
  );
  const totalCost = [...sessions.values()].reduce((sum, s) => sum + s.estimatedCostUsd, 0);

  return {
    trackedSessions: sessions.size,
    maxTrackedSessions: MAX_TRACKED_SESSIONS,
    active: activeSessions.length,
    completed: completedSessions.length,
    exceeded: exceededSessions.length,
    totalTokensAllSessions: totalTokens,
    totalCostAllSessions: Math.round(totalCost * 10000) / 10000,
  };
}

function listSessions(params?: {
  state?: "active" | "completed" | "exceeded";
  limit?: number;
}): Array<{
  sessionId: string;
  state: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  turnCount: number;
  startedAtMs: number;
  endedAtMs?: number;
}> {
  let list = [...sessions.values()];

  if (params?.state) {
    list = list.filter((s) => s.state === params.state);
  }

  list.sort((a, b) => b.startedAtMs - a.startedAtMs);

  if (params?.limit) {
    list = list.slice(0, params.limit);
  }

  return list.map((s) => ({
    sessionId: s.sessionId,
    state: s.state,
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    estimatedCostUsd: Math.round(s.estimatedCostUsd * 10000) / 10000,
    turnCount: s.turnCount,
    startedAtMs: s.startedAtMs,
    endedAtMs: s.endedAtMs,
  }));
}

// ─── Exported Singleton ─────────────────────────────────────────

export const bootstrapBudget = {
  createSession,
  getSession,
  endSession,
  configForProvider,
  recordTurn,
  canAffordTurn,
  getStats,
  listSessions,
  PROVIDER_COSTS,
  PROVIDER_CONTEXT_WINDOWS,
} as const;
