/**
 * Republic Platform — Agent Observability & Distributed Tracing
 *
 * Phase 38: OpenTelemetry-inspired observability for AI agents.
 *
 * Tracks citizen decision chains, token/cost consumption, tool usage,
 * and reasoning paths. Detects anomalous agent behavior by comparing
 * current patterns to historical baselines.
 *
 * Research basis:
 * - OpenTelemetry GenAI Semantic Conventions (2024)
 * - Cisco distributed tracing for non-deterministic agents
 * - Agent-specific observability (decision paths, hallucination rates)
 *
 * Key capabilities:
 * 1. Trace spans per citizen action (who → which LLM → which tool → outcome)
 * 2. Cost accumulator per citizen/tick
 * 3. Decision audit log with reasoning snapshots
 * 4. Agent behavior anomaly detection (drift from historical patterns)
 * 5. observabilityTick() — tick loop integration
 */

import { ts, uid } from "./utils.js";

// ─── Trace Span ─────────────────────────────────────────────────

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  citizenId: string;
  /** Operation name */
  operation: string;
  /** Status */
  status: "ok" | "error" | "timeout";
  /** Start tick */
  startTick: number;
  /** End tick */
  endTick?: number;
  /** Duration in ticks */
  durationTicks: number;
  /** Attributes */
  attributes: Record<string, string | number | boolean>;
  /** Events within this span */
  events: SpanEvent[];
  /** Tokens consumed */
  tokensUsed: number;
  /** Credits spent */
  creditsSpent: number;
  /** Which LLM model was used */
  modelId?: string;
  /** Which tool(s) were invoked */
  toolIds: string[];
  /** Timestamp */
  timestamp: string;
}

export interface SpanEvent {
  name: string;
  tick: number;
  attributes?: Record<string, string | number | boolean>;
}

// ─── Decision Audit ─────────────────────────────────────────────

export interface DecisionRecord {
  id: string;
  citizenId: string;
  /** What decision was made */
  decision: string;
  /** Reasoning snapshot (LLM output) */
  reasoning: string;
  /** Inputs that led to the decision */
  inputs: string[];
  /** Confidence score (0.0–1.0) */
  confidence: number;
  /** Outcome observed */
  outcome?: "success" | "failure" | "pending";
  /** Associated trace */
  traceId: string;
  /** Tick */
  tick: number;
  /** Timestamp */
  timestamp: string;
}

// ─── Cost Tracking ──────────────────────────────────────────────

export interface CostBucket {
  citizenId: string;
  /** Tokens consumed this session */
  totalTokens: number;
  /** Credits spent this session */
  totalCredits: number;
  /** Compute milliseconds */
  totalComputeMs: number;
  /** Per-tick token history (last N ticks) */
  tokenHistory: number[];
  /** Per-tick credit history */
  creditHistory: number[];
  /** Average tokens per tick */
  avgTokensPerTick: number;
  /** Last updated */
  updatedAt: string;
}

// ─── Anomaly Detection ──────────────────────────────────────────

export interface BehaviorBaseline {
  citizenId: string;
  /** Average tokens per tick (historical) */
  avgTokens: number;
  /** Std dev of tokens per tick */
  stdDevTokens: number;
  /** Average decisions per tick */
  avgDecisionsPerTick: number;
  /** Average tool invocations per tick */
  avgToolUsagePerTick: number;
  /** Common operations (top 10) */
  commonOperations: string[];
  /** Number of ticks in baseline */
  sampleSize: number;
}

export interface BehaviorAnomaly {
  id: string;
  citizenId: string;
  /** Type of anomaly */
  type:
    | "token_spike"
    | "unusual_operation"
    | "high_error_rate"
    | "cost_spike"
    | "frequency_anomaly";
  /** Severity */
  severity: "low" | "medium" | "high";
  /** Description */
  description: string;
  /** Observed value */
  observedValue: number;
  /** Expected baseline */
  expectedValue: number;
  /** Z-score */
  zScore: number;
  /** Tick */
  tick: number;
  /** Timestamp */
  timestamp: string;
}

// ─── State ──────────────────────────────────────────────────────

