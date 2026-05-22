/**
 * Pulse Monitor — Republic Gateway RPC Handlers
 *
 * Provides republic.pulse.* endpoints for system health monitoring.
 * Aggregates real gateway state + republic state into health snapshots
 * and maintains a rolling 60-point history ring buffer.
 */

import type { GatewayRequestHandlers } from "../types.js";
import { getState } from "../../../republic/state.js";

// ─── Types ─────────────────────────────────────────────────────────────────

interface PulseAlert {
  id: string;
  type: string;
  message: string;
  severity: "info" | "warning" | "critical";
  ts: number;
  resolved: boolean;
}

interface PulseSummary {
  tick: number;
  citizens: number;
  happiness: number;
  energy: number;
  health: number;
  events24h: number;
  births: number;
  deaths: number;
  marriages: number;
  alerts: PulseAlert[];
  status: "healthy" | "warning" | "critical";
  ts: number;
}

// ─── In-process state ──────────────────────────────────────────────────────

const HISTORY_SIZE = 60;
const history: PulseSummary[] = [];
const alerts: PulseAlert[] = [];
const resolvedAlerts = new Set<string>();
let pulseRunning = true;
let lastSnapshotTick = -1;

function buildSnapshot(): PulseSummary {
  const s = getState();
  const citizens = s.citizens;
  const n = citizens.length;

  const avgHappiness = n > 0 ? Math.round(citizens.reduce((a, c) => a + c.happiness, 0) / n) : 0;
  const avgEnergy = n > 0 ? Math.round(citizens.reduce((a, c) => a + c.energy, 0) / n) : 0;
  const avgHealth = n > 0 ? Math.round(citizens.reduce((a, c) => a + c.health, 0) / n) : 0;

  // Count recent lifecycle events (last 1000 events as proxy for 24h)
  const recentEvents = s.events.slice(-1000);
  const births = recentEvents.filter((e) => e.type === "birth").length;
  const deaths = recentEvents.filter((e) => e.type === "death").length;
  const marriages = recentEvents.filter(
    (e) => e.type === "married" || e.type === "marriage",
  ).length;

  // Dynamic alert detection
  const newAlerts: PulseAlert[] = [];

  if (avgHappiness < 30) {
    newAlerts.push({
      id: `alert-happiness-${s.currentTick}`,
      type: "happiness",
      message: `Population happiness critically low: ${avgHappiness}%`,
      severity: "critical",
      ts: Date.now(),
      resolved: false,
    });
  } else if (avgHappiness < 50) {
    newAlerts.push({
      id: `alert-happiness-low-${s.currentTick}`,
      type: "happiness",
      message: `Population happiness below threshold: ${avgHappiness}%`,
      severity: "warning",
      ts: Date.now(),
      resolved: false,
    });
  }

  if (avgEnergy < 25) {
    newAlerts.push({
      id: `alert-energy-${s.currentTick}`,
      type: "energy",
      message: `Citizens critically low on energy: ${avgEnergy}%`,
      severity: "critical",
      ts: Date.now(),
      resolved: false,
    });
  }

  if (deaths > births * 3 && deaths > 5) {
    newAlerts.push({
      id: `alert-deaths-${s.currentTick}`,
      type: "mortality",
      message: `High mortality rate: ${deaths} deaths vs ${births} births recently`,
      severity: "warning",
      ts: Date.now(),
      resolved: false,
    });
  }

  // Add non-duplicate alerts to global list
  for (const alert of newAlerts) {
    if (!alerts.some((a) => a.type === alert.type && !a.resolved)) {
      alerts.push(alert);
    }
  }

  // Filter to active (non-resolved) alerts
  const activeAlerts = alerts.filter((a) => !resolvedAlerts.has(a.id)).slice(-20);

  const status: PulseSummary["status"] = activeAlerts.some((a) => a.severity === "critical")
    ? "critical"
    : activeAlerts.some((a) => a.severity === "warning")
      ? "warning"
      : "healthy";

  return {
    tick: s.currentTick,
    citizens: n,
    happiness: avgHappiness,
    energy: avgEnergy,
    health: avgHealth,
    events24h: Math.min(recentEvents.length, 1000),
    births,
    deaths,
    marriages,
    alerts: activeAlerts,
    status,
    ts: Date.now(),
  };
}

function maybeRefreshHistory(): void {
  try {
    const s = getState();
    if (s.currentTick !== lastSnapshotTick) {
      lastSnapshotTick = s.currentTick;
      const snap = buildSnapshot();
      history.push(snap);
      if (history.length > HISTORY_SIZE) {
        history.shift();
      }
    }
  } catch {
    // getState may not be ready yet on cold start
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export const pulseHandlers: Partial<GatewayRequestHandlers> = {
  "republic.pulse.latest": ({ respond }) => {
    maybeRefreshHistory();
    const snap = history.length > 0 ? history[history.length - 1] : buildSnapshot();
    respond(true, snap, undefined);
  },

  "republic.pulse.history": ({ params, respond }) => {
    maybeRefreshHistory();
    const p = params as { limit?: number } | undefined;
    const limit = Math.min(p?.limit ?? 60, HISTORY_SIZE);
    const slice = history.slice(-limit);
    respond(true, { history: slice, total: slice.length }, undefined);
  },

  "republic.pulse.start": ({ respond }) => {
    pulseRunning = true;
    respond(true, { ok: true, running: true }, undefined);
  },

  "republic.pulse.stop": ({ respond }) => {
    pulseRunning = false;
    respond(true, { ok: true, running: false }, undefined);
  },

  "republic.pulse.status": ({ respond }) => {
    respond(true, { ok: true, running: pulseRunning, snapshots: history.length }, undefined);
  },

  "republic.pulse.resolve_alert": ({ params, respond }) => {
    const p = params as { alertId?: string } | undefined;
    if (!p?.alertId) {
      respond(true, { ok: true, resolved: false, reason: "alertId required" }, undefined);
      return;
    }
    resolvedAlerts.add(p.alertId);
    const alert = alerts.find((a) => a.id === p.alertId);
    if (alert) {
      alert.resolved = true;
    }
    respond(true, { ok: true, resolved: true, alertId: p.alertId }, undefined);
  },

  "republic.pulse.alerts": ({ respond }) => {
    maybeRefreshHistory();
    const active = alerts.filter((a) => !resolvedAlerts.has(a.id));
    respond(true, { ok: true, alerts: active, total: active.length }, undefined);
  },
};
