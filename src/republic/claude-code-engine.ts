/**
 * Claude Code Engine — Claude CLI Adapter
 *
 * Wraps the `claude` CLI binary (Anthropic's Claude Code tool) for use
 * by the Republic's Code Intelligence system and gateway RPC handlers.
 *
 * ALL functions are safe to call even when the CLI is not installed —
 * they return { available: false } or fall back to heuristic analysis.
 *
 * Install:  npm install -g @anthropic-ai/claude-code
 * Auth:     claude auth login
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { diagnoseCodeIssues, reviewCodeDiff } from "./code-intelligence.js";
import { ts, uid } from "./utils.js";

const execFileAsync = promisify(execFile);

// ─── Types ──────────────────────────────────────────────────────

export interface ClaudeReviewResult {
  /** false = CLI not installed or errored; used heuristic fallback */
  available: boolean;
  source: "claude-cli" | "heuristic";
  score?: number;
  verdict?: "approve" | "request-changes" | "reject";
  issues?: string[];
  suggestions?: string[];
  rawOutput?: string;
  error?: string;
  durationMs: number;
  reviewedAt: string;
}

export interface ClaudeAnalysisResult {
  available: boolean;
  source: "claude-cli" | "heuristic";
  output: string;
  error?: string;
  durationMs: number;
  analyzedAt: string;
}

export interface ClaudeTaskResult {
  available: boolean;
  ok: boolean;
  output: string;
  error?: string;
  exitCode?: number;
  durationMs: number;
  taskId: string;
  executedAt: string;
}

export interface ClaudeStatusResult {
  available: boolean;
  version: string | null;
  path: string | null;
  checkedAt: string;
}

// ─── CLI Detection ───────────────────────────────────────────────

let _availabilityCache: { available: boolean; path: string | null; checkedAt: number } | null =
  null;
const CACHE_TTL_MS = 60_000; // Re-check at most once per minute

/**
 * Detect if the `claude` CLI binary is available in PATH.
 * Result is cached for 60 seconds.
 */
export function isClaudeAvailable(): boolean {
  const now = Date.now();
  if (_availabilityCache && now - _availabilityCache.checkedAt < CACHE_TTL_MS) {
    return _availabilityCache.available;
  }

  // Try common install locations
  const candidates =
    process.platform === "win32" ? ["claude.cmd", "claude.ps1", "claude.exe"] : ["claude"];

  for (const candidate of candidates) {
    try {
      // On Windows, `where`; on Unix, `which`
      const { execSync } = require("node:child_process") as typeof import("node:child_process");
      const result = execSync(
        `${process.platform === "win32" ? "where" : "which"} ${candidate} 2>&1`,
        {
          encoding: "utf-8",
          timeout: 3000,
        },
      ).trim();
      if (result && !result.includes("not found") && !result.includes("Could not find")) {
        _availabilityCache = {
          available: true,
          path: result.split("\n")[0]?.trim() ?? null,
          checkedAt: now,
        };
        return true;
      }
    } catch {
      // not found
    }
  }

  _availabilityCache = { available: false, path: null, checkedAt: now };
  return false;
}

/** Invalidate the availability cache (e.g. after install). */
export function resetClaudeAvailabilityCache(): void {
  _availabilityCache = null;
}

// ─── Version ─────────────────────────────────────────────────────

/**
 * Get the installed claude CLI version string, or null if unavailable.
 */
export async function getClaudeStatus(): Promise<ClaudeStatusResult> {
  if (!isClaudeAvailable()) {
    return {
      available: false,
      version: null,
      path: null,
      checkedAt: ts(),
    };
  }

  try {
    const { stdout } = await execFileAsync("claude", ["--version"], { timeout: 5000 });
    const version = stdout.trim().split("\n")[0] ?? null;
    return {
      available: true,
      version,
      path: _availabilityCache?.path ?? null,
      checkedAt: ts(),
    };
  } catch {
    return {
      available: false,
      version: null,
      path: null,
      checkedAt: ts(),
    };
  }
}

// ─── File Review ─────────────────────────────────────────────────

export interface ReviewOpts {
  /** Extra prompt context to pass to claude review */
  context?: string;
  /** Timeout in ms (default: 60s) */
  timeoutMs?: number;
}

/**
 * Run `claude review` on a file using the Claude Code CLI.
 * Falls back to heuristic analysis if the CLI is unavailable.
 */
export async function claudeReview(
  filePath: string,
  opts?: ReviewOpts,
): Promise<ClaudeReviewResult> {
  const start = Date.now();

  if (!existsSync(filePath)) {
    return {
      available: isClaudeAvailable(),
      source: "heuristic",
      error: `File not found: ${filePath}`,
      issues: [`File not found: ${filePath}`],
      durationMs: Date.now() - start,
      reviewedAt: ts(),
    };
  }

  if (!isClaudeAvailable()) {
    return heuristicReviewFallback(filePath, start);
  }

  try {
    const args = ["review", filePath, "--output-format", "json"];
    if (opts?.context) {
      args.push("--context", opts.context);
    }

    const { stdout, stderr } = await execFileAsync("claude", args, {
      timeout: opts?.timeoutMs ?? 60_000,
      cwd: process.cwd(),
    });

    const raw = stdout.trim();

    // Attempt to parse JSON output from claude review
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        available: true,
        source: "claude-cli",
        score: typeof parsed["score"] === "number" ? parsed["score"] : undefined,
        verdict: parseVerdict(parsed["verdict"]),
        issues: Array.isArray(parsed["issues"])
          ? (parsed["issues"] as string[])
          : typeof parsed["issues"] === "string"
            ? [parsed["issues"] as string]
            : [],
        suggestions: Array.isArray(parsed["suggestions"])
          ? (parsed["suggestions"] as string[])
          : [],
        rawOutput: raw,
        durationMs: Date.now() - start,
        reviewedAt: ts(),
      };
    } catch {
      // Non-JSON output — treat as raw text review
      return {
        available: true,
        source: "claude-cli",
        rawOutput: raw || stderr,
        issues: extractIssuesFromText(raw),
        suggestions: extractSuggestionsFromText(raw),
        durationMs: Date.now() - start,
        reviewedAt: ts(),
      };
    }
  } catch (err) {
    // CLI failed — fall back to heuristic
    const result = heuristicReviewFallback(filePath, start);
    result.error = `claude CLI error: ${String(err)}`;
    return result;
  }
}

