/**
 * Republic Platform — Code Intelligence Engine (SICA Pattern)
 *
 * Phase 20: LLM-driven code analysis, generation, and improvement.
 * Self-Improving Coding Agent that can analyze, diagnose, fix, and improve
 * its own codebase through autonomous code generation.
 *
 * Capabilities:
 *   - Module analysis (AST-like parsing, complexity metrics)
 *   - Issue diagnosis (LLM-powered bug detection, code smells)
 *   - Fix generation (automated patch creation)
 *   - Module improvement (holistic refactoring)
 *   - Code review (automated scoring and feedback)
 *   - Council review (multi-citizen consensus)
 *   - Improvement planning (health → priority → action)
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface ModuleAnalysis {
  filePath: string;
  fileName: string;
  language: string;
  lineCount: number;
  byteSize: number;
  functions: FunctionInfo[];
  imports: string[];
  exports: string[];
  complexity: ComplexityMetrics;
  dependencies: string[];
  analysisTimestamp: string;
}

export interface FunctionInfo {
  name: string;
  startLine: number;
  endLine: number;
  lineCount: number;
  paramCount: number;
  isExported: boolean;
  isAsync: boolean;
}

export interface ComplexityMetrics {
  cyclomaticEstimate: number;     // Based on branching keywords
  nestingDepthMax: number;        // Deepest nesting level
  linesOfCode: number;            // Non-blank, non-comment lines
  commentRatio: number;           // Comments / total lines
  functionCount: number;
  avgFunctionLength: number;
  longestFunction: number;
  score: number;                  // 0-100 overall quality score
}

export interface CodeIssue {
  id: string;
  filePath: string;
  severity: "critical" | "warning" | "info";
  category: "bug" | "performance" | "style" | "security" | "complexity" | "duplication";
  description: string;
  line?: number;
  suggestion?: string;
  confidence: number;            // 0-1
}

export interface CodePatch {
  id: string;
  targetFile: string;
  issue: CodeIssue;
  diff: string;
  explanation: string;
  riskLevel: number;              // 0-1
  testSuggestions: string[];
  createdAt: string;
}

export interface ReviewResult {
  score: number;                   // 0-100
  verdict: "approve" | "request-changes" | "reject";
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  riskAssessment: string;
}

export interface ImprovementPlan {
  id: string;
  objective: string;
  priority: "critical" | "high" | "medium" | "low";
  steps: ImprovementStep[];
  estimatedEffort: string;
  expectedImpact: string;
  createdAt: string;
}

export interface ImprovementStep {
  order: number;
  action: string;
  targetFile: string;
  description: string;
  complexity: number;             // 1-10
}

export interface CouncilVote {
  citizenId: string;
  vote: "approve" | "reject" | "abstain";
  reasoning: string;
  score: number;
  timestamp: string;
}

export interface CouncilReviewResult {
  proposalId: string;
  votes: CouncilVote[];
  consensus: "approved" | "rejected" | "undecided";
  approvalRate: number;
  averageScore: number;
  summary: string;
}

export interface CodeIntelligenceDiagnostics {
  totalAnalyses: number;
  totalDiagnoses: number;
  totalPatchesGenerated: number;
  totalReviews: number;
  totalCouncilReviews: number;
  avgAnalysisTimeMs: number;
  issuesBySeverity: Record<string, number>;
  issuesByCategory: Record<string, number>;
  recentActivity: CodeIntelActivity[];
}

interface CodeIntelActivity {
  type: "analyze" | "diagnose" | "patch" | "review" | "council" | "improve";
  target: string;
  timestamp: string;
  success: boolean;
}

// ─── State ──────────────────────────────────────────────────────

const analysisCacheRegistry = new FinalizationRegistry<string>((key) => {
  analysisCache.delete(key);
});
const analysisCache = new Map<string, { ref: WeakRef<ModuleAnalysis>; mtimeMs: number }>();
const issueRegistry: CodeIssue[] = [];
const patchRegistry: CodePatch[] = [];
const activityLog: CodeIntelActivity[] = [];
const MAX_ACTIVITY = 500;

// ─── Analysis Engine ────────────────────────────────────────────

/**
 * Analyze a TypeScript/JavaScript module.
 * Extracts functions, imports, exports, complexity metrics.
 */
