/**
 * Dev Orchestration — QA Validator and Auto-Fixer
 */

import type { DevProject } from "./types.js";
import { pick, rand, rng, ts } from "../utils.js";

// ─── QA Validator ───────────────────────────────────────────────

export interface QAResult {
  passed: boolean;
  score: number; // 0-100
  issues: QAIssue[];
  autoFixable: number;
  timestamp: string;
}

export interface QAIssue {
  severity: "error" | "warning" | "info";
  category: "syntax" | "logic" | "security" | "performance" | "style" | "accessibility";
  file: string;
  line: number;
  message: string;
  fixSuggestion: string | null;
}

/** Run QA validation on a project, producing a quality report */
export function runQAValidation(project: DevProject, skillLevel: number): QAResult {
  const issueCount = Math.max(0, rand(0, 15) - Math.floor(skillLevel * 2));
  const categories: QAIssue["category"][] = [
    "syntax",
    "logic",
    "security",
    "performance",
    "style",
    "accessibility",
  ];
  const severities: QAIssue["severity"][] = ["error", "warning", "info"];

  const issues: QAIssue[] = [];
  for (let i = 0; i < issueCount; i++) {
    const category = pick(categories);
    const severity = pick(severities);
    issues.push({
      severity,
      category,
      file: project.files.length > 0 ? pick(project.files).path : "src/index.ts",
      line: rand(1, 500),
      message: generateIssueMessage(category, severity),
      fixSuggestion: rng() > 0.3 ? generateFixSuggestion(category) : null,
    });
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const score = Math.max(0, 100 - errors * 15 - warnings * 5 - issues.length);
  const autoFixable = issues.filter((i) => i.fixSuggestion !== null).length;

  return {
    passed: errors === 0,
    score,
    issues,
    autoFixable,
    timestamp: ts(),
  };
}

function generateIssueMessage(
  category: QAIssue["category"],
  severity: QAIssue["severity"],
): string {
  const messages: Record<string, string[]> = {
    syntax: [
      "Missing semicolon",
      "Unexpected token",
      "Invalid type annotation",
      "Unclosed bracket",
    ],
    logic: [
      "Potential null dereference",
      "Unreachable code path",
      "Infinite loop risk",
      "Race condition detected",
    ],
    security: [
      "SQL injection vulnerability",
      "XSS via unsanitized input",
      "Hardcoded secret detected",
      "Insecure dependency",
    ],
    performance: [
      "O(n²) loop detected",
      "Unnecessary re-render",
      "Memory leak in event listener",
      "Unoptimized query",
    ],
    style: [
      "Inconsistent naming convention",
      "Function too long (>50 lines)",
      "Missing JSDoc comment",
      "Unused import",
    ],
    accessibility: [
      "Missing alt attribute",
      "Low contrast ratio",
      "Missing aria-label",
      "Non-keyboard-accessible element",
    ],
  };
  const pool = messages[category] ?? ["Unknown issue"];
  return `[${severity.toUpperCase()}] ${pick(pool)}`;
}

function generateFixSuggestion(category: QAIssue["category"]): string {
  const fixes: Record<string, string[]> = {
    syntax: ["Add missing delimiter", "Fix type annotation", "Close bracket"],
    logic: ["Add null check", "Refactor conditional logic", "Add mutex/lock"],
    security: ["Use parameterized queries", "Sanitize user input", "Move secret to env vars"],
    performance: ["Use Map/Set for lookups", "Memoize computation", "Add debouncing"],
    style: ["Rename to camelCase", "Extract into smaller function", "Add documentation"],
    accessibility: ["Add descriptive alt text", "Increase contrast to 4.5:1", "Add aria-label"],
  };
  const pool = fixes[category] ?? ["Review and fix manually"];
  return pick(pool);
}

// ─── Auto-Fixer ─────────────────────────────────────────────────

export interface AutoFixResult {
  issuesFixed: number;
  issuesRemaining: number;
  fixedFiles: string[];
  qualityBefore: number;
  qualityAfter: number;
  timestamp: string;
}

/** Attempt to auto-fix QA issues. Success rate depends on citizen skill level. */
export function autoFixIssues(
  project: DevProject,
  qaResult: QAResult,
  skillLevel: number,
): AutoFixResult {
  const fixableIssues = qaResult.issues.filter((i) => i.fixSuggestion !== null);
  const fixRate = Math.min(1, 0.5 + skillLevel * 0.1);
  let fixed = 0;
  const fixedFiles = new Set<string>();

  for (const issue of fixableIssues) {
    if (rng() < fixRate) {
      fixed++;
      fixedFiles.add(issue.file);
    }
  }

  const qualityBefore = project.codeQuality;
  const qualityAfter = Math.min(1, qualityBefore + fixed * 0.02);
  project.codeQuality = qualityAfter;

  return {
    issuesFixed: fixed,
    issuesRemaining: qaResult.issues.length - fixed,
    fixedFiles: [...fixedFiles],
    qualityBefore,
    qualityAfter,
    timestamp: ts(),
  };
}
