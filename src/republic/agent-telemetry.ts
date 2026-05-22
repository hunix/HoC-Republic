/**
 * Agent Telemetry — Real-time Execution Observability
 *
 * Tracks granular metrics for every agent loop session:
 * - Per-iteration timing, token usage, cost, tool success/failure
 * - Per-tool latency histograms and error rates
 * - Provider reliability and fallback tracking
 * - Session-level summaries with success/failure analysis
 * - Ring buffer of recent sessions for dashboard hydration
 *
 * All operations are O(1) amortized and never block the agent loop.
 */

// ─── Types ──────────────────────────────────────────────────────

export interface ToolTrace {
  name: string;
  startMs: number;
  durationMs: number;
  success: boolean;
  errorMsg?: string;
  outputBytes: number;
}

export interface IterationTrace {
  index: number;
  startMs: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: ToolTrace[];
  provider: string;
  model: string;
  codeActBlocks: number;
}

export interface SessionTrace {
  id: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  provider: string;
  model: string;
  prompt: string;
  success: boolean;
  iterations: IterationTrace[];
  totalTokens: number;
  totalToolCalls: number;
  totalToolErrors: number;
  estimatedCostUsd: number;
  providerFallbacks: string[];
  finalResponseLength: number;
  artifactCount: number;
}

export interface ToolStats {
  totalCalls: number;
  totalErrors: number;
  totalDurationMs: number;
  avgDurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;
  successRate: number;
  recentLatencies: number[];
}

export interface ProviderStats {
  totalCalls: number;
  totalErrors: number;
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  fallbackCount: number;
}

export interface TelemetrySnapshot {
  activeSessions: number;
  totalSessions: number;
  totalIterations: number;
  totalTokens: number;
  totalCostUsd: number;
  totalToolCalls: number;
  totalToolErrors: number;
  avgSessionDurationMs: number;
  avgIterationsPerSession: number;
  successRate: number;
  toolStats: Record<string, ToolStats>;
  providerStats: Record<string, ProviderStats>;
  recentSessions: SessionSummary[];
  uptimeMs: number;
}

export interface SessionSummary {
  id: string;
  startedAt: string;
  durationMs: number;
  provider: string;
  model: string;
  prompt: string;
  success: boolean;
  iterations: number;
  totalTokens: number;
  toolCalls: number;
  estimatedCostUsd: number;
}

// ─── Cost Table ─────────────────────────────────────────────────

const COST_PER_M_TOKENS: Record<string, number> = {
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

// ─── State ──────────────────────────────────────────────────────

const sessions: SessionTrace[] = [];
const activeSessions = new Map<string, SessionTrace>();
const toolStatsMap = new Map<string, ToolStats>();
const providerStatsMap = new Map<string, ProviderStats>();
const MAX_SESSIONS = 200;
const MAX_RECENT_LATENCIES = 50;
const bootTime = Date.now();

// Aggregates
let _totalSessions = 0;
let _totalIterations = 0;
let _totalTokens = 0;
let _totalCostUsd = 0;
let _totalToolCalls = 0;
let _totalToolErrors = 0;
let _successCount = 0;
let _totalDurationMs = 0;

// ─── Session Lifecycle ──────────────────────────────────────────

let sessionCounter = 0;

function genSessionId(): string {
  return `ses-${Date.now().toString(36)}-${(++sessionCounter).toString(36)}`;
}

/** Start tracking a new agent session */
export function startSession(provider: string, model: string, prompt: string): string {
  const id = genSessionId();
  const session: SessionTrace = {
    id,
    startedAt: new Date().toISOString(),
    endedAt: "",
    durationMs: 0,
    provider,
    model,
    prompt: prompt.slice(0, 200),
    success: false,
    iterations: [],
    totalTokens: 0,
    totalToolCalls: 0,
    totalToolErrors: 0,
    estimatedCostUsd: 0,
    providerFallbacks: [],
    finalResponseLength: 0,
    artifactCount: 0,
  };
  activeSessions.set(id, session);
  return id;
}

/** Record a provider fallback event */
export function recordFallback(sessionId: string, fromProvider: string, toProvider: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.providerFallbacks.push(`${fromProvider}→${toProvider}`);
    const ps = getOrCreateProviderStats(fromProvider);
    ps.fallbackCount++;
  }
}

