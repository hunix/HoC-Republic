/**
 * hallucination-tracker.ts — Hallucination Telemetry & Analytics
 *
 * Centralizes hallucination detection events from all subsystems:
 *   - output-verifier.ts (5-check pipeline)
 *   - prompt-builder.ts (tool validation, grounding check)
 *   - citizen-agent-loop.ts (tool hallucination detection)
 *   - agentic-rag.ts (faithfulness scoring)
 *
 * Provides:
 *   - Per-citizen hallucination rates
 *   - Per-model hallucination rates
 *   - Category breakdown (tool/factual/self-contradiction/unsupported)
 *   - Time-series data for trending
 *   - RPC-compatible summary for dashboard
 */

import type { HallucinationType } from "./agents/output-verifier.js";
import { getVerifierStats } from "./agents/output-verifier.js";
import { getToonStats } from "./toon-serializer.js";

// ─── Types ──────────────────────────────────────────────────────

export interface HallucinationRecord {
  id: string;
  timestamp: number;
  citizenId: string;
  citizenName: string;
  modelId: string;
  type: HallucinationType;
  severity: "low" | "medium" | "high" | "critical";
  detail: string;
  /** Was the output ultimately approved despite this hallucination? */
  approved: boolean;
}

export interface HallucinationSummary {
  totalEvents: number;
  last24h: number;
  last1h: number;
  byType: Record<HallucinationType, number>;
  bySeverity: Record<string, number>;
  byModel: Array<{ modelId: string; count: number; rate: number }>;
  byCitizen: Array<{ citizenId: string; citizenName: string; count: number }>;
  topOffenders: HallucinationRecord[];
  /** Output verifier stats */
  verifierStats: ReturnType<typeof getVerifierStats>;
  /** TOON serializer stats */
  toonStats: ReturnType<typeof getToonStats>;
  /** Prompt optimizer variant stats (lazy-imported) */
  promptVariants: unknown[];
}

// ─── Ring Buffer Storage ────────────────────────────────────────

const MAX_RECORDS = 500;
const _records: HallucinationRecord[] = [];

function recordId(): string {
  return `hal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

// ─── Record Hallucination ───────────────────────────────────────

/**
 * Record a hallucination event from any subsystem.
 *
 * Call this from:
 *   - output-verifier when hallucinations are detected
 *   - citizen-agent-loop when tool hallucination is caught
 *   - agentic-rag when faithfulness drops below threshold
 */
export function recordHallucination(
  citizenId: string,
  citizenName: string,
  modelId: string,
  type: HallucinationType,
  severity: "low" | "medium" | "high" | "critical",
  detail: string,
  approved: boolean,
): void {
  const record: HallucinationRecord = {
    id: recordId(),
    timestamp: Date.now(),
    citizenId,
    citizenName,
    modelId,
    type,
    severity,
    detail,
    approved,
  };

  _records.push(record);

  // Ring buffer: evict oldest when full
  if (_records.length > MAX_RECORDS) {
    _records.splice(0, _records.length - MAX_RECORDS);
  }
}

// ─── Summary / Diagnostics ──────────────────────────────────────

/**
 * Build a summary of hallucination events for the dashboard.
 */
export function getHallucinationSummary(): HallucinationSummary {
  const now = Date.now();
  const h24 = now - 86_400_000;
  const h1 = now - 3_600_000;

  const byType: Record<HallucinationType, number> = {
    tool_hallucination: 0,
    factual_contradiction: 0,
    self_contradiction: 0,
    unsupported_claim: 0,
    format_violation: 0,
    confidence_below_threshold: 0,
  };

  const bySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const modelCounts = new Map<string, { count: number; total: number }>();
  const citizenCounts = new Map<string, { name: string; count: number }>();

  let last24h = 0;
  let last1h = 0;

  for (const r of _records) {
    byType[r.type] = (byType[r.type] ?? 0) + 1;
    bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;

    if (r.timestamp >= h24) { last24h++; }
    if (r.timestamp >= h1) { last1h++; }

    const mc = modelCounts.get(r.modelId) ?? { count: 0, total: 0 };
    mc.count++;
    mc.total++;
    modelCounts.set(r.modelId, mc);

    const cc = citizenCounts.get(r.citizenId) ?? { name: r.citizenName, count: 0 };
    cc.count++;
    citizenCounts.set(r.citizenId, cc);
  }

  const byModel = Array.from(modelCounts.entries())
    .map(([modelId, stats]) => ({
      modelId,
      count: stats.count,
      rate: stats.total > 0 ? stats.count / stats.total : 0,
    }))
    .toSorted((a, b) => b.count - a.count)
    .slice(0, 10);

  const byCitizen = Array.from(citizenCounts.entries())
    .map(([citizenId, stats]) => ({
      citizenId,
      citizenName: stats.name,
      count: stats.count,
    }))
    .toSorted((a, b) => b.count - a.count)
    .slice(0, 10);

  const topOffenders = _records
    .filter(r => r.severity === "critical" || r.severity === "high")
    .slice(-10)
    .toReversed();

  // Lazy import prompt optimizer stats
  let promptVariants: unknown[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const optimizer = require("./agents/prompt-optimizer.js") as { getVariantStats: () => unknown[] };
    promptVariants = optimizer.getVariantStats();
  } catch {
    // Optimizer not available
  }

  return {
    totalEvents: _records.length,
    last24h,
    last1h,
    byType,
    bySeverity,
    byModel,
    byCitizen,
    topOffenders,
    verifierStats: getVerifierStats(),
    toonStats: getToonStats(),
    promptVariants,
  };
}

/**
 * Get recent hallucination records for drill-down.
 */
export function getRecentHallucinations(
  limit = 50,
  filter?: { citizenId?: string; modelId?: string; type?: HallucinationType },
): HallucinationRecord[] {
  let filtered = _records;

  if (filter?.citizenId) {
    filtered = filtered.filter(r => r.citizenId === filter.citizenId);
  }
  if (filter?.modelId) {
    filtered = filtered.filter(r => r.modelId === filter.modelId);
  }
  if (filter?.type) {
    filtered = filtered.filter(r => r.type === filter.type);
  }

  return filtered.slice(-limit).toReversed();
}

/**
 * Clear all hallucination records.
 */
export function clearHallucinationRecords(): void {
  _records.length = 0;
}