const traceStore: TraceSpan[] = [];
const decisionLog: DecisionRecord[] = [];
const costBuckets = new Map<string, CostBucket>();
const baselines = new Map<string, BehaviorBaseline>();
const anomalies: BehaviorAnomaly[] = [];

const MAX_TRACES = 5000;
const MAX_DECISIONS = 2000;
const MAX_ANOMALIES = 500;
const COST_HISTORY_LENGTH = 100;
const ANOMALY_Z_THRESHOLD = 2.5;
const BASELINE_UPDATE_INTERVAL = 100;

// ─── Tracing ────────────────────────────────────────────────────

/** Start a new trace */
export function startTrace(citizenId: string, operation: string, tick: number): TraceSpan {
  const span: TraceSpan = {
    traceId: `trace-${uid().slice(0, 8)}`,
    spanId: `span-${uid().slice(0, 8)}`,
    citizenId,
    operation,
    status: "ok",
    startTick: tick,
    durationTicks: 0,
    attributes: {},
    events: [],
    tokensUsed: 0,
    creditsSpent: 0,
    toolIds: [],
    timestamp: ts(),
  };

  traceStore.push(span);

  // Trim store
  while (traceStore.length > MAX_TRACES) {
    traceStore.shift();
  }

  return span;
}

/** Create a child span within a trace */
export function createChildSpan(parent: TraceSpan, operation: string, tick: number): TraceSpan {
  const child: TraceSpan = {
    traceId: parent.traceId,
    spanId: `span-${uid().slice(0, 8)}`,
    parentSpanId: parent.spanId,
    citizenId: parent.citizenId,
    operation,
    status: "ok",
    startTick: tick,
    durationTicks: 0,
    attributes: {},
    events: [],
    tokensUsed: 0,
    creditsSpent: 0,
    toolIds: [],
    timestamp: ts(),
  };

  traceStore.push(child);
  return child;
}

/** End a span */
export function endSpan(
  span: TraceSpan,
  tick: number,
  opts?: {
    status?: TraceSpan["status"];
    tokensUsed?: number;
    creditsSpent?: number;
    modelId?: string;
  },
): void {
  span.endTick = tick;
  span.durationTicks = tick - span.startTick;
  if (opts?.status) {
    span.status = opts.status;
  }
  if (opts?.tokensUsed) {
    span.tokensUsed = opts.tokensUsed;
    updateCostBucket(span.citizenId, opts.tokensUsed, opts.creditsSpent ?? 0);
  }
  if (opts?.creditsSpent) {
    span.creditsSpent = opts.creditsSpent;
  }
  if (opts?.modelId) {
    span.modelId = opts.modelId;
  }
}

/** Add an event to a span */
export function addSpanEvent(
  span: TraceSpan,
  name: string,
  tick: number,
  attributes?: SpanEvent["attributes"],
): void {
  span.events.push({ name, tick, attributes });
}

/** Record a tool usage in a span */
export function recordToolUsage(span: TraceSpan, toolId: string): void {
  if (!span.toolIds.includes(toolId)) {
    span.toolIds.push(toolId);
  }
}

/** Get recent traces */
export function getRecentTraces(limit = 100): TraceSpan[] {
  return traceStore.slice(-limit);
}

/** Get traces for a specific citizen */
export function getCitizenTraces(citizenId: string, limit = 50): TraceSpan[] {
  return traceStore.filter((t) => t.citizenId === citizenId).slice(-limit);
}

// ─── Decision Audit ─────────────────────────────────────────────

/** Record a citizen's decision for auditing */
export function recordDecision(
  citizenId: string,
  decision: string,
  reasoning: string,
  inputs: string[],
  opts?: { confidence?: number; traceId?: string; tick?: number },
): DecisionRecord {
  const record: DecisionRecord = {
    id: `dec-${uid().slice(0, 8)}`,
    citizenId,
    decision,
    reasoning: reasoning.slice(0, 500), // Cap reasoning length
    inputs,
    confidence: opts?.confidence ?? 0.5,
    outcome: "pending",
    traceId: opts?.traceId ?? "unknown",
    tick: opts?.tick ?? 0,
    timestamp: ts(),
  };

  decisionLog.push(record);
  while (decisionLog.length > MAX_DECISIONS) {
    decisionLog.shift();
  }

  return record;
}

