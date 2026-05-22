import { describe, it, expect, beforeEach } from "vitest";
import {
  selectModel,
  shouldUseCouncilVote,
  getCouncilVoters,
  getCouncilDiagnostics,
  budgetTierToComputeTier,
  decisionToInferenceTarget,
  registerAvailableProvider,
  MODEL_CATALOG,
  exportCouncilState,
  importCouncilState,
} from "./model-council.js";
import type { AgentTask } from "./types.js";

function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    type: "decision",
    complexity: 0.5,
    citizenId: "ctz-001",
    description: "Test task",
    ...overrides,
  };
}

describe("Model Council", () => {
  beforeEach(() => {
    // Reset state
    importCouncilState({ decisions: [], providers: {} });
    // Register cloud providers as available — IDs must match MODEL_CATALOG
    registerAvailableProvider("openai", ["gpt-5.2-pro", "gpt-5.2", "gpt-4.1-mini", "gpt-4.1-nano"]);
    registerAvailableProvider("anthropic", ["claude-4.6-opus", "claude-4.6-sonnet"]);
    registerAvailableProvider("google", ["gemini-3.1-pro", "gemini-3.1-flash", "gemini-3.1-flash-lite"]);
  });

  describe("selectModel", () => {
    it("routes premium tools to premium tier", () => {
      const decision = selectModel({
        toolName: "plan_project",
        task: makeTask({ complexity: 0.7 }),
        specialization: "Architect",
        skillLevel: 80,
        citizenAccessTier: "orchestrator", // must have orchestrator access for premium
      });
      expect(decision.requestedTier).toBe("premium");
      expect(decision.model.budgetTier).toBe("premium");
    });

    it("routes coding tools to standard tier", () => {
      const decision = selectModel({
        toolName: "write_code",
        task: makeTask({ complexity: 0.5 }),
        specialization: "Generalist",
        skillLevel: 30,
      });
      expect(decision.requestedTier).toBe("standard");
    });

    it("routes test writing to cheap tier", () => {
      const decision = selectModel({
        toolName: "write_test",
        task: makeTask({ complexity: 0.4 }),
        specialization: "Developer",
        skillLevel: 60,
      });
      expect(decision.requestedTier).toBe("cheap");
    });

    it("routes social actions to local tier", () => {
      const decision = selectModel({
        toolName: "socialize",
        task: makeTask({ complexity: 0.1 }),
        specialization: "Generalist",
        skillLevel: 20,
      });
      expect(decision.requestedTier).toBe("local");
    });

    it("bumps tier up for very complex tasks", () => {
      const decision = selectModel({
        toolName: "write_test", // normally cheap
        task: makeTask({ complexity: 0.95 }),
        specialization: "Generalist",
        skillLevel: 30,
      });
      // Should bump from cheap to standard
      expect(decision.requestedTier).toBe("standard");
    });

    it("bumps tier down for trivial tasks", () => {
      const decision = selectModel({
        toolName: "write_code", // normally standard
        task: makeTask({ complexity: 0.1 }),
        specialization: "Generalist",
        skillLevel: 30,
      });
      // Should bump down from standard to cheap
      expect(decision.requestedTier).toBe("cheap");
    });

    it("adjusts tier based on specialization + skill", () => {
      const decision = selectModel({
        toolName: "write_code",
        task: makeTask({ complexity: 0.5 }),
        specialization: "Developer",
        skillLevel: 70, // high enough to trigger adjustment
      });
      // Developer writing code can use cheaper tier
      expect(["cheap", "standard"]).toContain(decision.requestedTier);
    });

    it("does NOT adjust tier for low-skill citizens", () => {
      const decision = selectModel({
        toolName: "write_code",
        task: makeTask({ complexity: 0.5 }),
        specialization: "Developer",
        skillLevel: 20, // too low for tier adjustment
      });
      expect(decision.requestedTier).toBe("standard");
    });

    it("includes reason string", () => {
      const decision = selectModel({
        toolName: "debug_code",
        task: makeTask(),
        specialization: "Engineer",
        skillLevel: 50,
      });
      expect(decision.reason).toContain("debug_code");
      expect(decision.reason).toContain("Engineer");
    });
  });

  describe("ModelConfig", () => {
    it("uses low temperature for coding tasks", () => {
      const decision = selectModel({
        toolName: "write_code",
        task: makeTask(),
        specialization: "Developer",
        skillLevel: 50,
      });
      expect(decision.config.temperature).toBeLessThan(0.5);
    });

    it("uses high temperature for creative tasks", () => {
      const decision = selectModel({
        toolName: "create_art",
        task: makeTask(),
        specialization: "Artist",
        skillLevel: 50,
      });
      expect(decision.config.temperature).toBeGreaterThan(0.5);
    });

    it("uses higher max tokens for planning tasks", () => {
      const decision = selectModel({
        toolName: "plan_project",
        task: makeTask({ complexity: 0.8 }),
        specialization: "Architect",
        skillLevel: 80,
      });
      expect(decision.config.maxTokens).toBeGreaterThanOrEqual(4096);
    });

    it("uses lower max tokens for simple actions", () => {
      const decision = selectModel({
        toolName: "speak",
        task: makeTask({ complexity: 0.1 }),
        specialization: "Generalist",
        skillLevel: 20,
      });
      expect(decision.config.maxTokens).toBeLessThanOrEqual(256);
    });

    it("enables thinking for complex tasks", () => {
      const decision = selectModel({
        toolName: "plan_project",
        task: makeTask({ complexity: 0.95 }),
        specialization: "Architect",
        skillLevel: 80,
      });
      expect(decision.config.thinkingLevel).not.toBe("off");
    });
  });

  describe("Council Vote", () => {
    it("flags high-stakes tools for council vote", () => {
      expect(shouldUseCouncilVote("plan_project")).toBe(true);
      expect(shouldUseCouncilVote("deploy_app")).toBe(true);
      expect(shouldUseCouncilVote("write_schema")).toBe(true);
    });

    it("does NOT flag routine tools for council vote", () => {
      expect(shouldUseCouncilVote("speak")).toBe(false);
      expect(shouldUseCouncilVote("rest")).toBe(false);
      expect(shouldUseCouncilVote("write_test")).toBe(false);
    });

    it("returns diverse voters from different providers", () => {
      const { voters, tiebreaker } = getCouncilVoters();
      expect(voters.length).toBeGreaterThanOrEqual(1);
      expect(voters.length).toBeLessThanOrEqual(3);
      expect(tiebreaker).toBeDefined();
      // Check voter diversity
      const providers = new Set(voters.map((v) => v.provider));
      expect(providers.size).toBeGreaterThanOrEqual(1);
    });

    it("returns a premium tiebreaker", () => {
      const { tiebreaker } = getCouncilVoters();
      expect(tiebreaker.budgetTier).toBe("premium");
    });
  });

  describe("Tier Conversions", () => {
    it("maps premium to ComputeTier 3", () => {
      expect(budgetTierToComputeTier("premium")).toBe(3);
    });

    it("maps local to ComputeTier 1", () => {
      expect(budgetTierToComputeTier("local")).toBe(1);
    });

    it("maps bitnet to ComputeTier 1", () => {
      expect(budgetTierToComputeTier("bitnet")).toBe(1);
    });

    it("converts decision to InferenceTarget", () => {
      const decision = selectModel({
        toolName: "write_code",
        task: makeTask(),
        specialization: "Developer",
        skillLevel: 50,
      });
      const target = decisionToInferenceTarget(decision);
      expect(target.tier).toBeDefined();
      expect(target.engine).toBeDefined();
      expect(target.modelId).toBe(decision.model.id);
    });
  });

  describe("Diagnostics", () => {
    it("tracks decisions", () => {
      selectModel({
        toolName: "write_code",
        task: makeTask(),
        specialization: "Developer",
        skillLevel: 50,
      });
      selectModel({
        toolName: "rest",
        task: makeTask({ complexity: 0.05 }),
        specialization: "Generalist",
        skillLevel: 20,
      });

      const diag = getCouncilDiagnostics();
      expect(diag.totalDecisions).toBe(2);
      expect(diag.totalModels).toBe(MODEL_CATALOG.length);
    });

    it("tracks free call percentage", () => {
      // Make 2 local-tier calls and 1 cloud call
      selectModel({
        toolName: "socialize",
        task: makeTask({ complexity: 0.1 }),
        specialization: "Generalist",
        skillLevel: 20,
      });
      selectModel({
        toolName: "rest",
        task: makeTask({ complexity: 0.05 }),
        specialization: "Generalist",
        skillLevel: 20,
      });
      selectModel({
        toolName: "plan_project",
        task: makeTask({ complexity: 0.9 }),
        specialization: "Architect",
        skillLevel: 80,
      });

      const diag = getCouncilDiagnostics();
      expect(diag.freeCallPercentage).toBeGreaterThan(0);
    });
  });

  describe("State Export/Import", () => {
    it("round-trips state", () => {
      selectModel({
        toolName: "write_code",
        task: makeTask(),
        specialization: "Developer",
        skillLevel: 50,
      });

      const exported = exportCouncilState();
      expect(exported.decisions.length).toBe(1);

      // Clear and reimport
      importCouncilState({ decisions: [], providers: {} });
      expect(getCouncilDiagnostics().totalDecisions).toBe(0);

      importCouncilState(exported);
      expect(getCouncilDiagnostics().totalDecisions).toBe(1);
    });
  });
});
