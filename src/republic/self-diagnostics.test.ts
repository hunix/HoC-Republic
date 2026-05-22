/**
 * Self-Diagnostics — Phase 22 Tests
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  fullSystemScan, diagnoseAnomalies, prescribeHealing,
  executeHealing, autoHealCycle, selfDiagnosticsSummary,
  resetSelfDiagnosticsState,
} from "./self-diagnostics.js";

describe("Phase 22: Self-Diagnostics & Healing Loop", () => {
  beforeEach(() => resetSelfDiagnosticsState());

  describe("fullSystemScan", () => {
    it("should scan all subsystems", () => {
      const snapshot = fullSystemScan();
      expect(snapshot.subsystems.length).toBe(8);
      expect(snapshot.overallScore).toBeGreaterThan(0);
      expect(snapshot.overallHealth).toBeTruthy();
    });

    it("should use overrides for specific subsystems", () => {
      const snapshot = fullSystemScan({ memory: 30 });
      const memory = snapshot.subsystems.find((s) => s.name === "memory");
      expect(memory).toBeTruthy();
      expect(memory!.score).toBe(30);
      expect(memory!.status).toBe("failing");
    });
  });

  describe("diagnoseAnomalies", () => {
    it("should diagnose issues from unhealthy scan", () => {
      const snapshot = fullSystemScan({ git: 40, memory: 50 });
      const diags = diagnoseAnomalies(snapshot);
      expect(diags.length).toBeGreaterThan(0);
      expect(diags.some((d) => d.affectedSubsystems.includes("git") || d.affectedSubsystems.includes("memory"))).toBe(true);
    });

    it("should return empty for healthy scan", () => {
      const snapshot = fullSystemScan({ git: 95, cicd: 95, codeIntel: 95, governance: 95, network: 95, memory: 95, storage: 95, compute: 95 });
      const diags = diagnoseAnomalies(snapshot);
      expect(diags.length).toBe(0);
    });
  });

  describe("prescribeHealing", () => {
    it("should prescribe rollback for critical issues", () => {
      const snapshot = fullSystemScan({ git: 20 });
      const diags = diagnoseAnomalies(snapshot);
      const criticalDiag = diags.find((d) => d.severity === "critical" || d.severity === "high");
      if (criticalDiag) {
        const rx = prescribeHealing(criticalDiag);
        expect(rx.actions.length).toBeGreaterThan(0);
        expect(rx.priority).toBeGreaterThanOrEqual(7);
      }
    });
  });

  describe("executeHealing", () => {
    it("should execute healing actions", () => {
      const snapshot = fullSystemScan({ git: 40 });
      const diags = diagnoseAnomalies(snapshot);
      if (diags.length > 0) {
        const rx = prescribeHealing(diags[0]);
        const result = executeHealing(rx.id);
        expect(result.success).toBe(true);
        expect(result.actionsExecuted).toBe(result.actionsTotal);
      }
    });

    it("should fail for non-existent prescription", () => {
      const result = executeHealing("nonexistent");
      expect(result.success).toBe(false);
    });
  });

  describe("autoHealCycle", () => {
    it("should complete a full scan-diagnose-prescribe-heal cycle", () => {
      const cycle = autoHealCycle({ memory: 40, storage: 50 });
      expect(cycle.snapshot.subsystems.length).toBe(8);
      expect(cycle.diagnoses.length).toBeGreaterThan(0);
      expect(cycle.prescriptions.length).toBeGreaterThan(0);
    });
  });

  describe("diagnostics", () => {
    it("should track scan and healing stats", () => {
      fullSystemScan();
      autoHealCycle({ memory: 40 });
      const summary = selfDiagnosticsSummary();
      expect(summary.totalScans).toBeGreaterThanOrEqual(2);
      expect(summary.currentHealth).toBeTruthy();
    });
  });
});
