/**
 * Republic Platform — Tool Analytics
 *
 * Per-tool success/failure tracking with EWMA-smoothed success rates.
 * Tracks per-citizen, per-specialization, and global tool performance.
 *
 * Used by:
 * - Agent runtime to record outcomes after tool execution
 * - ReAct loop to recommend tools based on past success
 * - Observability dashboard for tool performance monitoring
 * - Behavior drift detection (tool success rate regression)
 */

import { uid, ts } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface ToolOutcome {
  id: string;
  citizenId: string;
  toolName: string;
  specialization: string;
  success: boolean;
  latencyMs: number;
  tick: number;
  timestamp: string;
}

export interface ToolStats {
  toolName: string;
  totalCalls: number;
  successRate: number;      // EWMA-smoothed 0-1
  avgLatencyMs: number;     // EWMA-smoothed
  recentFailures: number;   // failures in last 50 calls
  topUsers: string[];       // citizenIds who use this tool most
  lastUsedAt: string;
}

export interface CitizenToolProfile {
  toolName: string;
  calls: number;
  successRate: number;
  avgLatencyMs: number;
}

// ─── State ──────────────────────────────────────────────────────

interface ToolAccumulator {
  totalCalls: number;
  successRate: number;        // EWMA-smoothed
  avgLatencyMs: number;       // EWMA-smoothed
  recentOutcomes: boolean[];  // rolling window last 50
  perCitizen: Map<string, { calls: number; successes: number; totalLatency: number }>;
  lastUsedAt: string;
}

const toolStats = new Map<string, ToolAccumulator>();
const outcomeLog: ToolOutcome[] = [];

const MAX_OUTCOME_LOG = 10_000;
const ROLLING_WINDOW = 50;
const EWMA_ALPHA = 0.15;

// ─── Public API ─────────────────────────────────────────────────

/**
 * Record the outcome of a tool execution.
 * Called by agent-runtime after each tool.execute().
 */
export function recordToolOutcome(
  citizenId: string,
  toolName: string,
  specialization: string,
  success: boolean,
  latencyMs: number,
  tick: number,
): void {
  // Global outcome log (ring buffer)
  const outcome: ToolOutcome = {
    id: uid(),
    citizenId,
    toolName,
    specialization,
    success,
    latencyMs,
    tick,
    timestamp: ts(),
  };
  outcomeLog.push(outcome);
  if (outcomeLog.length > MAX_OUTCOME_LOG) {
    outcomeLog.splice(0, outcomeLog.length - MAX_OUTCOME_LOG);
  }

  // Per-tool accumulator
  let acc = toolStats.get(toolName);
  if (!acc) {
    acc = {
      totalCalls: 0,
      successRate: 0.5, // start neutral
      avgLatencyMs: latencyMs,
      recentOutcomes: [],
      perCitizen: new Map(),
      lastUsedAt: ts(),
    };
    toolStats.set(toolName, acc);
  }

  acc.totalCalls++;
  acc.lastUsedAt = ts();

  // EWMA success rate
  const signal = success ? 1 : 0;
  acc.successRate = acc.successRate * (1 - EWMA_ALPHA) + signal * EWMA_ALPHA;

  // EWMA latency
  acc.avgLatencyMs = acc.avgLatencyMs * (1 - EWMA_ALPHA) + latencyMs * EWMA_ALPHA;

  // Rolling window
  acc.recentOutcomes.push(success);
  if (acc.recentOutcomes.length > ROLLING_WINDOW) {
    acc.recentOutcomes.shift();
  }

  // Per-citizen stats
  let citizen = acc.perCitizen.get(citizenId);
  if (!citizen) {
    citizen = { calls: 0, successes: 0, totalLatency: 0 };
    acc.perCitizen.set(citizenId, citizen);
  }
  citizen.calls++;
  if (success) { citizen.successes++; }
  citizen.totalLatency += latencyMs;
}