/** Update decision outcome */
export function updateDecisionOutcome(
  decisionId: string,
  outcome: DecisionRecord["outcome"],
): boolean {
  const record = decisionLog.find((d) => d.id === decisionId);
  if (!record) {
    return false;
  }
  record.outcome = outcome;
  return true;
}

/** Get decision log for a citizen */
export function getCitizenDecisions(citizenId: string, limit = 20): DecisionRecord[] {
  return decisionLog.filter((d) => d.citizenId === citizenId).slice(-limit);
}

// ─── Cost Tracking ──────────────────────────────────────────────

function getCostBucket(citizenId: string): CostBucket {
  let bucket = costBuckets.get(citizenId);
  if (!bucket) {
    bucket = {
      citizenId,
      totalTokens: 0,
      totalCredits: 0,
      totalComputeMs: 0,
      tokenHistory: [],
      creditHistory: [],
      avgTokensPerTick: 0,
      updatedAt: ts(),
    };
    costBuckets.set(citizenId, bucket);
  }
  return bucket;
}

export function updateCostBucket(citizenId: string, tokens: number, credits: number): void {
  const bucket = getCostBucket(citizenId);
  bucket.totalTokens += tokens;
  bucket.totalCredits += credits;

  bucket.tokenHistory.push(tokens);
  bucket.creditHistory.push(credits);

  while (bucket.tokenHistory.length > COST_HISTORY_LENGTH) {
    bucket.tokenHistory.shift();
  }
  while (bucket.creditHistory.length > COST_HISTORY_LENGTH) {
    bucket.creditHistory.shift();
  }

  bucket.avgTokensPerTick =
    bucket.tokenHistory.length > 0
      ? bucket.tokenHistory.reduce((a, b) => a + b, 0) / bucket.tokenHistory.length
      : 0;

  bucket.updatedAt = ts();
}

/** Get cost summary for a citizen */
export function getCostSummary(citizenId: string): CostBucket {
  return getCostBucket(citizenId);
}

// ─── Anomaly Detection ──────────────────────────────────────────

/** Compute standard deviation */
function stdDev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Update baseline for a citizen from recent traces */
function updateBaseline(citizenId: string, currentTick: number): void {
  const recentTraces = traceStore.filter(
    (t) => t.citizenId === citizenId && t.endTick && t.startTick > currentTick - 500,
  );

  if (recentTraces.length < 10) {
    return; // Not enough data for baseline
  }

  const tokenValues = recentTraces.map((t) => t.tokensUsed);
  const operations = recentTraces.map((t) => t.operation);

  // Count operation frequency
  const opCounts = new Map<string, number>();
  for (const op of operations) {
    opCounts.set(op, (opCounts.get(op) ?? 0) + 1);
  }

  const commonOps = [...opCounts.entries()]
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([op]) => op);

  baselines.set(citizenId, {
    citizenId,
    avgTokens: tokenValues.reduce((a, b) => a + b, 0) / tokenValues.length,
    stdDevTokens: stdDev(tokenValues),
    avgDecisionsPerTick:
      decisionLog.filter((d) => d.citizenId === citizenId && d.tick > currentTick - 500).length /
      500,
    avgToolUsagePerTick:
      recentTraces.filter((t) => t.toolIds.length > 0).length / recentTraces.length,
    commonOperations: commonOps,
    sampleSize: recentTraces.length,
  });
}

