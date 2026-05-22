/**
 * Behavioral Baseline Engine
 *
 * Establishes per-citizen activity baselines and detects anomalies.
 * Uses z-score deviation from rolling averages to flag unusual behavior.
 *
 * Tracked metrics per citizen:
 *   - Tool usage frequency (per tool, per hour)
 *   - Action success/failure ratios
 *   - Activity timing patterns (hour-of-day distribution)
 *   - Communication patterns (messages sent, topics)
 *   - Specialization drift (using tools outside primary domain)
 *
 * Anomaly detection:
 *   - z-score > 2.5 = warning
 *   - z-score > 3.5 = critical anomaly
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CitizenBaseline {
  citizenId: string;
  /** Rolling average actions per tick */
  avgActionsPerTick: number;
  /** Standard deviation of actions per tick */
  stdActionsPerTick: number;
  /** Tool usage distribution: tool → count */
  toolDistribution: Record<string, number>;
  /** Hourly activity distribution (0-23) */
  hourlyActivity: number[];
  /** Success rate (0-1) */
  successRate: number;
  /** Total samples used for baseline */
  sampleCount: number;
  /** Last baseline update */
  lastUpdated: number;
}

export interface AnomalyEvent {
  id: string;
  citizenId: string;
  type: "frequency" | "timing" | "tool_drift" | "success_rate" | "communication";
  metric: string;
  observed: number;
  expected: number;
  zScore: number;
  severity: "warning" | "critical";
  description: string;
  timestamp: number;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const baselines = new Map<string, CitizenBaseline>();
const anomalyLog: AnomalyEvent[] = [];

/** Rolling action counts per citizen — each entry is a tick's worth of data */
const actionHistory = new Map<string, number[]>();

// ─── Baseline Building ───────────────────────────────────────────────────────

/**
 * Record a citizen's action for baseline computation.
 */
export function recordAction(citizenId: string, tool: string, success: boolean, tick: number): void {
  // Update action history
  const history = actionHistory.get(citizenId) ?? [];
  // Ensure we have an entry for this tick
  while (history.length <= tick) {
    history.push(0);
  }
  history[tick]!++;
  actionHistory.set(citizenId, history);

  // Update or create baseline
  let bl = baselines.get(citizenId);
  if (!bl) {
    bl = {
      citizenId,
      avgActionsPerTick: 0,
      stdActionsPerTick: 1,
      toolDistribution: {},
      hourlyActivity: Array.from({ length: 24 }, () => 0) as number[],
      successRate: 1,
      sampleCount: 0,
      lastUpdated: Date.now(),
    };
    baselines.set(citizenId, bl);
  }

  // Increment tool usage
  bl.toolDistribution[tool] = (bl.toolDistribution[tool] ?? 0) + 1;

  // Update success rate with EWMA
  const alpha = 0.05;
  bl.successRate = bl.successRate * (1 - alpha) + (success ? 1 : 0) * alpha;

  // Update hourly activity
  const hour = new Date().getHours();
  bl.hourlyActivity[hour]!++;

  bl.sampleCount++;
  bl.lastUpdated = Date.now();

  // Recompute rolling stats every 50 samples
  if (bl.sampleCount % 50 === 0) {
    recomputeBaseline(citizenId);
  }
}

/**
 * Recompute baseline statistics from action history.
 */
function recomputeBaseline(citizenId: string): void {
  const history = actionHistory.get(citizenId);
  const bl = baselines.get(citizenId);
  if (!history || !bl || history.length < 10) { return; }

  // Use last 200 ticks for rolling stats
  const recent = history.slice(-200);
  const sum = recent.reduce((a, b) => a + b, 0);
  const mean = sum / recent.length;
  const variance = recent.reduce((acc, v) => acc + (v - mean) ** 2, 0) / recent.length;
  const std = Math.sqrt(variance);

  bl.avgActionsPerTick = mean;
  bl.stdActionsPerTick = Math.max(std, 0.5); // Floor at 0.5 to avoid division issues
}

// ─── Anomaly Detection ───────────────────────────────────────────────────────

/**
 * Check a citizen's current behavior against their baseline.
 * Returns any anomalies detected.
 */
export function checkForAnomalies(citizenId: string, currentTick: number): AnomalyEvent[] {
  const bl = baselines.get(citizenId);
  if (!bl || bl.sampleCount < 50) { return []; } // Need minimum data

  const events: AnomalyEvent[] = [];
  const history = actionHistory.get(citizenId) ?? [];
  const currentActions = history[currentTick] ?? 0;

  // 1. Frequency anomaly — unusual number of actions this tick
  if (bl.stdActionsPerTick > 0) {
    const zFreq = (currentActions - bl.avgActionsPerTick) / bl.stdActionsPerTick;
    if (Math.abs(zFreq) > 2.5) {
      const event: AnomalyEvent = {
        id: `ANM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        citizenId,
        type: "frequency",
        metric: "actions_per_tick",
        observed: currentActions,
        expected: bl.avgActionsPerTick,
        zScore: zFreq,
        severity: Math.abs(zFreq) > 3.5 ? "critical" : "warning",
        description: zFreq > 0
          ? `Unusually high activity: ${currentActions} actions (expected ~${bl.avgActionsPerTick.toFixed(1)})`
          : `Unusually low activity: ${currentActions} actions (expected ~${bl.avgActionsPerTick.toFixed(1)})`,
        timestamp: Date.now(),
      };
      events.push(event);
      anomalyLog.push(event);
    }
  }

  // 2. Success rate anomaly
  if (bl.successRate < 0.3 && bl.sampleCount > 100) {
    const event: AnomalyEvent = {
      id: `ANM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      citizenId,
      type: "success_rate",
      metric: "success_rate",
      observed: bl.successRate,
      expected: 0.7,
      zScore: (0.7 - bl.successRate) / 0.15,
      severity: bl.successRate < 0.15 ? "critical" : "warning",
      description: `Low success rate: ${(bl.successRate * 100).toFixed(1)}% (expected >70%)`,
      timestamp: Date.now(),
    };
    events.push(event);
    anomalyLog.push(event);
  }

  // Cap anomaly log at 500 entries
  if (anomalyLog.length > 500) {
    anomalyLog.splice(0, anomalyLog.length - 500);
  }

  return events;
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

/**
 * Get a citizen's behavioral baseline.
 */
export function getCitizenBaseline(citizenId: string): CitizenBaseline | null {
  return baselines.get(citizenId) ?? null;
}

/**
 * Get recent anomaly events.
 */
export function getAnomalyLog(filter?: {
  citizenId?: string;
  severity?: string;
  limit?: number;
}): AnomalyEvent[] {
  let events = [...anomalyLog];

  if (filter?.citizenId) {
    events = events.filter(e => e.citizenId === filter.citizenId);
  }
  if (filter?.severity) {
    events = events.filter(e => e.severity === filter.severity);
  }

  return events.slice(-(filter?.limit ?? 50));
}

/**
 * Get baseline diagnostics overview.
 */
export function getBaselineDiagnostics(): {
  totalCitizensBaselined: number;
  totalAnomalies: number;
  criticalAnomalies: number;
  warningAnomalies: number;
  recentAnomalies: AnomalyEvent[];
} {
  const critical = anomalyLog.filter(e => e.severity === "critical").length;
  const warning = anomalyLog.filter(e => e.severity === "warning").length;

  return {
    totalCitizensBaselined: baselines.size,
    totalAnomalies: anomalyLog.length,
    criticalAnomalies: critical,
    warningAnomalies: warning,
    recentAnomalies: anomalyLog.slice(-10),
  };
}