/**
 * Get aggregated stats for a specific tool.
 */
export function getToolStats(toolName: string): ToolStats | null {
  const acc = toolStats.get(toolName);
  if (!acc) { return null; }

  const recentFailures = acc.recentOutcomes.filter(o => !o).length;

  // Top 5 users by call count
  const topUsers = [...acc.perCitizen.entries()]
    .toSorted((a, b) => b[1].calls - a[1].calls)
    .slice(0, 5)
    .map(([id]) => id);

  return {
    toolName,
    totalCalls: acc.totalCalls,
    successRate: Math.round(acc.successRate * 100) / 100,
    avgLatencyMs: Math.round(acc.avgLatencyMs),
    recentFailures,
    topUsers,
    lastUsedAt: acc.lastUsedAt,
  };
}

/**
 * Get stats for all tracked tools, sorted by call count.
 */
export function getAllToolStats(): ToolStats[] {
  const result: ToolStats[] = [];
  for (const toolName of toolStats.keys()) {
    const stats = getToolStats(toolName);
    if (stats) { result.push(stats); }
  }
  return result.toSorted((a, b) => b.totalCalls - a.totalCalls);
}

/**
 * Get a citizen's tool usage profile.
 */
export function getCitizenToolProfile(citizenId: string): CitizenToolProfile[] {
  const profiles: CitizenToolProfile[] = [];

  for (const [toolName, acc] of toolStats) {
    const citizen = acc.perCitizen.get(citizenId);
    if (!citizen || citizen.calls === 0) { continue; }

    profiles.push({
      toolName,
      calls: citizen.calls,
      successRate: Math.round((citizen.successes / citizen.calls) * 100) / 100,
      avgLatencyMs: Math.round(citizen.totalLatency / citizen.calls),
    });
  }

  return profiles.toSorted((a, b) => b.calls - a.calls);
}

/**
 * Get tools with the lowest success rates (bottom N).
 * Useful for identifying tools that need improvement.
 */
export function getWeakestTools(limit = 10): ToolStats[] {
  return getAllToolStats()
    .filter(s => s.totalCalls >= 5) // minimum sample size
    .toSorted((a, b) => a.successRate - b.successRate)
    .slice(0, limit);
}

/**
 * Get tool recommendation based on past success for a specialization.
 * Returns tools sorted by success rate for the given specialization.
 */
export function getToolRecommendations(specialization: string, limit = 5): ToolStats[] {
  // Filter outcomes for this specialization
  const specOutcomes = outcomeLog.filter(o => o.specialization === specialization);
  if (specOutcomes.length === 0) { return getAllToolStats().slice(0, limit); }

  // Aggregate by tool
  const specStats = new Map<string, { calls: number; successes: number }>();
  for (const o of specOutcomes) {
    const s = specStats.get(o.toolName) ?? { calls: 0, successes: 0 };
    s.calls++;
    if (o.success) { s.successes++; }
    specStats.set(o.toolName, s);
  }

  // Merge with global stats
  return [...specStats.entries()]
    .filter(([, s]) => s.calls >= 3)
    .toSorted((a, b) => (b[1].successes / b[1].calls) - (a[1].successes / a[1].calls))
    .slice(0, limit)
    .map(([toolName]) => getToolStats(toolName)!)
    .filter(Boolean);
}

/**
 * Diagnostics summary.
 */
export function toolAnalyticsDiagnostics() {
  const allStats = getAllToolStats();
  const avgSuccess = allStats.length > 0
    ? allStats.reduce((s, t) => s + t.successRate, 0) / allStats.length
    : 0;

  return {
    trackedTools: toolStats.size,
    totalOutcomes: outcomeLog.length,
    avgSuccessRate: Math.round(avgSuccess * 100) / 100,
    weakestTools: getWeakestTools(3).map(t => ({
      tool: t.toolName,
      successRate: t.successRate,
      calls: t.totalCalls,
    })),
  };
}