/** Check for anomalies in a citizen's recent behavior */
function detectAnomalies(citizenId: string, currentTick: number): void {
  const baseline = baselines.get(citizenId);
  if (!baseline || baseline.sampleSize < 10) {
    return;
  }

  const recentTraces = traceStore.filter(
    (t) => t.citizenId === citizenId && t.startTick > currentTick - 10,
  );

  if (recentTraces.length === 0) {
    return;
  }

  // Check token usage spike
  const recentTokens = recentTraces.reduce((sum, t) => sum + t.tokensUsed, 0);
  if (baseline.stdDevTokens > 0) {
    const zScore =
      (recentTokens - baseline.avgTokens * recentTraces.length) /
      (baseline.stdDevTokens * Math.sqrt(recentTraces.length));

    if (Math.abs(zScore) > ANOMALY_Z_THRESHOLD) {
      recordAnomaly(
        citizenId,
        "token_spike",
        zScore,
        recentTokens,
        baseline.avgTokens * recentTraces.length,
        `Token usage ${zScore > 0 ? "spike" : "drop"}: ${recentTokens} tokens in ${recentTraces.length} actions`,
        currentTick,
      );
    }
  }

  // Check for unusual operations
  for (const trace of recentTraces) {
    if (!baseline.commonOperations.includes(trace.operation)) {
      recordAnomaly(
        citizenId,
        "unusual_operation",
        1,
        0,
        0,
        `Unusual operation: "${trace.operation}" not in historical patterns`,
        currentTick,
      );
    }
  }

  // Check error rate
  const errors = recentTraces.filter((t) => t.status === "error").length;
  const errorRate = errors / recentTraces.length;
  if (errorRate > 0.5 && recentTraces.length >= 3) {
    recordAnomaly(
      citizenId,
      "high_error_rate",
      errorRate * 3,
      errorRate,
      0.1,
      `High error rate: ${(errorRate * 100).toFixed(0)}% of recent actions failed`,
      currentTick,
    );
  }
}

function recordAnomaly(
  citizenId: string,
  type: BehaviorAnomaly["type"],
  zScore: number,
  observedValue: number,
  expectedValue: number,
  description: string,
  tick: number,
): void {
  const severity: BehaviorAnomaly["severity"] =
    Math.abs(zScore) > 4 ? "high" : Math.abs(zScore) > 3 ? "medium" : "low";

  anomalies.push({
    id: `anom-${uid().slice(0, 8)}`,
    citizenId,
    type,
    severity,
    description,
    observedValue,
    expectedValue,
    zScore,
    tick,
    timestamp: ts(),
  });

  while (anomalies.length > MAX_ANOMALIES) {
    anomalies.shift();
  }
}

/** Get recent anomalies */
export function getRecentAnomalies(limit = 50): BehaviorAnomaly[] {
  return anomalies.slice(-limit);
}

/** Get anomalies for a specific citizen */
export function getCitizenAnomalies(citizenId: string, limit = 20): BehaviorAnomaly[] {
  return anomalies.filter((a) => a.citizenId === citizenId).slice(-limit);
}

// ─── Tick Integration ───────────────────────────────────────────

export interface ObservabilityTickResult {
  totalTraces: number;
  totalDecisions: number;
  anomaliesDetected: number;
  baselinesUpdated: boolean;
}

/**
 * Per-tick maintenance for observability.
 *
 * - Updates baselines periodically
 * - Runs anomaly detection for active citizens
 */
export function observabilityTick(
  citizenIds: string[],
  currentTick: number,
): ObservabilityTickResult {
  const baselinesUpdated = currentTick > 0 && currentTick % BASELINE_UPDATE_INTERVAL === 0;

  if (baselinesUpdated) {
    for (const cid of citizenIds) {
      updateBaseline(cid, currentTick);
    }
  }

  // Run anomaly detection every 10 ticks
  let anomaliesDetected = 0;
  if (currentTick > 0 && currentTick % 10 === 0) {
    const before = anomalies.length;
    for (const cid of citizenIds) {
      detectAnomalies(cid, currentTick);
    }
    anomaliesDetected = anomalies.length - before;
  }

  return {
    totalTraces: traceStore.length,
    totalDecisions: decisionLog.length,
    anomaliesDetected,
    baselinesUpdated,
  };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function observabilityDiagnostics() {
  return {
    totalTraces: traceStore.length,
    totalDecisions: decisionLog.length,
    trackedCitizens: costBuckets.size,
    baselinesComputed: baselines.size,
    totalAnomalies: anomalies.length,
    recentAnomalies: anomalies.slice(-5).map((a) => ({
      citizen: a.citizenId,
      type: a.type,
      severity: a.severity,
      description: a.description.slice(0, 80),
    })),
  };
}

/** Reset observability state (for testing) */
export function resetObservabilityState(): void {
  traceStore.length = 0;
  decisionLog.length = 0;
  costBuckets.clear();
  baselines.clear();
  anomalies.length = 0;
}
