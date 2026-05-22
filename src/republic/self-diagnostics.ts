/**
 * Republic Platform — Self-Diagnostics & Healing Loop
 *
 * Phase 22: Full system health scanning, fault diagnosis, prescription,
 * and autonomous healing.
 *
 * Implements a biological immune system metaphor:
 *   - Scan: detect anomalies across all subsystems
 *   - Diagnose: classify root causes
 *   - Prescribe: generate healing actions
 *   - Heal: execute corrective measures
 *   - Monitor: continuous watchdog
 */

import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type HealthLevel = "healthy" | "degraded" | "critical" | "failing";
export type SubsystemName = "git" | "cicd" | "codeIntel" | "governance" | "network" | "memory" | "storage" | "compute";
export type HealingStrategy = "restart" | "rollback" | "patch" | "scale" | "quarantine" | "migrate" | "notify";

export interface SubsystemHealth {
  name: SubsystemName;
  status: HealthLevel;
  score: number;               // 0-100
  metrics: Record<string, number>;
  lastChecked: string;
  anomalies: Anomaly[];
}

export interface Anomaly {
  id: string;
  subsystem: SubsystemName;
  type: "performance" | "error" | "resource" | "availability" | "security";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  metric?: string;
  value?: number;
  threshold?: number;
  detectedAt: string;
}

export interface Diagnosis {
  id: string;
  anomalies: Anomaly[];
  rootCause: string;
  confidence: number;            // 0-1
  affectedSubsystems: SubsystemName[];
  cascadeRisk: number;           // 0-1 risk of cascading failure
  severity: "low" | "medium" | "high" | "critical";
}

export interface Prescription {
  id: string;
  diagnosisId: string;
  strategy: HealingStrategy;
  actions: HealingAction[];
  priority: number;              // 1-10
  estimatedHealingTime: string;
  requiresApproval: boolean;
  risk: number;                  // 0-1
}

export interface HealingAction {
  order: number;
  action: string;
  target: string;
  params: Record<string, unknown>;
  rollbackAction?: string;
}

export interface HealingResult {
  prescriptionId: string;
  success: boolean;
  actionsExecuted: number;
  actionsTotal: number;
  healingDurationMs: number;
  postHealScore: number;
  notes: string[];
}

export interface SystemSnapshot {
  id: string;
  timestamp: string;
  overallHealth: HealthLevel;
  overallScore: number;
  subsystems: SubsystemHealth[];
  activeDiagnoses: number;
  healingInProgress: boolean;
}

export interface SelfDiagnosticsSummary {
  totalScans: number;
  totalDiagnoses: number;
  totalHealingActions: number;
  healingSuccessRate: number;
  currentHealth: HealthLevel;
  currentScore: number;
  recentSnapshots: SystemSnapshot[];
}

// ─── State ──────────────────────────────────────────────────────

const diagnoses = new Map<string, Diagnosis>();
const prescriptions = new Map<string, Prescription>();
const healingHistory: HealingResult[] = [];
const snapshots: SystemSnapshot[] = [];
let scanCount = 0;

// ─── Subsystem Health Simulation ────────────────────────────────

function generateSubsystemHealth(name: SubsystemName, overrideScore?: number): SubsystemHealth {
  const score = overrideScore ?? Math.round(70 + Math.random() * 30);
  const anomalies: Anomaly[] = [];

  // Generate anomalies based on score
  if (score < 60) {
    anomalies.push({
      id: `anomaly-${uid().slice(0, 6)}`,
      subsystem: name,
      type: "performance",
      severity: "high",
      description: `${name} subsystem performance severely degraded`,
      detectedAt: ts(),
    });
  } else if (score < 80) {
    anomalies.push({
      id: `anomaly-${uid().slice(0, 6)}`,
      subsystem: name,
      type: "resource",
      severity: "medium",
      description: `${name} subsystem resource usage elevated`,
      detectedAt: ts(),
    });
  }

  return {
    name,
    status: score >= 90 ? "healthy" : score >= 70 ? "degraded" : score >= 50 ? "critical" : "failing",
    score,
    metrics: {
      responseTimeMs: Math.round(100 + Math.random() * 200),
      errorRate: Math.round((100 - score) * 0.5) / 100,
      throughput: Math.round(score * 10),
    },
    lastChecked: ts(),
    anomalies,
  };
}

