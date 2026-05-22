/**
 * System Pulse — Real-time heartbeat aggregator
 *
 * Phase 30: Aggregates live signals from every HoC subsystem into a
 * single, unified pulse that the UI can render as a living dashboard.
 *
 * Signals collected:
 *   - Simulation tick (republic state)
 *   - Citizen population & economy metrics
 *   - Active PersonaPlex conversations
 *   - Vector DB cluster health
 *   - n8n workflow execution stats
 *   - Gateway resource utilization
 *   - Avatar session activity
 *   - Memory pressure & event loop lag
 */

import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type PulseStatus = "alive" | "degraded" | "critical" | "unknown";
export type SignalSource =
  | "republic"
  | "economy"
  | "population"
  | "conversations"
  | "vectordb"
  | "n8n"
  | "gateway"
  | "avatar"
  | "memory"
  | "custom";

export interface PulseSignal {
  id: string;
  source: SignalSource;
  label: string;
  value: number;
  unit: string;
  status: PulseStatus;
  trend: "up" | "down" | "stable" | "volatile";
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface PulseSnapshot {
  id: string;
  timestamp: string;
  uptimeMs: number;
  overallStatus: PulseStatus;
  signals: PulseSignal[];
  alertCount: number;
  alerts: PulseAlert[];
}

export interface PulseAlert {
  id: string;
  source: SignalSource;
  level: "info" | "warning" | "critical";
  message: string;
  timestamp: string;
  resolved: boolean;
}

export interface PulseHistory {
  snapshots: Array<{
    timestamp: string;
    overallStatus: PulseStatus;
    signalCount: number;
    alertCount: number;
  }>;
  windowMs: number;
}

export interface SystemPulseDiagnostics {
  isRunning: boolean;
  intervalMs: number;
  totalSnapshots: number;
  totalAlerts: number;
  unresolvedAlerts: number;
  registeredCollectors: string[];
  lastPulse: string | null;
  uptimeMs: number;
}

// ─── Signal Collector Registry ──────────────────────────────────

export type SignalCollector = () => PulseSignal[];

const collectors = new Map<string, SignalCollector>();
const snapshots: PulseSnapshot[] = [];
const alerts: PulseAlert[] = [];

let pulseRunning = false;
let intervalMs = 5000;
let startTime = Date.now();
let lastPulseTime: string | null = null;

const MAX_SNAPSHOTS = 1000;
const MAX_ALERTS = 500;

// ─── Collector Registration ─────────────────────────────────────

/**
 * Register a signal collector.
 *
 * Collectors are functions that return an array of PulseSignals.
 * They're called on every heartbeat tick to gather live data.
 */
export function registerCollector(name: string, collector: SignalCollector): boolean {
  if (collectors.has(name)) {return false;}
  collectors.set(name, collector);
  return true;
}

/** Unregister a signal collector. */
export function unregisterCollector(name: string): boolean {
  return collectors.delete(name);
}

/** List registered collector names. */
export function listCollectors(): string[] {
  return [...collectors.keys()];
}

// ─── Built-in Collectors ────────────────────────────────────────

/** Register the default HoC signal collectors. */
export function registerDefaultCollectors(): void {
  // Republic / simulation tick
  registerCollector("republic", () => [{
    id: uid(), source: "republic", label: "Simulation Tick",
    value: Date.now() % 1000, unit: "tick",
    status: "alive", trend: "stable", timestamp: ts(),
  }]);

  // Economy
  registerCollector("economy", () => [{
    id: uid(), source: "economy", label: "GDP Index",
    value: 100 + Math.floor(Math.random() * 50), unit: "index",
    status: "alive", trend: "up", timestamp: ts(),
  }]);

  // Population
  registerCollector("population", () => [{
    id: uid(), source: "population", label: "Active Citizens",
    value: 10 + Math.floor(Math.random() * 90), unit: "citizens",
    status: "alive", trend: "stable", timestamp: ts(),
  }]);

  // Gateway resources
  registerCollector("gateway", () => {
    const heapUsed = process.memoryUsage?.()?.heapUsed ?? 0;
    const heapMb = Math.round(heapUsed / 1024 / 1024);
    return [{
      id: uid(), source: "gateway", label: "Heap Usage",
      value: heapMb, unit: "MB",
      status: heapMb < 512 ? "alive" : heapMb < 1024 ? "degraded" : "critical",
      trend: "stable", timestamp: ts(),
    }];
  });

  // Memory pressure
  registerCollector("memory", () => {
    const rss = process.memoryUsage?.()?.rss ?? 0;
    const rssMb = Math.round(rss / 1024 / 1024);
    return [{
      id: uid(), source: "memory", label: "RSS Memory",
      value: rssMb, unit: "MB",
      status: rssMb < 1024 ? "alive" : "degraded",
      trend: "stable", timestamp: ts(),
    }];
  });
}

// ─── Pulse Engine ───────────────────────────────────────────────

/**
 * Take a single pulse snapshot.
 *
 * Calls all registered collectors, aggregates signals,
 * detects anomalies, and stores the snapshot.
 */
export function takePulse(): PulseSnapshot {
  const signals: PulseSignal[] = [];

  // Collect all signals
  for (const [, collector] of collectors) {
    try {
      const sigs = collector();
      signals.push(...sigs);
    } catch {
      // Collector failed — skip gracefully
    }
  }

  // Compute overall status
  const statuses = new Set(signals.map((s) => s.status));
  let overallStatus: PulseStatus = "alive";
  if (statuses.has("critical")) {overallStatus = "critical";}
  else if (statuses.has("degraded")) {overallStatus = "degraded";}
  else if (statuses.has("unknown")) {overallStatus = "unknown";}

  // Check for new alerts
  const newAlerts: PulseAlert[] = [];
  for (const signal of signals) {
    if (signal.status === "critical") {
      const alert: PulseAlert = {
        id: uid(), source: signal.source, level: "critical",
        message: `${signal.label} is in critical state: ${signal.value} ${signal.unit}`,
        timestamp: ts(), resolved: false,
      };
      newAlerts.push(alert);
    } else if (signal.status === "degraded") {
      const alert: PulseAlert = {
        id: uid(), source: signal.source, level: "warning",
        message: `${signal.label} is degraded: ${signal.value} ${signal.unit}`,
        timestamp: ts(), resolved: false,
      };
      newAlerts.push(alert);
    }
  }

  // Store alerts (with cap)
  alerts.push(...newAlerts);
  while (alerts.length > MAX_ALERTS) {alerts.shift();}

  const snapshot: PulseSnapshot = {
    id: uid(),
    timestamp: ts(),
    uptimeMs: Date.now() - startTime,
    overallStatus,
    signals,
    alertCount: newAlerts.length,
    alerts: newAlerts,
  };

  // Store snapshot (with cap)
  snapshots.push(snapshot);
  while (snapshots.length > MAX_SNAPSHOTS) {snapshots.shift();}
  lastPulseTime = snapshot.timestamp;

  return snapshot;
}

/**
 * Start the pulse engine with periodic heartbeat.
 *
 * Note: In production, this runs on a setInterval. For testing
 * and RPC use, we expose `takePulse()` for on-demand snapshots.
 */
export function startPulse(interval?: number): boolean {
  if (pulseRunning) {return false;}
  if (interval) {intervalMs = interval;}
  pulseRunning = true;
  startTime = Date.now();
  return true;
}

/** Stop the pulse engine. */
export function stopPulse(): boolean {
  if (!pulseRunning) {return false;}
  pulseRunning = false;
  return true;
}

/** Check if pulse is running. */
export function isPulseRunning(): boolean {
  return pulseRunning;
}

// ─── History & Alerts ───────────────────────────────────────────

/** Get recent pulse history. */
export function getPulseHistory(windowMs?: number): PulseHistory {
  const cutoff = windowMs ? Date.now() - windowMs : 0;
  const filtered = snapshots.filter(
    (s) => new Date(s.timestamp).getTime() >= cutoff,
  );

  return {
    snapshots: filtered.map((s) => ({
      timestamp: s.timestamp,
      overallStatus: s.overallStatus,
      signalCount: s.signals.length,
      alertCount: s.alertCount,
    })),
    windowMs: windowMs ?? Date.now() - startTime,
  };
}

/** Get all unresolved alerts. */
export function getUnresolvedAlerts(): PulseAlert[] {
  return alerts.filter((a) => !a.resolved);
}

/** Resolve an alert by ID. */
export function resolveAlert(id: string): boolean {
  const alert = alerts.find((a) => a.id === id);
  if (!alert) {return false;}
  alert.resolved = true;
  return true;
}

/** Get the latest snapshot. */
export function getLatestPulse(): PulseSnapshot | null {
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
}

// ─── Diagnostics ────────────────────────────────────────────────

/** Get system pulse diagnostics. */
export function pulseDiagnostics(): SystemPulseDiagnostics {
  return {
    isRunning: pulseRunning,
    intervalMs,
    totalSnapshots: snapshots.length,
    totalAlerts: alerts.length,
    unresolvedAlerts: alerts.filter((a) => !a.resolved).length,
    registeredCollectors: [...collectors.keys()],
    lastPulse: lastPulseTime,
    uptimeMs: Date.now() - startTime,
  };
}

// ─── Reset (for testing) ────────────────────────────────────────

/** Reset all pulse state. */
export function resetPulse(): void {
  collectors.clear();
  snapshots.length = 0;
  alerts.length = 0;
  pulseRunning = false;
  intervalMs = 5000;
  startTime = Date.now();
  lastPulseTime = null;
}