// ─── Analysis (prompt-based) ─────────────────────────────────────

/**
 * Run `claude -p "<prompt>"` piping a file as stdin.
 * Falls back to a static summary if CLI unavailable.
 */
export async function claudeAnalyze(
  filePath: string,
  prompt: string,
  timeoutMs = 60_000,
): Promise<ClaudeAnalysisResult> {
  const start = Date.now();

  if (!existsSync(filePath)) {
    return {
      available: false,
      source: "heuristic",
      output: `File not found: ${filePath}`,
      durationMs: Date.now() - start,
      analyzedAt: ts(),
    };
  }

  if (!isClaudeAvailable()) {
    return {
      available: false,
      source: "heuristic",
      output: `Claude CLI not available. Install with: npm install -g @anthropic-ai/claude-code`,
      durationMs: Date.now() - start,
      analyzedAt: ts(),
    };
  }

  try {
    const { readFileSync } = await import("node:fs");
    const content = readFileSync(filePath, "utf-8");

    // claude -p "<prompt>" reads from stdin
    const { stdout } = await execFileAsync("claude", ["-p", prompt], {
      timeout: timeoutMs,
      input: content,
      cwd: process.cwd(),
    } as Parameters<typeof execFileAsync>[2] & { input: string });

    return {
      available: true,
      source: "claude-cli",
      output: String(stdout).trim(),
      durationMs: Date.now() - start,
      analyzedAt: ts(),
    };
  } catch (err) {
    return {
      available: true,
      source: "claude-cli",
      output: "",
      error: String(err),
      durationMs: Date.now() - start,
      analyzedAt: ts(),
    };
  }
}

// ─── General Task ────────────────────────────────────────────────

/**
 * Run an arbitrary `claude -p "<task>"` invocation.
 * Used by citizens to request general coding assistance.
 */
export async function claudeTask(
  task: string,
  cwd?: string,
  timeoutMs = 120_000,
): Promise<ClaudeTaskResult> {
  const start = Date.now();
  const taskId = `claude-task-${uid().slice(0, 8)}`;

  if (!isClaudeAvailable()) {
    return {
      available: false,
      ok: false,
      output: "Claude CLI not available. Install with: npm install -g @anthropic-ai/claude-code",
      taskId,
      durationMs: Date.now() - start,
      executedAt: ts(),
    };
  }

  try {
    const { stdout } = await execFileAsync("claude", ["-p", task], {
      timeout: timeoutMs,
      cwd: cwd ?? process.cwd(),
    });

    return {
      available: true,
      ok: true,
      output: stdout.trim(),
      taskId,
      durationMs: Date.now() - start,
      executedAt: ts(),
    };
  } catch (err: unknown) {
    const e = err as { message?: string; code?: number; killed?: boolean };
    return {
      available: true,
      ok: false,
      output: "",
      error: e.killed ? "Task timed out" : (e.message ?? String(err)),
      exitCode: e.code,
      taskId,
      durationMs: Date.now() - start,
      executedAt: ts(),
    };
  }
}

// ─── Private Helpers ─────────────────────────────────────────────

function heuristicReviewFallback(filePath: string, start: number): ClaudeReviewResult {
  try {
    const issues = diagnoseCodeIssues(filePath);
    const diff = `# Static analysis of ${filePath} (${issues.length} issues found)`;
    const review = reviewCodeDiff(diff);
    return {
      available: false,
      source: "heuristic",
      score: review.score,
      verdict: review.verdict,
      issues: issues.map((i) => `[${i.severity}] ${i.description}`),
      suggestions: review.suggestions,
      durationMs: Date.now() - start,
      reviewedAt: ts(),
    };
  } catch {
    return {
      available: false,
      source: "heuristic",
      issues: ["Heuristic analysis unavailable"],
      durationMs: Date.now() - start,
      reviewedAt: ts(),
    };
  }
}

function parseVerdict(v: unknown): ClaudeReviewResult["verdict"] {
  if (v === "approve" || v === "request-changes" || v === "reject") {
    return v;
  }
  return undefined;
}

function extractIssuesFromText(text: string): string[] {
  const lines = text.split("\n");
  return lines
    .filter(
      (l) => /^[-*•]\s/.test(l) || /^\d+\.\s/.test(l) || /issue|error|problem|warning/i.test(l),
    )
    .map((l) => l.replace(/^[-*•\d.]\s+/, "").trim())
    .filter((l) => l.length > 10)
    .slice(0, 20);
}

function extractSuggestionsFromText(text: string): string[] {
  const lines = text.split("\n");
  return lines
    .filter((l) => /suggest|recommend|consider|should|could/i.test(l))
    .map((l) => l.trim())
    .filter((l) => l.length > 10)
    .slice(0, 10);
}
