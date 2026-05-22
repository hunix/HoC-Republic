/**
 * Code Interpreter — Types
 *
 * Structured execution results with stdout, files, images, and charts.
 */

// ─── Execution ───────────────────────────────────────────────────

export type InterpreterLanguage = "python" | "javascript" | "typescript" | "bash";

export interface ExecutionRequest {
  /** Code to execute */
  code: string;
  /** Language (default: python) */
  language?: InterpreterLanguage;
  /** Working directory */
  cwd?: string;
  /** Timeout in seconds */
  timeoutSec?: number;
  /** Files to upload before execution (name → base64 content) */
  inputFiles?: Record<string, string>;
  /** Whether to capture generated files */
  captureOutputFiles?: boolean;
}

export interface OutputFile {
  /** File path relative to workspace */
  path: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
  /** Base64-encoded content (for images/small files < 2MB) */
  base64?: string;
}

export interface ExecutionResult {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Execution time in ms */
  durationMs: number;
  /** Files generated during execution */
  outputFiles: OutputFile[];
  /** Whether execution was killed due to timeout */
  timedOut: boolean;
  /** Language used */
  language: InterpreterLanguage;
}

// ─── Diagnostics ─────────────────────────────────────────────────

export interface InterpreterDiagnostics {
  totalExecutions: number;
  successRate: number;
  avgDurationMs: number;
  languageBreakdown: Record<string, number>;
  totalFilesGenerated: number;
}
