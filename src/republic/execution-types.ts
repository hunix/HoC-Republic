/**
 * Republic Platform — Execution Types & Helpers
 *
 * Shared types, factory helpers, execution history, and diagnostics
 * extracted from real-execution.ts for reuse across all execution-tools modules.
 */

import type { ModelDecision } from "./model-council.js";
import type { RepublicMode, Specialization } from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Execution Types ────────────────────────────────────────────

export type ExecutionStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface ExecutionResult {
  id: string;
  toolName: string;
  citizenId: string;
  projectId: string;
  status: ExecutionStatus;
  /** What was produced (file path, test output, review, etc.) */
  output: string;
  /** Files created or modified */
  filesAffected: string[];
  /** Model decision used */
  modelDecision: ModelDecision | null;
  /** Duration in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
  timestamp: string;
}

export interface ExecutionContext {
  citizenId: string;
  citizenName: string;
  specialization: Specialization;
  skillLevel: number;
  projectId: string;
  /** The Republic mode — only "real" mode triggers actual execution */
  mode: RepublicMode;
}

export type ToolExecutor = (
  args: Record<string, unknown>,
  ctx: ExecutionContext,
) => Promise<ExecutionResult>;

// ─── Execution History ──────────────────────────────────────────

const executionHistory: ExecutionResult[] = [];
const MAX_EXECUTION_HISTORY = 200;

export function recordExecution(result: ExecutionResult): void {
  executionHistory.push(result);
  if (executionHistory.length > MAX_EXECUTION_HISTORY) {
    executionHistory.splice(0, executionHistory.length - MAX_EXECUTION_HISTORY);
  }
}

// ─── Result Factories ───────────────────────────────────────────

export function makeFailResult(
  toolName: string,
  ctx: ExecutionContext,
  startTime: number,
  error: string,
): ExecutionResult {
  return {
    id: uid(),
    toolName,
    citizenId: ctx.citizenId,
    projectId: ctx.projectId,
    status: "failed",
    output: "",
    filesAffected: [],
    modelDecision: null,
    durationMs: Date.now() - startTime,
    error,
    timestamp: ts(),
  };
}

export function makeSuccessResult(
  toolName: string,
  ctx: ExecutionContext,
  startTime: number,
  output: string,
  filesAffected: string[] = [],
): ExecutionResult {
  return {
    id: uid(),
    toolName,
    citizenId: ctx.citizenId,
    projectId: ctx.projectId,
    status: "success",
    output,
    filesAffected,
    modelDecision: null,
    durationMs: Date.now() - startTime,
    timestamp: ts(),
  };
}

// ─── Utilities ──────────────────────────────────────────────────

export function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    cs: "csharp",
    cpp: "cpp",
    c: "c",
    php: "php",
    html: "html",
    css: "css",
    scss: "scss",
    sql: "sql",
    md: "markdown",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
  };
  return langMap[ext] ?? "text";
}

// ─── LLM Configuration helpers ──────────────────────────────────

export const envKey = (name: string) => process.env[name] || "";
export const OLLAMA_URL = () => process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
export const LMSTUDIO_URL = () => process.env.LMSTUDIO_URL ?? "http://127.0.0.1:1234";

// ─── Diagnostics ────────────────────────────────────────────────

export interface ExecutionDiagnostics {
  totalExecutions: number;
  byStatus: Record<ExecutionStatus, number>;
  byTool: Record<string, number>;
  averageDurationMs: number;
  failureRate: number;
  totalFilesCreated: number;
}

export function getExecutionDiagnostics() {
  const total = executionHistory.length || 1;
  const successCount = executionHistory.filter((e) => e.status === "success").length;
  const totalDuration = executionHistory.reduce((sum, e) => sum + e.durationMs, 0);

  // Collect unique LLM providers actually used in executions
  const providers = new Set<string>();
  for (const e of executionHistory) {
    const provider = e.modelDecision?.model?.provider;
    if (provider) {
      providers.add(provider);
    }
  }

  return {
    totalExecutions: executionHistory.length,
    successRate: successCount / total,
    avgDuration: Math.round(totalDuration / total),
    activeProviders: [...providers],
  };
}

/**
 * Get recent execution history, mapped to the UI-expected shape.
 */
export function getExecutionHistory(limit = 20) {
  return executionHistory.slice(-limit).map((e) => ({
    taskId: e.id,
    type: e.toolName,
    citizenId: e.citizenId,
    success: e.status === "success",
    duration: e.durationMs,
    startedAt: new Date(e.timestamp).getTime(),
    output: e.output || undefined,
  }));
}