/** Start an iteration within a session */
export function startIteration(
  sessionId: string,
  index: number,
  provider: string,
  model: string,
): IterationTrace {
  const trace: IterationTrace = {
    index,
    startMs: Date.now(),
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    toolCalls: [],
    provider,
    model,
    codeActBlocks: 0,
  };

  const session = activeSessions.get(sessionId);
  if (session) {
    session.iterations.push(trace);
  }
  return trace;
}

/** Complete an iteration with token counts */
export function completeIteration(
  trace: IterationTrace,
  inputTokens: number,
  outputTokens: number,
): void {
  trace.durationMs = Date.now() - trace.startMs;
  trace.inputTokens = inputTokens;
  trace.outputTokens = outputTokens;

  const ps = getOrCreateProviderStats(trace.provider);
  ps.totalCalls++;
  ps.totalTokens += inputTokens + outputTokens;
  ps.totalCostUsd +=
    ((inputTokens + outputTokens) / 1_000_000) * (COST_PER_M_TOKENS[trace.provider] ?? 2.0);
  ps.avgLatencyMs = Math.round(
    (ps.avgLatencyMs * (ps.totalCalls - 1) + trace.durationMs) / ps.totalCalls,
  );

  _totalIterations++;
  _totalTokens += inputTokens + outputTokens;
}

/** Record a tool call within an iteration */
export function recordToolCall(
  trace: IterationTrace,
  name: string,
  durationMs: number,
  success: boolean,
  outputBytes: number,
  errorMsg?: string,
): void {
  trace.toolCalls.push({
    name,
    startMs: Date.now() - durationMs,
    durationMs,
    success,
    errorMsg,
    outputBytes,
  });

  // Update per-tool stats
  const ts = getOrCreateToolStats(name);
  ts.totalCalls++;
  ts.totalDurationMs += durationMs;
  if (!success) {
    ts.totalErrors++;
  }
  ts.avgDurationMs = Math.round(ts.totalDurationMs / ts.totalCalls);
  ts.successRate = (ts.totalCalls - ts.totalErrors) / ts.totalCalls;
  if (durationMs > ts.maxDurationMs) {
    ts.maxDurationMs = durationMs;
  }

  // Track recent latencies for percentile calculation
  ts.recentLatencies.push(durationMs);
  if (ts.recentLatencies.length > MAX_RECENT_LATENCIES) {
    ts.recentLatencies.shift();
  }
  ts.p95DurationMs = calculateP95(ts.recentLatencies);

  _totalToolCalls++;
  if (!success) {
    _totalToolErrors++;
  }
}

/** Complete and archive a session */
export function completeSession(
  sessionId: string,
  success: boolean,
  finalResponseLength: number,
  artifactCount: number,
): void {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return;
  }

  session.endedAt = new Date().toISOString();
  session.durationMs = Date.now() - new Date(session.startedAt).getTime();
  session.success = success;
  session.finalResponseLength = finalResponseLength;
  session.artifactCount = artifactCount;

  // Summarize
  for (const iter of session.iterations) {
    session.totalTokens += iter.inputTokens + iter.outputTokens;
    session.totalToolCalls += iter.toolCalls.length;
    session.totalToolErrors += iter.toolCalls.filter((t) => !t.success).length;
  }
  session.estimatedCostUsd =
    (session.totalTokens / 1_000_000) * (COST_PER_M_TOKENS[session.provider] ?? 2.0);

  // Archive
  activeSessions.delete(sessionId);
  sessions.push(session);
  if (sessions.length > MAX_SESSIONS) {
    sessions.splice(0, sessions.length - MAX_SESSIONS);
  }

  // Update global aggregates
  _totalSessions++;
  _totalCostUsd += session.estimatedCostUsd;
  _totalDurationMs += session.durationMs;
  if (success) {
    _successCount++;
  }
}

