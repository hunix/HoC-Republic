/**
 * Republic Platform — Metrics Engine
 *
 * Real-time performance metrics for the simulation engine.
 * Tracks tick latency percentiles, citizens processed per second,
 * event queue depth, cache hit rates, and genome pool health.
 *
 * Exposed via:
 *   - `republic.metrics` RPC handler (gateway)
 *   - Intelligence Bus event: "metrics:snapshot"
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("republic:metrics");

// ─── Types ─────────────────────────────────────────────────────────

export interface TickMetrics {
  tickNumber: number;
  durationMs: number;
  citizensProcessed: number;
  eventsQueued: number;
  cacheHitRate: number; // 0–1
  ts: number;
}

export interface MetricsSnapshot {
  /** Rolling window percentiles of tick duration (ms) */
  tickLatency: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
    last: number;
  };
  /** Citizens processed per second (rolling average) */
  citizensPerSecond: number;
  /** Current event queue depth */
  eventQueueDepth: number;
  /** Citizen LRU pager cache hit rate (0–1) */
  cacheHitRate: number;
  /** Active citizen count by tier */
  citizenTiers: { elite: number; active: number; dormant: number };
  /** Genome pool health */
  genomePool: { size: number; avgFitness: number; bestFitness: number };
  /** Republic economy summary */
  economy: { treasuryBalance: number; giniCoefficient: number };
  /** System resources */
  system: { heapUsedMB: number; rssUsedMB: number; cpuPercent: number };
  /** Snapshot timestamp */
  ts: number;
  /** Total ticks since startup */
  totalTicks: number;
}

// ─── Rolling Buffer ─────────────────────────────────────────────────

const MAX_SAMPLES = 500;
const tickSamples: TickMetrics[] = [];

// ─── Record ────────────────────────────────────────────────────────

/**
 * Record a completed tick's metrics. Called by the republic tick loop.
 */
export function recordTick(metrics: TickMetrics): void {
  tickSamples.push(metrics);
  if (tickSamples.length > MAX_SAMPLES) {
    tickSamples.splice(0, tickSamples.length - MAX_SAMPLES);
  }
}

// ─── Percentile ────────────────────────────────────────────────────

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ─── Snapshot Builder ──────────────────────────────────────────────

export interface MetricsInput {
  eventQueueDepth?: number;
  cacheHitRate?: number;
  citizenTiers?: { elite: number; active: number; dormant: number };
  genomePool?: { size: number; avgFitness: number; bestFitness: number };
  economy?: { treasuryBalance: number; giniCoefficient: number };
  totalTicks?: number;
  cpuPercent?: number;
}

/**
 * Build a full MetricsSnapshot from the rolling tick buffer + optional live state.
 */
export function buildSnapshot(input: MetricsInput = {}): MetricsSnapshot {
  const durations = tickSamples.map((t) => t.durationMs).toSorted((a, b) => a - b);
  const avg = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const last = tickSamples.at(-1)?.durationMs ?? 0;

  // Citizens/sec: sum citizens over last 10 ticks duration
  const last10 = tickSamples.slice(-10);
  const totalCitizens = last10.reduce((s, t) => s + t.citizensProcessed, 0);
  const totalMs = last10.reduce((s, t) => s + t.durationMs, 0);
  const citizensPerSecond = totalMs > 0 ? (totalCitizens / totalMs) * 1000 : 0;

  const avgCacheHit =
    last10.length > 0
      ? last10.reduce((s, t) => s + t.cacheHitRate, 0) / last10.length
      : (input.cacheHitRate ?? 0);

  const mem = process.memoryUsage();

  const snapshot: MetricsSnapshot = {
    tickLatency: {
      p50: pct(durations, 50),
      p95: pct(durations, 95),
      p99: pct(durations, 99),
      avg: parseFloat(avg.toFixed(1)),
      last: parseFloat(last.toFixed(1)),
    },
    citizensPerSecond: parseFloat(citizensPerSecond.toFixed(1)),
    eventQueueDepth: input.eventQueueDepth ?? 0,
    cacheHitRate: parseFloat(avgCacheHit.toFixed(3)),
    citizenTiers: input.citizenTiers ?? { elite: 0, active: 0, dormant: 0 },
    genomePool: input.genomePool ?? { size: 0, avgFitness: 0, bestFitness: 0 },
    economy: input.economy ?? { treasuryBalance: 0, giniCoefficient: 0 },
    system: {
      heapUsedMB: parseFloat((mem.heapUsed / 1024 / 1024).toFixed(1)),
      rssUsedMB: parseFloat((mem.rss / 1024 / 1024).toFixed(1)),
      cpuPercent: input.cpuPercent ?? 0,
    },
    ts: Date.now(),
    totalTicks: input.totalTicks ?? tickSamples.length,
  };

  return snapshot;
}

// ─── Gini Coefficient ──────────────────────────────────────────────

/**
 * Compute the Gini coefficient of wealth distribution.
 * 0 = perfectly equal, 1 = one citizen holds all wealth.
 */
export function computeGini(wealths: number[]): number {
  if (wealths.length === 0) {
    return 0;
  }
  const sorted = [...wealths].toSorted((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    return 0;
  }
  let numerator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return parseFloat((numerator / (n * sum)).toFixed(4));
}

// ─── Health Score ──────────────────────────────────────────────────

/**
 * Derive a 0–100 health score from a snapshot.
 * Used by the UI dashboard.
 */
export function computeHealthScore(snap: MetricsSnapshot): number {
  let score = 100;

  // Penalise slow ticks
  if (snap.tickLatency.p95 > 2000) {
    score -= 20;
  } else if (snap.tickLatency.p95 > 1000) {
    score -= 10;
  }

  // Penalise poor cache performance
  if (snap.cacheHitRate < 0.5) {
    score -= 10;
  }

  // Penalise high memory
  if (snap.system.heapUsedMB > 2048) {
    score -= 15;
  } else if (snap.system.heapUsedMB > 1024) {
    score -= 5;
  }

  // Penalise economic inequality
  if (snap.economy.giniCoefficient > 0.6) {
    score -= 15;
  } else if (snap.economy.giniCoefficient > 0.4) {
    score -= 5;
  }

  // Penalise high CPU
  if (snap.system.cpuPercent > 90) {
    score -= 20;
  } else if (snap.system.cpuPercent > 75) {
    score -= 10;
  }

  return Math.max(0, score);
}

logger.debug("Republic metrics engine initialised");