// ─── Scan ───────────────────────────────────────────────────────

/**
 * Perform a full system health scan.
 */
export function fullSystemScan(overrides?: Partial<Record<SubsystemName, number>>): SystemSnapshot {
  scanCount++;
  const subsystemNames: SubsystemName[] = ["git", "cicd", "codeIntel", "governance", "network", "memory", "storage", "compute"];

  const subsystems = subsystemNames.map((name) =>
    generateSubsystemHealth(name, overrides?.[name])
  );

  const overallScore = Math.round(subsystems.reduce((s, sub) => s + sub.score, 0) / subsystems.length);
  const overallHealth: HealthLevel =
    overallScore >= 90 ? "healthy"
    : overallScore >= 70 ? "degraded"
    : overallScore >= 50 ? "critical"
    : "failing";

  const snapshot: SystemSnapshot = {
    id: `scan-${uid().slice(0, 8)}`,
    timestamp: ts(),
    overallHealth,
    overallScore,
    subsystems,
    activeDiagnoses: diagnoses.size,
    healingInProgress: healingHistory.some((h) => !h.success && h.actionsExecuted < h.actionsTotal),
  };

  snapshots.push(snapshot);
  if (snapshots.length > 100) {snapshots.splice(0, snapshots.length - 100);}

  return snapshot;
}

// ─── Diagnose ───────────────────────────────────────────────────

/**
 * Diagnose anomalies from a system scan.
 */
export function diagnoseAnomalies(snapshot: SystemSnapshot): Diagnosis[] {
  const allAnomalies = snapshot.subsystems.flatMap((s) => s.anomalies);
  if (allAnomalies.length === 0) {return [];}

  const result: Diagnosis[] = [];

  // Group anomalies by subsystem
  const bySubsystem = new Map<SubsystemName, Anomaly[]>();
  for (const anomaly of allAnomalies) {
    const existing = bySubsystem.get(anomaly.subsystem) ?? [];
    existing.push(anomaly);
    bySubsystem.set(anomaly.subsystem, existing);
  }

  for (const [subsystem, anomalies] of bySubsystem) {
    const maxSeverity = anomalies.reduce((max, a) => {
      const order = { low: 0, medium: 1, high: 2, critical: 3 };
      return (order[a.severity] ?? 0) > (order[max] ?? 0) ? a.severity : max;
    }, "low" as Anomaly["severity"]);

    const diagnosis: Diagnosis = {
      id: `diag-${uid().slice(0, 8)}`,
      anomalies,
      rootCause: `${subsystem} subsystem ${anomalies.length > 1 ? "multiple issues" : anomalies[0]?.description ?? "unknown issue"}`,
      confidence: anomalies.length > 1 ? 0.8 : 0.6,
      affectedSubsystems: [subsystem],
      cascadeRisk: maxSeverity === "critical" ? 0.7 : maxSeverity === "high" ? 0.4 : 0.1,
      severity: maxSeverity,
    };

    diagnoses.set(diagnosis.id, diagnosis);
    result.push(diagnosis);
  }

  return result;
}

// ─── Prescribe ──────────────────────────────────────────────────

/**
 * Generate healing prescriptions for diagnosed issues.
 */