// ─── Query ──────────────────────────────────────────────────────

/** Get full telemetry snapshot for the dashboard */
export function getTelemetrySnapshot(): TelemetrySnapshot {
  const toolStats: Record<string, ToolStats> = {};
  for (const [name, stats] of toolStatsMap) {
    toolStats[name] = { ...stats };
  }

  const providerStats: Record<string, ProviderStats> = {};
  for (const [name, stats] of providerStatsMap) {
    providerStats[name] = { ...stats };
  }

  const recentSessions: SessionSummary[] = sessions
    .slice(-20)
    .toReversed()
    .map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      durationMs: s.durationMs,
      provider: s.provider,
      model: s.model,
      prompt: s.prompt,
      success: s.success,
      iterations: s.iterations.length,
      totalTokens: s.totalTokens,
      toolCalls: s.totalToolCalls,
      estimatedCostUsd: s.estimatedCostUsd,
    }));

  return {
    activeSessions: activeSessions.size,
    totalSessions: _totalSessions,
    totalIterations: _totalIterations,
    totalTokens: _totalTokens,
    totalCostUsd: _totalCostUsd,
    totalToolCalls: _totalToolCalls,
    totalToolErrors: _totalToolErrors,
    avgSessionDurationMs: _totalSessions > 0 ? Math.round(_totalDurationMs / _totalSessions) : 0,
    avgIterationsPerSession:
      _totalSessions > 0 ? Math.round((_totalIterations / _totalSessions) * 10) / 10 : 0,
    successRate: _totalSessions > 0 ? _successCount / _totalSessions : 1,
    toolStats,
    providerStats,
    recentSessions,
    uptimeMs: Date.now() - bootTime,
  };
}

/** Get a specific session trace by ID */
export function getSessionTrace(sessionId: string): SessionTrace | null {
  return activeSessions.get(sessionId) ?? sessions.find((s) => s.id === sessionId) ?? null;
}

/** Get the top N slowest tools */
export function getSlowestTools(limit = 10): Array<{ name: string; avgMs: number; p95Ms: number }> {
  return [...toolStatsMap.entries()]
    .filter(([, s]) => s.totalCalls > 0)
    .toSorted((a, b) => b[1].avgDurationMs - a[1].avgDurationMs)
    .slice(0, limit)
    .map(([name, s]) => ({ name, avgMs: s.avgDurationMs, p95Ms: s.p95DurationMs }));
}

/** Get the most error-prone tools */
export function getMostErrorProneTools(
  limit = 10,
): Array<{ name: string; errorRate: number; errors: number }> {
  return [...toolStatsMap.entries()]
    .filter(([, s]) => s.totalCalls >= 3)
    .toSorted((a, b) => 1 - a[1].successRate - (1 - b[1].successRate))
    .toReversed()
    .slice(0, limit)
    .map(([name, s]) => ({
      name,
      errorRate: Math.round((1 - s.successRate) * 100),
      errors: s.totalErrors,
    }));
}

// ─── Compact Learning Data Export/Import ─────────────────────────
// For persisting learned tool/provider stats across gateway restarts.
// This exports only aggregated data (not raw sessions) to keep the
// payload small (~2-5KB typically). Suitable for Redis or SQLite storage.

export interface CompactLearningData {
  exportedAt: string;
  totalSessions: number;
  successCount: number;
  totalIterations: number;
  totalTokens: number;
  totalCostUsd: number;
  toolStats: Array<{
    name: string;
    totalCalls: number;
    totalErrors: number;
    avgDurationMs: number;
    p95DurationMs: number;
    maxDurationMs: number;
    successRate: number;
  }>;
  providerStats: Array<{
    name: string;
    totalCalls: number;
    totalErrors: number;
    totalTokens: number;
    totalCostUsd: number;
    avgLatencyMs: number;
    fallbackCount: number;
  }>;
}

