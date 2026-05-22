/**
 * Tests — System Pulse (Phase 30)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerCollector,
  unregisterCollector,
  listCollectors,
  registerDefaultCollectors,
  takePulse,
  startPulse,
  stopPulse,
  isPulseRunning,
  getPulseHistory,
  getUnresolvedAlerts,
  resolveAlert,
  getLatestPulse,
  pulseDiagnostics,
  resetPulse,
} from "./system-pulse.js";

beforeEach(() => {
  resetPulse();
});

// ─── Collector Registry ─────────────────────────────────────────

describe("Collector registry", () => {
  it("should register collectors", () => {
    expect(registerCollector("test", () => [])).toBe(true);
    expect(listCollectors()).toContain("test");
  });

  it("should reject duplicate collectors", () => {
    registerCollector("test", () => []);
    expect(registerCollector("test", () => [])).toBe(false);
  });

  it("should unregister collectors", () => {
    registerCollector("test", () => []);
    expect(unregisterCollector("test")).toBe(true);
    expect(listCollectors()).not.toContain("test");
  });

  it("should register default collectors", () => {
    registerDefaultCollectors();
    const names = listCollectors();
    expect(names).toContain("republic");
    expect(names).toContain("economy");
    expect(names).toContain("gateway");
  });
});

// ─── Pulse Engine ───────────────────────────────────────────────

describe("Pulse engine", () => {
  it("should take a pulse snapshot", () => {
    registerCollector("mock", () => [{
      id: "s1", source: "republic", label: "Test",
      value: 42, unit: "units",
      status: "alive", trend: "stable", timestamp: new Date().toISOString(),
    }]);

    const snapshot = takePulse();
    expect(snapshot.signals).toHaveLength(1);
    expect(snapshot.overallStatus).toBe("alive");
  });

  it("should detect degraded status", () => {
    registerCollector("bad", () => [{
      id: "s1", source: "gateway", label: "Memory",
      value: 900, unit: "MB",
      status: "degraded", trend: "up", timestamp: new Date().toISOString(),
    }]);

    const snapshot = takePulse();
    expect(snapshot.overallStatus).toBe("degraded");
  });

  it("should detect critical status and generate alerts", () => {
    registerCollector("critical", () => [{
      id: "s1", source: "memory", label: "Heap",
      value: 2048, unit: "MB",
      status: "critical", trend: "up", timestamp: new Date().toISOString(),
    }]);

    const snapshot = takePulse();
    expect(snapshot.overallStatus).toBe("critical");
    expect(snapshot.alertCount).toBeGreaterThan(0);
  });

  it("should handle collector failures gracefully", () => {
    registerCollector("broken", () => { throw new Error("boom"); });
    registerCollector("working", () => [{
      id: "s1", source: "republic", label: "OK",
      value: 1, unit: "tick",
      status: "alive", trend: "stable", timestamp: new Date().toISOString(),
    }]);

    const snapshot = takePulse();
    expect(snapshot.signals).toHaveLength(1);
  });

  it("should aggregate from default collectors", () => {
    registerDefaultCollectors();
    const snapshot = takePulse();
    expect(snapshot.signals.length).toBeGreaterThanOrEqual(5);
  });
});

// ─── Lifecycle ──────────────────────────────────────────────────

describe("Pulse lifecycle", () => {
  it("should start and stop", () => {
    expect(startPulse(1000)).toBe(true);
    expect(isPulseRunning()).toBe(true);
    expect(stopPulse()).toBe(true);
    expect(isPulseRunning()).toBe(false);
  });

  it("should not double-start", () => {
    startPulse();
    expect(startPulse()).toBe(false);
    stopPulse();
  });
});

// ─── History & Alerts ───────────────────────────────────────────

describe("History and alerts", () => {
  it("should track pulse history", () => {
    registerCollector("simple", () => [{
      id: "s1", source: "republic", label: "T",
      value: 1, unit: "u", status: "alive", trend: "stable",
      timestamp: new Date().toISOString(),
    }]);

    takePulse();
    takePulse();
    takePulse();

    const history = getPulseHistory();
    expect(history.snapshots).toHaveLength(3);
  });

  it("should get latest pulse", () => {
    registerCollector("simple", () => [{
      id: "s1", source: "republic", label: "T",
      value: 99, unit: "u", status: "alive", trend: "stable",
      timestamp: new Date().toISOString(),
    }]);

    takePulse();
    const latest = getLatestPulse();
    expect(latest).toBeTruthy();
    expect(latest!.signals[0].value).toBe(99);
  });

  it("should manage alerts", () => {
    registerCollector("alert", () => [{
      id: "s1", source: "gateway", label: "Bad",
      value: 0, unit: "u", status: "critical", trend: "down",
      timestamp: new Date().toISOString(),
    }]);

    takePulse();
    const unresolved = getUnresolvedAlerts();
    expect(unresolved.length).toBeGreaterThan(0);

    resolveAlert(unresolved[0].id);
    expect(getUnresolvedAlerts().length).toBe(0);
  });
});

// ─── Diagnostics ────────────────────────────────────────────────

describe("Diagnostics", () => {
  it("should provide comprehensive diagnostics", () => {
    registerDefaultCollectors();
    startPulse();
    takePulse();

    const diag = pulseDiagnostics();
    expect(diag.isRunning).toBe(true);
    expect(diag.totalSnapshots).toBe(1);
    expect(diag.registeredCollectors.length).toBeGreaterThanOrEqual(5);

    stopPulse();
  });
});
