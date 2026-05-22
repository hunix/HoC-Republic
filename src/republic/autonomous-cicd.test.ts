/**
 * Autonomous CI/CD — Phase 21 Tests
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildProject, runTests, deployToEnvironment, canaryDeploy,
  rollback, createPipeline, autoApprove, monitorDeployment,
  deploymentHistory, cicdDiagnostics, resetCICDState,
} from "./autonomous-cicd.js";

describe("Phase 21: Autonomous CI/CD Pipeline", () => {
  beforeEach(() => resetCICDState());

  describe("buildProject", () => {
    it("should build successfully", async () => {
      const result = await buildProject("/test/repo");
      expect(result.success).toBe(true);
      expect(result.artifacts.length).toBeGreaterThan(0);
      expect(result.output).toContain("SUCCESS");
    });
  });

  describe("runTests", () => {
    it("should run tests successfully", async () => {
      const result = await runTests("/test/repo");
      expect(result.success).toBe(true);
      expect(result.passed).toBeGreaterThan(0);
      expect(result.failed).toBe(0);
    });
  });

  describe("deployToEnvironment", () => {
    it("should deploy to staging", () => {
      const deploy = deployToEnvironment("/test/repo", "staging");
      expect(deploy.status).toBe("active");
      expect(deploy.environment).toBe("staging");
      expect(deploy.trafficPct).toBe(100);
    });
  });

  describe("canaryDeploy", () => {
    it("should start canary with limited traffic", () => {
      const deploy = canaryDeploy("/test/repo", 10);
      expect(deploy.trafficPct).toBe(10);
      expect(deploy.status).toBe("deploying");
    });
  });

  describe("rollback", () => {
    it("should rollback a deployment", () => {
      const deploy = deployToEnvironment("/test/repo", "production");
      const result = rollback(deploy.id);
      expect(result.ok).toBe(true);
      expect(result.newDeployment).toBeTruthy();
      expect(result.newDeployment!.rollbackOf).toBe(deploy.id);
    });

    it("should fail on non-existent deployment", () => {
      const result = rollback("nonexistent");
      expect(result.ok).toBe(false);
    });
  });

  describe("createPipeline", () => {
    it("should run a full pipeline", async () => {
      const pipeline = await createPipeline("/test/repo");
      expect(pipeline.status).toBe("passed");
      expect(pipeline.stages.length).toBeGreaterThanOrEqual(3);
      expect(pipeline.stages.every((s) => s.status === "passed")).toBe(true);
    });

    it("should run with custom stages", async () => {
      const pipeline = await createPipeline("/test/repo", ["lint", "build"]);
      expect(pipeline.stages.length).toBe(2);
    });
  });

  describe("autoApprove", () => {
    it("should approve a passing pipeline", async () => {
      const pipeline = await createPipeline("/test/repo");
      const result = autoApprove(pipeline.id);
      expect(result.approved).toBe(true);
    });
  });

  describe("monitorDeployment", () => {
    it("should monitor a healthy deployment", () => {
      const deploy = deployToEnvironment("/test/repo", "staging");
      const health = monitorDeployment(deploy.id);
      expect(health.health).toBe(100);
      expect(health.issues).toHaveLength(0);
    });
  });

  describe("deploymentHistory", () => {
    it("should track deployment history", () => {
      deployToEnvironment("/test/repo", "staging");
      deployToEnvironment("/test/repo", "production");
      const history = deploymentHistory();
      expect(history.length).toBe(2);
    });
  });

  describe("diagnostics", () => {
    it("should report pipeline and deployment stats", async () => {
      await createPipeline("/test/repo");
      deployToEnvironment("/test/repo", "staging");
      const diag = cicdDiagnostics();
      expect(diag.totalPipelines).toBeGreaterThanOrEqual(1);
      expect(diag.totalDeployments).toBeGreaterThanOrEqual(1);
    });
  });
});