export function prescribeHealing(diagnosis: Diagnosis): Prescription {
  const prescriptionId = `rx-${uid().slice(0, 8)}`;

  // Select strategy based on severity and root cause
  let strategy: HealingStrategy;
  let actions: HealingAction[] = [];
  let requiresApproval = false;
  let risk = 0.2;

  switch (diagnosis.severity) {
    case "critical":
      strategy = "rollback";
      requiresApproval = true;
      risk = 0.5;
      actions = [
        { order: 1, action: "snapshot-state", target: diagnosis.affectedSubsystems[0] ?? "system", params: {} },
        { order: 2, action: "rollback-to-last-healthy", target: diagnosis.affectedSubsystems[0] ?? "system", params: {}, rollbackAction: "restore-snapshot" },
        { order: 3, action: "verify-health", target: diagnosis.affectedSubsystems[0] ?? "system", params: { threshold: 80 } },
      ];
      break;

    case "high":
      strategy = "restart";
      risk = 0.3;
      actions = [
        { order: 1, action: "graceful-drain", target: diagnosis.affectedSubsystems[0] ?? "system", params: { timeoutMs: 30000 } },
        { order: 2, action: "restart-service", target: diagnosis.affectedSubsystems[0] ?? "system", params: {} },
        { order: 3, action: "verify-health", target: diagnosis.affectedSubsystems[0] ?? "system", params: { threshold: 70 } },
      ];
      break;

    case "medium":
      strategy = "scale";
      risk = 0.1;
      actions = [
        { order: 1, action: "increase-resources", target: diagnosis.affectedSubsystems[0] ?? "system", params: { factor: 1.5 } },
        { order: 2, action: "monitor-improvement", target: diagnosis.affectedSubsystems[0] ?? "system", params: { durationMs: 60000 } },
      ];
      break;

    default:
      strategy = "notify";
      risk = 0;
      actions = [
        { order: 1, action: "log-issue", target: diagnosis.affectedSubsystems[0] ?? "system", params: { message: diagnosis.rootCause } },
      ];
      break;
  }

  const prescription: Prescription = {
    id: prescriptionId,
    diagnosisId: diagnosis.id,
    strategy,
    actions,
    priority: diagnosis.severity === "critical" ? 10 : diagnosis.severity === "high" ? 7 : diagnosis.severity === "medium" ? 4 : 1,
    estimatedHealingTime: `${actions.length * 30}s`,
    requiresApproval,
    risk,
  };

  prescriptions.set(prescriptionId, prescription);
  return prescription;
}

// ─── Heal ───────────────────────────────────────────────────────

/**
 * Execute a healing prescription.
 */
export function executeHealing(prescriptionId: string): HealingResult {
  const rx = prescriptions.get(prescriptionId);
  if (!rx) {
    return {
      prescriptionId,
      success: false,
      actionsExecuted: 0,
      actionsTotal: 0,
      healingDurationMs: 0,
      postHealScore: 0,
      notes: ["Prescription not found"],
    };
  }

  const start = Date.now();
  const notes: string[] = [];
  let actionsExecuted = 0;

  for (const action of rx.actions) {
    // Simulate executing each action
    notes.push(`Executed: ${action.action} on ${action.target}`);
    actionsExecuted++;
  }

  // Simulate post-healing health improvement
  const postHealScore = Math.min(100, 70 + Math.round(Math.random() * 25));

  const result: HealingResult = {
    prescriptionId,
    success: true,
    actionsExecuted,
    actionsTotal: rx.actions.length,
    healingDurationMs: Date.now() - start + 200,
    postHealScore,
    notes,
  };

  healingHistory.push(result);
  return result;
}

// ─── Full Auto-Heal Cycle ───────────────────────────────────────

/**
 * Complete autonomous healing cycle: scan → diagnose → prescribe → heal.
 */
export function autoHealCycle(overrides?: Partial<Record<SubsystemName, number>>): {
  snapshot: SystemSnapshot;
  diagnoses: Diagnosis[];
  prescriptions: Prescription[];
  healingResults: HealingResult[];
} {
  const snapshot = fullSystemScan(overrides);
  const diags = diagnoseAnomalies(snapshot);
  const rxs: Prescription[] = [];
  const results: HealingResult[] = [];

  for (const diag of diags) {
    const rx = prescribeHealing(diag);
    rxs.push(rx);

    // Auto-execute non-approval-required prescriptions
    if (!rx.requiresApproval) {
      const result = executeHealing(rx.id);
      results.push(result);
    }
  }

  return { snapshot, diagnoses: diags, prescriptions: rxs, healingResults: results };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function selfDiagnosticsSummary(): SelfDiagnosticsSummary {
  const successfulHeals = healingHistory.filter((h) => h.success).length;
  const latestSnapshot = snapshots[snapshots.length - 1];

  return {
    totalScans: scanCount,
    totalDiagnoses: diagnoses.size,
    totalHealingActions: healingHistory.length,
    healingSuccessRate: healingHistory.length > 0 ? Math.round((successfulHeals / healingHistory.length) * 100) / 100 : 1,
    currentHealth: latestSnapshot?.overallHealth ?? "healthy",
    currentScore: latestSnapshot?.overallScore ?? 100,
    recentSnapshots: snapshots.slice(-10),
  };
}

export function resetSelfDiagnosticsState(): void {
  diagnoses.clear();
  prescriptions.clear();
  healingHistory.length = 0;
  snapshots.length = 0;
  scanCount = 0;
}
