/**
 * Code Intelligence Engine — Phase 20 Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  analyzeModule,
  analyzeDirectory,
  diagnoseCodeIssues,
  generateCodeFix,
  reviewCodeDiff,
  councilReview,
  createImprovementPlan,
  validatePatch,
  codeIntelligenceDiagnostics,
  resetCodeIntelligenceState,
  getRegisteredIssues,
  getGeneratedPatches,
} from "./code-intelligence.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ─── Helpers ────────────────────────────────────────────────────

function tempDir(suffix: string): string {
  const dir = join(tmpdir(), `hoc-ci-test-${suffix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function createTestFile(dir: string, name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

function cleanupDir(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

const SAMPLE_TS = `
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Sample module for testing code intelligence.
 */

export interface Config {
  name: string;
  value: number;
}

export function processData(input: string, options?: Config): string {
  if (!input) {
    return "";
  }
  const lines = input.split("\\n");
  const result: string[] = [];
  for (const line of lines) {
    if (line.trim()) {
      result.push(line.toUpperCase());
    }
  }
  return result.join("\\n");
}

function helperFunction(x: number): number {
  return x * 2;
}

export async function fetchData(url: string): Promise<string> {
  return url;
}

export const CONSTANT = 42;
`;

// ─── Tests ──────────────────────────────────────────────────────

describe("Phase 20: Code Intelligence Engine", () => {
  beforeEach(() => {
    resetCodeIntelligenceState();
  });

  describe("analyzeModule", () => {
    it("should analyze a TypeScript file", () => {
      const dir = tempDir("analyze");
      try {
        const file = createTestFile(dir, "sample.ts", SAMPLE_TS);
        const analysis = analyzeModule(file);

        expect(analysis).not.toBeNull();
        expect(analysis!.language).toBe("typescript");
        expect(analysis!.lineCount).toBeGreaterThan(10);
        expect(analysis!.functions.length).toBeGreaterThanOrEqual(2);
        expect(analysis!.imports.length).toBe(2);
        expect(analysis!.exports.length).toBeGreaterThanOrEqual(2);
        expect(analysis!.complexity.score).toBeGreaterThan(0);
        expect(analysis!.complexity.functionCount).toBeGreaterThanOrEqual(2);
      } finally {
        cleanupDir(dir);
      }
    });

    it("should return null for non-existent files", () => {
      expect(analyzeModule("/nonexistent/file.ts")).toBeNull();
    });

    it("should detect async functions", () => {
      const dir = tempDir("analyze-async");
      try {
        const file = createTestFile(dir, "sample.ts", SAMPLE_TS);
        const analysis = analyzeModule(file);
        const asyncFuncs = analysis?.functions.filter((f) => f.isAsync) ?? [];
        expect(asyncFuncs.length).toBeGreaterThanOrEqual(1);
      } finally {
        cleanupDir(dir);
      }
    });

    it("should detect exported functions", () => {
      const dir = tempDir("analyze-exported");
      try {
        const file = createTestFile(dir, "sample.ts", SAMPLE_TS);
        const analysis = analyzeModule(file);
        const exported = analysis?.functions.filter((f) => f.isExported) ?? [];
        expect(exported.length).toBeGreaterThanOrEqual(1);
      } finally {
        cleanupDir(dir);
      }
    });
  });

  describe("analyzeDirectory", () => {
    it("should analyze all TS files in a directory", () => {
      const dir = tempDir("analyze-dir");
      try {
        createTestFile(dir, "a.ts", "export function a() { return 1; }");
        createTestFile(dir, "b.ts", "export function b() { return 2; }");
        createTestFile(dir, "c.test.ts", "// test file — should be skipped");

        const results = analyzeDirectory(dir);
        expect(results.length).toBe(2);
      } finally {
        cleanupDir(dir);
      }
    });
  });

  describe("diagnoseCodeIssues", () => {
    it("should detect complexity issues in a complex file", () => {
      const dir = tempDir("diagnose");
      try {
        // Create a complex file with deep nesting
        const complexCode = Array(100).fill("").map((_, i) =>
          i < 10 ? `if (x > ${i}) { if (y > ${i}) { if (z > ${i}) { console.log(${i}); } } }`
          : `const line${i} = ${i};`
        ).join("\n");
        const file = createTestFile(dir, "complex.ts", `export function complexFunc(x: number, y: number, z: number, a: number, b: number, c: number) {\n${complexCode}\n}`);

        const issues = diagnoseCodeIssues(file);
        expect(issues.length).toBeGreaterThan(0);
        // Should detect at least one complexity or style issue
        const hasComplexity = issues.some((i) => i.category === "complexity" || i.category === "style");
        expect(hasComplexity).toBe(true);
      } finally {
        cleanupDir(dir);
      }
    });

    it("should detect health-based issues", () => {
      const dir = tempDir("diagnose-health");
      try {
        const file = createTestFile(dir, "leaky.ts", SAMPLE_TS);
        const issues = diagnoseCodeIssues(file, { memoryUsagePct: 95 });
        const perfIssue = issues.find((i) => i.category === "performance");
        expect(perfIssue).toBeTruthy();
        expect(perfIssue!.severity).toBe("critical");
      } finally {
        cleanupDir(dir);
      }
    });

    it("should register issues globally", () => {
      const dir = tempDir("diagnose-registry");
      try {
        const file = createTestFile(dir, "test.ts", SAMPLE_TS);
        diagnoseCodeIssues(file, { memoryUsagePct: 90 });
        const registered = getRegisteredIssues();
        expect(registered.length).toBeGreaterThan(0);
      } finally {
        cleanupDir(dir);
      }
    });
  });

  describe("generateCodeFix", () => {
    it("should generate a patch for a complexity issue", () => {
      const issue = {
        id: "test-issue-1",
        filePath: "/test/file.ts",
        severity: "warning" as const,
        category: "complexity" as const,
        description: "Function too long",
        confidence: 0.8,
      };

      const patch = generateCodeFix(issue);
      expect(patch.id).toBeTruthy();
      expect(patch.targetFile).toBe("/test/file.ts");
      expect(patch.explanation).toBeTruthy();
      expect(patch.testSuggestions.length).toBeGreaterThan(0);
    });

    it("should assign higher risk to security fixes", () => {
      const secIssue = {
        id: "sec-1",
        filePath: "/test/file.ts",
        severity: "critical" as const,
        category: "security" as const,
        description: "Input not sanitized",
        confidence: 0.9,
      };

      const patch = generateCodeFix(secIssue);
      expect(patch.riskLevel).toBeGreaterThanOrEqual(0.7);
    });

    it("should track generated patches", () => {
      const issue = {
        id: "patch-track-1",
        filePath: "/test/file.ts",
        severity: "info" as const,
        category: "style" as const,
        description: "Style issue",
        confidence: 0.5,
      };

      generateCodeFix(issue);
      const patches = getGeneratedPatches();
      expect(patches.length).toBe(1);
    });
  });

  describe("reviewCodeDiff", () => {
    it("should score a small, clean diff highly", () => {
      const diff = `--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-const x = 1;\n+const x = 2;`;
      const result = reviewCodeDiff(diff);
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.verdict).toBe("approve");
      expect(result.strengths.length).toBeGreaterThan(0);
    });

    it("should penalize console.log additions", () => {
      const diff = `+console.log("debug");\n+const x = 1;`;
      const result = reviewCodeDiff(diff);
      expect(result.weaknesses).toContain("Contains console.log — remove debug statements");
    });

    it("should require tests when criteria specified", () => {
      const diff = `+const x = 1;`;
      const result = reviewCodeDiff(diff, { requireTests: true });
      expect(result.weaknesses.some((w) => w.includes("test"))).toBe(true);
    });
  });

  describe("councilReview", () => {
    it("should produce a multi-citizen review", () => {
      const proposal = {
        id: "proposal-1",
        diff: `--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n-const x = 1;\n+const x = 2;`,
        description: "Fix constant value",
      };

      const result = councilReview(proposal, 3);
      expect(result.votes.length).toBe(3);
      expect(result.consensus).toBeTruthy();
      expect(result.approvalRate).toBeGreaterThanOrEqual(0);
      expect(result.averageScore).toBeGreaterThan(0);
      expect(result.summary).toContain("Council");
    });
  });

  describe("createImprovementPlan", () => {
    it("should create a plan from analyses", () => {
      const dir = tempDir("plan");
      try {
        // Create files with varying quality
        createTestFile(dir, "good.ts", "export const x = 1;");
        const complexCode = Array(100).fill("const a = 1;").join("\n");
        createTestFile(dir, "bad.ts", `export function big() {\n${complexCode}\n}`);

        const analyses = analyzeDirectory(dir);
        const plan = createImprovementPlan(analyses, "Improve module quality");

        expect(plan.id).toBeTruthy();
        expect(plan.objective).toBe("Improve module quality");
        expect(plan.priority).toBeTruthy();
        expect(plan.estimatedEffort).toBeTruthy();
      } finally {
        cleanupDir(dir);
      }
    });
  });

  describe("validatePatch", () => {
    it("should validate a low-risk patch", () => {
      const patch = {
        id: "patch-1",
        targetFile: "/test/module.ts",
        issue: {
          id: "issue-1",
          filePath: "/test/module.ts",
          severity: "info" as const,
          category: "style" as const,
          description: "Minor style issue",
          confidence: 0.5,
        },
        diff: "+// added comment",
        explanation: "Style fix",
        riskLevel: 0.1,
        testSuggestions: [],
        createdAt: new Date().toISOString(),
      };

      const result = validatePatch(patch, ["module.test.ts"]);
      expect(result.valid).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(70);
    });

    it("should flag high-risk patches", () => {
      const patch = {
        id: "patch-2",
        targetFile: "/test/critical.ts",
        issue: {
          id: "issue-2",
          filePath: "/test/critical.ts",
          severity: "critical" as const,
          category: "security" as const,
          description: "Security vulnerability",
          confidence: 0.9,
        },
        diff: Array(120).fill("+fix line").join("\n"),
        explanation: "Security fix",
        riskLevel: 0.9,
        testSuggestions: [],
        createdAt: new Date().toISOString(),
      };

      const result = validatePatch(patch);
      expect(result.concerns.length).toBeGreaterThan(0);
    });
  });

  describe("diagnostics", () => {
    it("should track all activities", () => {
      const dir = tempDir("diag");
      try {
        const file = createTestFile(dir, "test.ts", SAMPLE_TS);
        analyzeModule(file);
        diagnoseCodeIssues(file);
        reviewCodeDiff("+const x = 1;");

        const diag = codeIntelligenceDiagnostics();
        expect(diag.totalAnalyses).toBeGreaterThanOrEqual(1);
        expect(diag.totalDiagnoses).toBeGreaterThanOrEqual(1);
        expect(diag.totalReviews).toBeGreaterThanOrEqual(1);
        expect(diag.recentActivity.length).toBeGreaterThan(0);
      } finally {
        cleanupDir(dir);
      }
    });

    it("should reset correctly", () => {
      resetCodeIntelligenceState();
      const diag = codeIntelligenceDiagnostics();
      expect(diag.totalAnalyses).toBe(0);
      expect(diag.totalPatchesGenerated).toBe(0);
    });
  });
});