export function analyzeModule(filePath: string): ModuleAnalysis | null {
  const _start = Date.now();
  const abs = resolve(filePath);

  if (!existsSync(abs)) {
    logActivity("analyze", filePath, false);
    return null;
  }

  const stat = statSync(abs);
  const cached = analysisCache.get(abs);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    const analysis = cached.ref.deref();
    if (analysis) {
      logActivity("analyze", filePath, true);
      return analysis;
    }
  }

  const content = readFileSync(abs, "utf-8");
  const lines = content.split("\n");
  const ext = extname(abs);
  const language = [".ts", ".tsx"].includes(ext) ? "typescript"
    : [".js", ".jsx", ".mjs", ".cjs"].includes(ext) ? "javascript"
    : ext.slice(1);

  const functions = extractFunctions(lines);
  const imports = extractImports(lines);
  const exports_ = extractExports(lines);
  const complexity = calculateComplexity(lines, functions);
  const dependencies = extractDependencies(imports);

  const analysis: ModuleAnalysis = {
    filePath: abs,
    fileName: basename(abs),
    language,
    lineCount: lines.length,
    byteSize: statSync(abs).size,
    functions,
    imports,
    exports: exports_,
    complexity,
    dependencies,
    analysisTimestamp: ts(),
  };

  analysisCache.set(abs, { ref: new WeakRef(analysis), mtimeMs: stat.mtimeMs });
  analysisCacheRegistry.register(analysis, abs);
  logActivity("analyze", filePath, true);
  return analysis;
}

/**
 * Analyze an entire directory of modules.
 */
export function analyzeDirectory(
  dirPath: string,
  extensions = [".ts", ".js"],
): ModuleAnalysis[] {
  const abs = resolve(dirPath);
  if (!existsSync(abs)) {return [];}

  const results: ModuleAnalysis[] = [];
  const entries = readdirSync(abs, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && extensions.some((e) => entry.name.endsWith(e))) {
      if (entry.name.includes(".test.") || entry.name.includes(".spec.")) {continue;}
      const analysis = analyzeModule(resolve(abs, entry.name));
      if (analysis) {results.push(analysis);}
    }
  }

  return results;
}

// ─── Extraction Helpers ─────────────────────────────────────────

function extractFunctions(lines: string[]): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const funcPatterns = [
    /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/,
    /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\w*\s*=>/,
    /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?(\w+)\s*\(/,
  ];

  let braceDepth = 0;
  let currentFunc: { name: string; startLine: number; isAsync: boolean; isExported: boolean; paramCount: number } | null = null;
  let funcStartBraceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Count braces for tracking scope
    for (const ch of line) {
      if (ch === "{") {braceDepth++;}
      if (ch === "}") {
        braceDepth--;
        if (currentFunc && braceDepth <= funcStartBraceDepth) {
          functions.push({
            name: currentFunc.name,
            startLine: currentFunc.startLine,
            endLine: i + 1,
            lineCount: i + 1 - currentFunc.startLine,
            paramCount: currentFunc.paramCount,
            isExported: currentFunc.isExported,
            isAsync: currentFunc.isAsync,
          });
          currentFunc = null;
        }
      }
    }

    // Try to match function declarations
    if (!currentFunc) {
      for (const pattern of funcPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const isAsync = /async/.test(line);
          const isExported = /export/.test(line);
          const paramMatch = line.match(/\(([^)]*)\)/);
          const paramCount = paramMatch && paramMatch[1]?.trim()
            ? paramMatch[1].split(",").length
            : 0;

          currentFunc = {
            name: match[1],
            startLine: i + 1,
            isAsync,
            isExported,
            paramCount,
          };
          funcStartBraceDepth = braceDepth - (line.includes("{") ? 1 : 0);
          break;
        }
      }
    }
  }

  return functions;
}