/** Export compact learning data for persistence across restarts */
export function exportCompactLearning(): CompactLearningData {
  return {
    exportedAt: new Date().toISOString(),
    totalSessions: _totalSessions,
    successCount: _successCount,
    totalIterations: _totalIterations,
    totalTokens: _totalTokens,
    totalCostUsd: _totalCostUsd,
    toolStats: [...toolStatsMap.entries()].map(([name, s]) => ({
      name,
      totalCalls: s.totalCalls,
      totalErrors: s.totalErrors,
      avgDurationMs: s.avgDurationMs,
      p95DurationMs: s.p95DurationMs,
      maxDurationMs: s.maxDurationMs,
      successRate: s.successRate,
    })),
    providerStats: [...providerStatsMap.entries()].map(([name, s]) => ({
      name,
      totalCalls: s.totalCalls,
      totalErrors: s.totalErrors,
      totalTokens: s.totalTokens,
      totalCostUsd: s.totalCostUsd,
      avgLatencyMs: s.avgLatencyMs,
      fallbackCount: s.fallbackCount,
    })),
  };
}

/** Import previously exported learning data (additive merge) */
export function importCompactLearning(data: CompactLearningData): void {
  _totalSessions += data.totalSessions;
  _successCount += data.successCount;
  _totalIterations += data.totalIterations;
  _totalTokens += data.totalTokens;
  _totalCostUsd += data.totalCostUsd;

  for (const ts of data.toolStats) {
    const existing = getOrCreateToolStats(ts.name);
    existing.totalCalls += ts.totalCalls;
    existing.totalErrors += ts.totalErrors;
    // Weighted average merge for durations
    const totalCalls = existing.totalCalls;
    if (totalCalls > 0) {
      existing.avgDurationMs = Math.round(
        (existing.avgDurationMs * (totalCalls - ts.totalCalls) + ts.avgDurationMs * ts.totalCalls) /
          totalCalls,
      );
    }
    existing.p95DurationMs = Math.max(existing.p95DurationMs, ts.p95DurationMs);
    existing.maxDurationMs = Math.max(existing.maxDurationMs, ts.maxDurationMs);
    existing.successRate = totalCalls > 0 ? 1 - existing.totalErrors / totalCalls : 1;
  }

  for (const ps of data.providerStats) {
    const existing = getOrCreateProviderStats(ps.name);
    existing.totalCalls += ps.totalCalls;
    existing.totalErrors += ps.totalErrors;
    existing.totalTokens += ps.totalTokens;
    existing.totalCostUsd += ps.totalCostUsd;
    existing.fallbackCount += ps.fallbackCount;
    const totalCalls = existing.totalCalls;
    if (totalCalls > 0) {
      existing.avgLatencyMs = Math.round(
        (existing.avgLatencyMs * (totalCalls - ps.totalCalls) + ps.avgLatencyMs * ps.totalCalls) /
          totalCalls,
      );
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function getOrCreateToolStats(name: string): ToolStats {
  let stats = toolStatsMap.get(name);
  if (!stats) {
    stats = {
      totalCalls: 0,
      totalErrors: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      p95DurationMs: 0,
      maxDurationMs: 0,
      successRate: 1,
      recentLatencies: [],
    };
    toolStatsMap.set(name, stats);
  }
  return stats;
}

function getOrCreateProviderStats(provider: string): ProviderStats {
  let stats = providerStatsMap.get(provider);
  if (!stats) {
    stats = {
      totalCalls: 0,
      totalErrors: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      avgLatencyMs: 0,
      fallbackCount: 0,
    };
    providerStatsMap.set(provider, stats);
  }
  return stats;
}

function calculateP95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].toSorted((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.min(idx, sorted.length - 1)];
}