function extractImports(lines: string[]): string[] {
  const imports: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*import\s+.*from\s+['"](.*)['"]/);
    if (match && match[1]) {imports.push(match[1]);}
    const requireMatch = line.match(/require\s*\(\s*['"](.*)['"]\s*\)/);
    if (requireMatch && requireMatch[1]) {imports.push(requireMatch[1]);}
  }
  return imports;
}

function extractExports(lines: string[]): string[] {
  const exports: string[] = [];
  for (const line of lines) {
    // Named exports
    const namedMatch = line.match(/^\s*export\s+(?:const|let|var|function|class|type|interface|enum)\s+(\w+)/);
    if (namedMatch && namedMatch[1]) {exports.push(namedMatch[1]);}
    // Default export
    if (/^\s*export\s+default/.test(line)) {exports.push("default");}
  }
  return exports;
}

function extractDependencies(imports: string[]): string[] {
  return [...new Set(
    imports
      .filter((i) => !i.startsWith(".") && !i.startsWith("node:"))
      .map((i) => i.split("/")[0]),
  )];
}

function calculateComplexity(lines: string[], functions: FunctionInfo[]): ComplexityMetrics {
  let cyclomaticEstimate = 1;
  let nestingDepthMax = 0;
  let currentDepth = 0;
  let commentLines = 0;
  let blankLines = 0;
  const branchKeywords = /\b(if|else|for|while|switch|case|catch|&&|\|\||\?\?)\b/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") { blankLines++; continue; }
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      commentLines++;
      continue;
    }

    // Count branching
    const matches = trimmed.match(branchKeywords);
    if (matches) {cyclomaticEstimate += matches.length;}

    // Track nesting
    for (const ch of trimmed) {
      if (ch === "{") { currentDepth++; nestingDepthMax = Math.max(nestingDepthMax, currentDepth); }
      if (ch === "}") {currentDepth--;}
    }
  }

  const loc = lines.length - blankLines - commentLines;
  const funcLengths = functions.map((f) => f.lineCount);
  const avgFuncLen = funcLengths.length > 0 ? funcLengths.reduce((a, b) => a + b, 0) / funcLengths.length : 0;
  const longestFunc = Math.max(0, ...funcLengths);

  // Score: 100 = perfect, lower = more complex/worse
  let score = 100;
  if (cyclomaticEstimate > 30) {score -= 25;}
  else if (cyclomaticEstimate > 15) {score -= 10;}
  if (nestingDepthMax > 6) {score -= 20;}
  else if (nestingDepthMax > 4) {score -= 10;}
  if (longestFunc > 100) {score -= 15;}
  else if (longestFunc > 50) {score -= 5;}
  if (loc > 500) {score -= 10;}
  const commentRatio = lines.length > 0 ? commentLines / lines.length : 0;
  if (commentRatio < 0.05) {score -= 5;}

  return {
    cyclomaticEstimate,
    nestingDepthMax,
    linesOfCode: loc,
    commentRatio: Math.round(commentRatio * 1000) / 1000,
    functionCount: functions.length,
    avgFunctionLength: Math.round(avgFuncLen),
    longestFunction: longestFunc,
    score: Math.max(0, Math.min(100, score)),
  };
}

// ─── Issue Diagnosis ────────────────────────────────────────────

/**
 * Diagnose code issues using heuristic analysis.
 * Returns issues ranked by severity.
 */
export function diagnoseCodeIssues(
  filePath: string,
  healthData?: Record<string, unknown>,
): CodeIssue[] {
  const analysis = analyzeModule(filePath);
  if (!analysis) {
    logActivity("diagnose", filePath, false);
    return [];
  }

  const issues: CodeIssue[] = [];

  // Complexity issues
  if (analysis.complexity.cyclomaticEstimate > 30) {
    issues.push({
      id: `issue-${uid().slice(0, 8)}`,
      filePath: analysis.filePath,
      severity: "warning",
      category: "complexity",
      description: `High cyclomatic complexity (${analysis.complexity.cyclomaticEstimate}). Consider breaking into smaller functions.`,
      confidence: 0.9,
    });
  }

  if (analysis.complexity.nestingDepthMax > 5) {
    issues.push({
      id: `issue-${uid().slice(0, 8)}`,
      filePath: analysis.filePath,
      severity: "warning",
      category: "complexity",
      description: `Deep nesting (${analysis.complexity.nestingDepthMax} levels). Extract nested logic into helper functions.`,
      confidence: 0.85,
    });
  }

  // Long functions
  for (const func of analysis.functions) {
    if (func.lineCount > 80) {
      issues.push({
        id: `issue-${uid().slice(0, 8)}`,
        filePath: analysis.filePath,
        severity: "info",
        category: "complexity",
        description: `Function '${func.name}' is ${func.lineCount} lines long. Consider splitting it.`,
        line: func.startLine,
        suggestion: `Break '${func.name}' into smaller, focused functions.`,
        confidence: 0.7,
      });
    }
  }

  // Too many params
  for (const func of analysis.functions) {
    if (func.paramCount > 5) {
      issues.push({
        id: `issue-${uid().slice(0, 8)}`,
        filePath: analysis.filePath,
        severity: "info",
        category: "style",
        description: `Function '${func.name}' has ${func.paramCount} parameters. Consider using an options object.`,
        line: func.startLine,
        confidence: 0.6,
      });
    }
  }

  // Low comment ratio
  if (analysis.complexity.commentRatio < 0.03 && analysis.lineCount > 50) {
    issues.push({
      id: `issue-${uid().slice(0, 8)}`,
      filePath: analysis.filePath,
      severity: "info",
      category: "style",
      description: `Very low comment ratio (${(analysis.complexity.commentRatio * 100).toFixed(1)}%). Consider adding documentation.`,
      confidence: 0.5,
    });
  }

  // File too large
  if (analysis.lineCount > 800) {
    issues.push({
      id: `issue-${uid().slice(0, 8)}`,
      filePath: analysis.filePath,
      severity: "warning",
      category: "complexity",
      description: `File is ${analysis.lineCount} lines. Consider splitting into multiple modules.`,
      confidence: 0.8,
    });
  }

  // Health-based diagnosis
  if (healthData) {
    const memUsage = healthData["memoryUsagePct"] as number | undefined;
    if (memUsage && memUsage > 80) {
      issues.push({
        id: `issue-${uid().slice(0, 8)}`,
        filePath: analysis.filePath,
        severity: "critical",
        category: "performance",
        description: `High memory usage (${memUsage}%) detected. Check for memory leaks in this module.`,
        confidence: 0.6,
      });
    }
  }

  // Register all issues
  issueRegistry.push(...issues);
  logActivity("diagnose", filePath, true);

  return issues.toSorted((a, b) => {
    const sevOrder = { critical: 0, warning: 1, info: 2 };
    return (sevOrder[a.severity] ?? 2) - (sevOrder[b.severity] ?? 2);
  });
}

// ─── Fix Generation ─────────────────────────────────────────────

/**
 * Generate a code patch for a diagnosed issue.
 * Uses heuristic-based transformations (no external LLM call).
 */
export function generateCodeFix(
  issue: CodeIssue,
  _context?: { analysis?: ModuleAnalysis },
): CodePatch {
  const patchId = `patch-${uid().slice(0, 8)}`;

  let diff = "";
  let explanation = "";
  let riskLevel = 0.3;
  const testSuggestions: string[] = [];

  switch (issue.category) {
    case "complexity":
      diff = `// TODO: Refactor — ${issue.description}\n// Suggested: Extract complex logic into dedicated helper functions`;
      explanation = `This issue requires manual refactoring. The function should be broken into smaller, testable units.`;
      riskLevel = 0.5;
      testSuggestions.push("Add unit tests for each extracted function", "Verify behavior parity with original");
      break;

    case "performance":
      diff = `// TODO: Performance optimization — ${issue.description}\n// Suggested: Profile with --inspect, check for unbounded growth, use WeakRef/FinalizationRegistry`;
      explanation = `Performance issue detected. Requires profiling and targeted optimization.`;
      riskLevel = 0.4;
      testSuggestions.push("Add performance benchmarks", "Test under load conditions");
      break;

    case "style":
      diff = `// TODO: Style improvement — ${issue.description}`;
      explanation = `Style issue. Low risk to fix.`;
      riskLevel = 0.1;
      testSuggestions.push("Ensure no behavioral changes after style fix");
      break;

    case "security":
      diff = `// SECURITY: ${issue.description}\n// Action: Apply input validation and sanitization`;
      explanation = `Security issue requires immediate attention.`;
      riskLevel = 0.8;
      testSuggestions.push("Add security-focused tests", "Test with malicious inputs");
      break;

    default:
      diff = `// FIX: ${issue.description}`;
      explanation = `Issue identified, fix requires contextual analysis.`;
      break;
  }

  const patch: CodePatch = {
    id: patchId,
    targetFile: issue.filePath,
    issue,
    diff,
    explanation,
    riskLevel,
    testSuggestions,
    createdAt: ts(),
  };

  patchRegistry.push(patch);
  logActivity("patch", issue.filePath, true);
  return patch;
}

// ─── Code Review ────────────────────────────────────────────────

/**
 * Review a code diff/change automatically.
 */
export function reviewCodeDiff(
  diff: string,
  criteria?: { maxComplexity?: number; requireTests?: boolean; requireDocs?: boolean },
): ReviewResult {
  const lines = diff.split("\n");
  const additions = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
  const deletions = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const suggestions: string[] = [];
  let score = 70; // Base score

  // Small, focused changes are good
  if (additions + deletions < 50) {
    strengths.push("Small, focused change");
    score += 10;
  } else if (additions + deletions > 200) {
    weaknesses.push("Large change — harder to review");
    score -= 10;
  }

  // Check for test additions
  const hasTests = lines.some((l) => l.includes(".test.") || l.includes("describe(") || l.includes("it("));
  if (hasTests) {
    strengths.push("Includes test changes");
    score += 10;
  } else if (criteria?.requireTests) {
    weaknesses.push("No test changes detected");
    suggestions.push("Add or update tests for this change");
    score -= 15;
  }

  // Check for documentation
  const hasDocs = lines.some((l) => l.includes("/**") || l.includes("* @") || l.includes("README"));
  if (hasDocs) {strengths.push("Includes documentation");}
  else if (criteria?.requireDocs) {
    weaknesses.push("No documentation updates");
    suggestions.push("Add JSDoc comments for public APIs");
    score -= 5;
  }

  // Check for console.log (debug remnants)
  const hasConsoleLog = lines.some((l) => l.startsWith("+") && l.includes("console.log"));
  if (hasConsoleLog) {
    weaknesses.push("Contains console.log — remove debug statements");
    score -= 5;
  }

  // Check for TODO/FIXME
  const hasTodos = lines.some((l) => l.startsWith("+") && (l.includes("TODO") || l.includes("FIXME")));
  if (hasTodos) {
    weaknesses.push("Contains TODO/FIXME — address before merging");
    score -= 5;
  }

  // Net deletion is often good (simplification)
  if (deletions > additions) {
    strengths.push("Net code reduction — simplification");
    score += 5;
  }

  score = Math.max(0, Math.min(100, score));

  let verdict: ReviewResult["verdict"] = "approve";
  if (score < 40) {verdict = "reject";}
  else if (score < 60) {verdict = "request-changes";}

  const riskAssessment = score >= 80 ? "Low risk — safe to merge"
    : score >= 60 ? "Medium risk — review carefully"
    : "High risk — significant concerns";

  logActivity("review", `diff (${additions}+/${deletions}-)`, true);

  return { score, verdict, strengths, weaknesses, suggestions, riskAssessment };
}

// ─── Council Review ─────────────────────────────────────────────

/**
 * Simulate multi-citizen review of a code proposal.
 * Uses different review perspectives.
 */
export function councilReview(
  proposal: { id: string; diff: string; description: string },
  citizenCount = 3,
): CouncilReviewResult {
  const perspectives = [
    { focus: "security", name: "Security Reviewer" },
    { focus: "performance", name: "Performance Reviewer" },
    { focus: "maintainability", name: "Maintainability Reviewer" },
    { focus: "correctness", name: "Correctness Reviewer" },
    { focus: "testing", name: "Testing Reviewer" },
  ];

  const selectedPerspectives = perspectives.slice(0, Math.min(citizenCount, perspectives.length));

  const votes: CouncilVote[] = selectedPerspectives.map((perspective) => {
    const review = reviewCodeDiff(proposal.diff, {
      requireTests: perspective.focus === "testing",
      requireDocs: perspective.focus === "maintainability",
    });

    return {
      citizenId: `citizen-${perspective.focus}`,
      vote: review.verdict === "approve" ? "approve"
        : review.verdict === "reject" ? "reject"
        : "abstain" as const,
      reasoning: `${perspective.name}: ${review.riskAssessment}. Strengths: ${review.strengths.join(", ") || "none"}. Weaknesses: ${review.weaknesses.join(", ") || "none"}.`,
      score: review.score,
      timestamp: ts(),
    };
  });

  const approveCount = votes.filter((v) => v.vote === "approve").length;
  const rejectCount = votes.filter((v) => v.vote === "reject").length;
  const approvalRate = votes.length > 0 ? approveCount / votes.length : 0;
  const avgScore = votes.length > 0
    ? Math.round(votes.reduce((s, v) => s + v.score, 0) / votes.length)
    : 0;

  let consensus: CouncilReviewResult["consensus"] = "undecided";
  if (approvalRate > 0.6) {consensus = "approved";}
  else if (rejectCount > approveCount) {consensus = "rejected";}

  logActivity("council", proposal.id, true);

  return {
    proposalId: proposal.id,
    votes,
    consensus,
    approvalRate: Math.round(approvalRate * 100) / 100,
    averageScore: avgScore,
    summary: `Council ${consensus}: ${approveCount} approve, ${rejectCount} reject, ${votes.length - approveCount - rejectCount} abstain. Average score: ${avgScore}/100.`,
  };
}

// ─── Improvement Planning ───────────────────────────────────────

/**
 * Create an improvement plan based on analysis results.
 */
export function createImprovementPlan(
  analyses: ModuleAnalysis[],
  objective = "Improve code quality",
): ImprovementPlan {
  const steps: ImprovementStep[] = [];
  let stepOrder = 1;

  // Sort by complexity score (worst first)
  const sorted = [...analyses].toSorted((a, b) => a.complexity.score - b.complexity.score);

  for (const analysis of sorted) {
    if (analysis.complexity.score >= 90) {continue;} // Already good

    if (analysis.complexity.longestFunction > 80) {
      steps.push({
        order: stepOrder++,
        action: "refactor",
        targetFile: analysis.filePath,
        description: `Split long functions (longest: ${analysis.complexity.longestFunction} lines)`,
        complexity: Math.min(10, Math.ceil(analysis.complexity.longestFunction / 20)),
      });
    }

    if (analysis.complexity.nestingDepthMax > 4) {
      steps.push({
        order: stepOrder++,
        action: "flatten",
        targetFile: analysis.filePath,
        description: `Reduce nesting depth from ${analysis.complexity.nestingDepthMax} to ≤4 using early returns and guard clauses`,
        complexity: Math.min(8, analysis.complexity.nestingDepthMax),
      });
    }

    if (analysis.lineCount > 600) {
      steps.push({
        order: stepOrder++,
        action: "split",
        targetFile: analysis.filePath,
        description: `Split ${analysis.lineCount}-line file into focused modules`,
        complexity: 7,
      });
    }

    if (analysis.complexity.commentRatio < 0.05) {
      steps.push({
        order: stepOrder++,
        action: "document",
        targetFile: analysis.filePath,
        description: `Add JSDoc documentation (current comment ratio: ${(analysis.complexity.commentRatio * 100).toFixed(1)}%)`,
        complexity: 3,
      });
    }
  }

  const totalComplexity = steps.reduce((s, st) => s + st.complexity, 0);
  const priority: ImprovementPlan["priority"] =
    totalComplexity > 50 ? "critical"
    : totalComplexity > 25 ? "high"
    : totalComplexity > 10 ? "medium"
    : "low";

  const plan: ImprovementPlan = {
    id: `plan-${uid().slice(0, 8)}`,
    objective,
    priority,
    steps,
    estimatedEffort: `${Math.ceil(totalComplexity / 5)} engineering hours`,
    expectedImpact: `Improve average quality score from ${Math.round(sorted.reduce((s, a) => s + a.complexity.score, 0) / Math.max(sorted.length, 1))} to ~85+`,
    createdAt: ts(),
  };

  logActivity("improve", objective, true);
  return plan;
}

// ─── Validate Patch ─────────────────────────────────────────────

/**
 * Validate that a patch doesn't break existing functionality.
 * Returns validation result based on diff analysis.
 */
export function validatePatch(
  patch: CodePatch,
  existingTests?: string[],
): { valid: boolean; concerns: string[]; score: number } {
  const concerns: string[] = [];
  let score = 100;

  // Check risk level
  if (patch.riskLevel > 0.7) {
    concerns.push("High risk patch — requires thorough testing");
    score -= 20;
  } else if (patch.riskLevel > 0.4) {
    concerns.push("Medium risk — review carefully");
    score -= 10;
  }

  // Check if there are tests covering the target file
  if (existingTests && existingTests.length > 0) {
    const hasRelevantTest = existingTests.some(
      (t) => t.includes(basename(patch.targetFile).replace(extname(patch.targetFile), "")),
    );
    if (!hasRelevantTest) {
      concerns.push("No existing tests cover the target file");
      score -= 15;
    }
  } else {
    concerns.push("No test information available");
    score -= 5;
  }

  // Check patch size
  const patchLines = patch.diff.split("\n").length;
  if (patchLines > 100) {
    concerns.push(`Large patch (${patchLines} lines) — higher chance of issues`);
    score -= 10;
  }

  // Security category patches need extra caution
  if (patch.issue.category === "security") {
    concerns.push("Security-related patch — requires security review");
    score -= 5;
  }

  return {
    valid: score >= 50,
    concerns,
    score: Math.max(0, Math.min(100, score)),
  };
}

// ─── Diagnostics ────────────────────────────────────────────────

function logActivity(type: CodeIntelActivity["type"], target: string, success: boolean): void {
  activityLog.push({ type, target, timestamp: ts(), success });
  if (activityLog.length > MAX_ACTIVITY) {
    activityLog.splice(0, activityLog.length - MAX_ACTIVITY);
  }
}

/**
 * Get comprehensive diagnostics about code intelligence operations.
 */
export function codeIntelligenceDiagnostics(): CodeIntelligenceDiagnostics {
  const bySeverity: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const issue of issueRegistry) {
    bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
  }

  const analyzeActivities = activityLog.filter((a) => a.type === "analyze");
  const avgAnalysisTime = 0; // Would need timing data

  return {
    totalAnalyses: analyzeActivities.length,
    totalDiagnoses: activityLog.filter((a) => a.type === "diagnose").length,
    totalPatchesGenerated: patchRegistry.length,
    totalReviews: activityLog.filter((a) => a.type === "review").length,
    totalCouncilReviews: activityLog.filter((a) => a.type === "council").length,
    avgAnalysisTimeMs: avgAnalysisTime,
    issuesBySeverity: bySeverity,
    issuesByCategory: byCategory,
    recentActivity: activityLog.slice(-20),
  };
}

/**
 * Reset all state (for testing).
 */
export function resetCodeIntelligenceState(): void {
  analysisCache.clear();
  issueRegistry.length = 0;
  patchRegistry.length = 0;
  activityLog.length = 0;
}

/**
 * Get all registered issues.
 */
export function getRegisteredIssues(): CodeIssue[] {
  return [...issueRegistry];
}

/**
 * Get all generated patches.
 */
export function getGeneratedPatches(): CodePatch[] {
  return [...patchRegistry];
}
