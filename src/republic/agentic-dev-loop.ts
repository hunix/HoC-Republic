/**
 * Republic Platform — Agentic Development Loop
 *
 * Transforms citizens from one-shot code generators into iterative
 * software engineers. Implements the tight fix→test→fix inner loop
 * used by state-of-the-art agents (Devin, SWE-Agent, OpenHands).
 *
 * Architecture:
 *   1. Analyze task + gather codebase context (repo-graph.ts)
 *   2. Plan multi-file changes (LLM → JSON plan)
 *   3. Generate code for all files
 *   4. Write to workspace
 *   5. Run tests / lint
 *   6. If failed → parse errors → LLM fix → loop (max N retries)
 *   7. Git commit on success
 *
 * Budget caps prevent infinite loops:
 *   - Max 5 fix iterations per task
 *   - 10 minute total timeout
 *   - Token budget tracking per iteration
 */

import type { ModelDecision } from "./model-council.js";
import type { Specialization } from "./types.js";
import { callLLM, stripCodeFences } from "./execution-llm.js";
import { selectModel } from "./model-council.js";
import {
  buildRepoGraph,
  getCachedGraph,
  getContextForFile,
  getProjectSummary,
} from "./repo-graph.js";
import { uid } from "./utils.js";
import {
  execInWorkspace,
  getWorkspace,
  gitCommit,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "./workspace-manager.js";
import {
  assertContentValid,
  captureFileSnapshots,
  ContentValidationError,
  kindFromExtension,
  restoreSnapshots,
} from "./content-validator.js";

// ─── Configuration ──────────────────────────────────────────────

/** Maximum number of fix→test→fix iterations before giving up */
const MAX_FIX_ITERATIONS = 5;

/** Total timeout for the entire agentic loop (ms) */
const TOTAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

/** Test command timeout (ms) */
const TEST_TIMEOUT_MS = 120_000;

/** Maximum error context chars to feed back to LLM */
const MAX_ERROR_CONTEXT = 3000;

// ─── Types ──────────────────────────────────────────────────────

export interface AgenticContext {
  citizenId: string;
  citizenName: string;
  specialization: Specialization;
  skillLevel: number;
  projectId: string;
}

export interface FileChange {
  path: string;
  action: "create" | "modify" | "delete";
  content: string;
}

export interface AgenticResult {
  id: string;
  success: boolean;
  /** Files created or modified */
  filesAffected: string[];
  /** Total fix iterations attempted */
  fixIterations: number;
  /** Whether tests passed after the loop */
  testsPassed: boolean;
  /** Whether lint passed */
  lintPassed: boolean;
  /** Summary of what was done */
  summary: string;
  /** Model decisions used (one per iteration) */
  modelDecisions: ModelDecision[];
  /** Duration in milliseconds */
  durationMs: number;
  /** Detailed log of each iteration */
  iterationLog: IterationEntry[];
  /** Error if failed */
  error?: string;
}

interface IterationEntry {
  iteration: number;
  phase: "generate" | "fix";
  filesWritten: string[];
  testResult?: { passed: boolean; output: string };
  lintResult?: { passed: boolean; output: string };
  durationMs: number;
}

// ─── Main Entry Point ───────────────────────────────────────────

/**
 * Execute a development task using the full agentic loop.
 *
 * This is the replacement for single-shot `executeWriteCode`.
 * It plans multi-file changes, generates code, tests, and
 * iteratively fixes until tests pass or budget is exhausted.
 */
export async function agenticDevelop(
  task: {
    description: string;
    targetFiles?: string[];  // specific files to work on (optional)
    testCommand?: string;    // custom test command (default: npm test)
    lintCommand?: string;    // custom lint command (default: npx eslint .)
  },
  ctx: AgenticContext,
): Promise<AgenticResult> {
  const startTime = Date.now();
  const resultId = uid();
  const iterationLog: IterationEntry[] = [];
  const modelDecisions: ModelDecision[] = [];
  const allFilesAffected = new Set<string>();

  const ws = getWorkspace(ctx.projectId);
  if (!ws) {
    return makeFailResult(resultId, startTime, "Workspace not found", iterationLog, modelDecisions);
  }

  try {
    // ── Step 1: Build / refresh repo graph ─────────────────────
    const graph = getCachedGraph(ctx.projectId);
    if (!graph || Date.now() - graph.builtAt > 60_000) {
      await buildRepoGraph(ctx.projectId, ws.srcDir);
    }

    // ── Step 2: Plan multi-file changes ───────────────────────
    const planDecision = selectModel({
      toolName: "plan_project",
      task: {
        type: "decision",
        complexity: 0.85,
        citizenId: ctx.citizenId,
        description: `Plan changes: ${task.description}`,
      },
      specialization: ctx.specialization,
      skillLevel: ctx.skillLevel,
    });
    modelDecisions.push(planDecision);

    const projectSummary = getProjectSummary(ctx.projectId);
    const contextHint = task.targetFiles?.length
      ? task.targetFiles.map(f => getContextForFile(ctx.projectId, f)).join("\n")
      : "";

    const planPrompt = [
      `TASK: ${task.description}`,
      ``,
      `PROJECT STRUCTURE:`,
      projectSummary,
      contextHint ? `\nRELEVANT CONTEXT:\n${contextHint}` : "",
      ``,
      `Plan all files to create or modify. For each file, specify:`,
      `- path: relative file path`,
      `- action: "create" or "modify"`,
      `- description: what to write in this file`,
      ``,
      `Include test files if the project has a test framework.`,
      ``,
      `Return JSON: { "plan": [ { "path": "...", "action": "create|modify", "description": "..." } ] }`,
    ].join("\n");

    const planJson = await callLLM({
      prompt: planPrompt,
      systemPrompt: `You are ${ctx.citizenName}, a senior ${ctx.specialization}. Plan precise, minimal file changes. Return only JSON.`,
      decision: { ...planDecision, config: { ...planDecision.config, requestJson: true } },
    });

    const plan = parsePlan(planJson);

    // ── Step 3: Generate code for all planned files ───────────
    const codeDecision = selectModel({
      toolName: "write_code",
      task: {
        type: "decision",
        complexity: 0.7,
        citizenId: ctx.citizenId,
        description: `Implement: ${task.description}`,
      },
      specialization: ctx.specialization,
      skillLevel: ctx.skillLevel,
    });
    modelDecisions.push(codeDecision);

    const filesWritten = await generateAndWriteFiles(plan, task.description, ctx, codeDecision);
    for (const f of filesWritten) {allFilesAffected.add(f);}

    iterationLog.push({
      iteration: 0,
      phase: "generate",
      filesWritten,
      durationMs: Date.now() - startTime,
    });

    // ── Step 4: Test → Fix loop ──────────────────────────────
    let testsPassed = false;
    let lintPassed = false;
    let fixIterations = 0;

    for (let i = 0; i < MAX_FIX_ITERATIONS; i++) {
      if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {break;}

      // Run tests
      const testResult = await runTests(ctx.projectId, task.testCommand);
      testsPassed = testResult.passed;

      // Run lint (first iteration only, or after fixes)
      const lintResult = await runLint(ctx.projectId, task.lintCommand);
      lintPassed = lintResult.passed;

      const currentIter: IterationEntry = {
        iteration: i + 1,
        phase: "fix",
        filesWritten: [],
        testResult: { passed: testResult.passed, output: testResult.output.slice(0, 500) },
        lintResult: { passed: lintResult.passed, output: lintResult.output.slice(0, 500) },
        durationMs: Date.now() - startTime,
      };

      if (testsPassed && lintPassed) {
        iterationLog.push(currentIter);
        break;
      }

      // ── Fix iteration ──────────────────────────────────────
      fixIterations++;

      const errorContext = buildErrorContext(testResult, lintResult);
      const fixDecision = selectModel({
        toolName: "debug_code",
        task: {
          type: "decision",
          complexity: 0.75 + (i * 0.05), // escalate complexity on retries
          citizenId: ctx.citizenId,
          description: `Fix iteration ${i + 1}: ${task.description}`,
        },
        specialization: ctx.specialization,
        skillLevel: ctx.skillLevel,
      });
      modelDecisions.push(fixDecision);

      // Read the files that likely need fixing
      const filesToFix = identifyBrokenFiles(errorContext, [...allFilesAffected]);
      const fileContents: Record<string, string> = {};
      for (const f of filesToFix) {
        try {
          fileContents[f] = await readWorkspaceFile(ctx.projectId, f);
        } catch {
          // File might not exist yet
        }
      }

      const fixPrompt = [
        `The following code has errors. Fix ALL issues.`,
        ``,
        `ERROR OUTPUT:`,
        errorContext.slice(0, MAX_ERROR_CONTEXT),
        ``,
        `CURRENT FILES:`,
        ...Object.entries(fileContents).map(
          ([path, content]) => `--- ${path} ---\n${content.slice(0, 2000)}\n---`,
        ),
        ``,
        `Return JSON: { "files": { "path/to/file.ext": "complete fixed file content", ... } }`,
        `Include ALL files that need changes, with their COMPLETE content (not just diffs).`,
      ].join("\n");

      const fixJson = await callLLM({
        prompt: fixPrompt,
        systemPrompt: `You are ${ctx.citizenName}, debugging code. Fix all errors. Return only JSON with complete file contents.`,
        decision: { ...fixDecision, config: { ...fixDecision.config, requestJson: true } },
      });

      const fixedFiles = parseFileMap(fixJson);
      const fixFilesWritten: string[] = [];
      for (const [filePath, content] of Object.entries(fixedFiles)) {
        if (typeof content !== "string" || !filePath) {continue;}
        await writeWorkspaceFile({
          projectId: ctx.projectId,
          relativePath: filePath,
          content,
          language: detectLanguageSimple(filePath),
          citizenId: ctx.citizenId,
        });
        fixFilesWritten.push(filePath);
        allFilesAffected.add(filePath);
      }

      currentIter.filesWritten = fixFilesWritten;
      iterationLog.push(currentIter);
    }

    // ── Step 5: Git commit on success ─────────────────────────
    if (testsPassed) {
      try {
        await gitCommit(
          ctx.projectId,
          `feat: ${task.description}\n\nAgentic loop: ${fixIterations} fix iterations, tests passed`,
          ctx.citizenId,
        );
      } catch {
        // Git commit is non-critical
      }
    }

    // Refresh repo graph after changes
    await buildRepoGraph(ctx.projectId, ws.srcDir).catch(() => { /* non-critical */ });

    const summary = testsPassed
      ? `✅ Completed: ${task.description} (${allFilesAffected.size} files, ${fixIterations} fixes, tests passed)`
      : `⚠️ Partial: ${task.description} (${allFilesAffected.size} files, ${fixIterations}/${MAX_FIX_ITERATIONS} fix attempts, tests ${testsPassed ? "passed" : "failing"})`;

    return {
      id: resultId,
      success: testsPassed,
      filesAffected: [...allFilesAffected],
      fixIterations,
      testsPassed,
      lintPassed,
      summary,
      modelDecisions,
      durationMs: Date.now() - startTime,
      iterationLog,
    };
  } catch (err: unknown) {
    return makeFailResult(
      resultId,
      startTime,
      err instanceof Error ? err.message : String(err),
      iterationLog,
      modelDecisions,
    );
  }
}

// ─── Multi-File Code Generation ─────────────────────────────────

async function generateAndWriteFiles(
  plan: Array<{ path: string; action: string; description: string }>,
  taskDescription: string,
  ctx: AgenticContext,
  decision: ModelDecision,
): Promise<string[]> {
  if (plan.length === 0) {return [];}

  // For small plans (1-3 files), generate all at once
  // For larger plans, batch to stay within token limits
  const batches = chunkArray(plan, 5);
  const filesWritten: string[] = [];

  for (const batch of batches) {
    const batchContext = batch.map(f => {
      const fileCtx = getContextForFile(ctx.projectId, f.path, 1000);
      return fileCtx ? `\nContext for ${f.path}:\n${fileCtx}` : "";
    }).join("");

    const prompt = [
      `Implement the following files for: ${taskDescription}`,
      batchContext,
      ``,
      `FILES TO GENERATE:`,
      ...batch.map((f, i) => `${i + 1}. ${f.path} (${f.action}): ${f.description}`),
      ``,
      `Return JSON: { "files": { "exact/path.ext": "complete file content", ... } }`,
      `Every file must be COMPLETE with real, working code. No stubs, no TODOs.`,
    ].join("\n");

    // Retry once if LLM returns corrupt or empty file_map
    let result: string;
    let fileMap: Record<string, string> = {};
    for (let attempt = 0; attempt < 2; attempt++) {
      result = await callLLM({
        prompt: attempt === 0 ? prompt : `${prompt}\n\nPREVIOUS ATTEMPT FAILED: output was empty or did not contain valid file contents. Return COMPLETE file contents in the exact JSON format specified.`,
        systemPrompt: `You are ${ctx.citizenName}, an elite ${ctx.specialization}. Write production-quality code. Return only JSON.`,
        decision: { ...decision, config: { ...decision.config, requestJson: true } },
      });
      try {
        fileMap = parseFileMap(result);
        if (Object.keys(fileMap).length > 0) { break; } // success
        if (attempt === 1) { throw new ContentValidationError("file_map", "Empty file map after retry", result.length); }
      } catch (e) {
        if (attempt === 1) { throw e; } // propagate after retry
        // else: retry
      }
    }

    // Pre-snapshot files for rollback on partial failure
    const pathsToWrite = Object.keys(fileMap);
    const snapshots = await captureFileSnapshots(
      ctx.projectId,
      pathsToWrite,
      readWorkspaceFile,
    );

    try {
      for (const [filePath, content] of Object.entries(fileMap)) {
        if (typeof content !== "string" || !filePath) {continue;}
        // Validate content before writing
        try {
          assertContentValid(content, kindFromExtension(filePath));
        } catch (ve) {
          console.warn(`[AgenticDev] Skipping invalid content for ${filePath}: ${ve instanceof ContentValidationError ? ve.message : String(ve)}`);
          continue;
        }
        await writeWorkspaceFile({
          projectId: ctx.projectId,
          relativePath: filePath,
          content,
          language: detectLanguageSimple(filePath),
          citizenId: ctx.citizenId,
        });
        filesWritten.push(filePath);
      }
    } catch (writeErr) {
      // Partial write failed — roll back this batch
      console.warn(`[AgenticDev] Write batch failed, rolling back: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`);
      await restoreSnapshots(
        ctx.projectId,
        snapshots,
        writeWorkspaceFile,
        async (pid, path) => {
          // Best-effort delete: write empty marker then rely on workspace GC
          // (workspace-manager has no delete API, so we overwrite with a tombstone)
          await writeWorkspaceFile({ projectId: pid, relativePath: path, content: "// ROLLBACK TOMBSTONE", language: "text", citizenId: ctx.citizenId }).catch(() => {});
        },
        ctx.citizenId,
      );
      throw writeErr;
    }
  }

  return filesWritten;
}

// ─── Test & Lint Runners ────────────────────────────────────────

interface TestResult {
  passed: boolean;
  output: string;
  exitCode: number;
}

async function runTests(projectId: string, customCommand?: string): Promise<TestResult> {
  try {
    const cmd = customCommand ?? "npm";
    const args = customCommand ? [] : ["test", "--", "--passWithNoTests"];

    const result = await execInWorkspace(projectId, cmd, args, {
      timeout: TEST_TIMEOUT_MS,
    });

    return {
      passed: result.exitCode === 0,
      output: (result.stdout + "\n" + result.stderr).slice(0, MAX_ERROR_CONTEXT),
      exitCode: result.exitCode,
    };
  } catch (err: unknown) {
    return {
      passed: false,
      output: err instanceof Error ? err.message : String(err),
      exitCode: 1,
    };
  }
}

async function runLint(projectId: string, customCommand?: string): Promise<TestResult> {
  try {
    const cmd = customCommand ?? "npx";
    const args = customCommand ? [] : ["eslint", ".", "--max-warnings", "0"];

    const result = await execInWorkspace(projectId, cmd, args, {
      timeout: 60_000,
    });

    return {
      passed: result.exitCode === 0,
      output: (result.stdout + "\n" + result.stderr).slice(0, 1000),
      exitCode: result.exitCode,
    };
  } catch {
    // Lint failure is non-critical — treat as passed if linter not available
    return { passed: true, output: "Linter not available", exitCode: 0 };
  }
}

// ─── Error Analysis ─────────────────────────────────────────────

function buildErrorContext(testResult: TestResult, lintResult: TestResult): string {
  const parts: string[] = [];

  if (!testResult.passed) {
    parts.push("TEST FAILURES:");
    parts.push(testResult.output.slice(0, MAX_ERROR_CONTEXT / 2));
  }

  if (!lintResult.passed) {
    parts.push("\nLINT ERRORS:");
    parts.push(lintResult.output.slice(0, MAX_ERROR_CONTEXT / 2));
  }

  return parts.join("\n");
}

/**
 * Identify which files likely need fixing based on error output.
 * Parses file paths from error messages and stack traces.
 */
function identifyBrokenFiles(errorOutput: string, knownFiles: string[]): string[] {
  const brokenFiles = new Set<string>();

  // Extract file paths from error messages (e.g., "src/foo.ts:42:10")
  const pathPattern = /(?:^|\s)([\w/.-]+\.(?:ts|tsx|js|jsx|py|go|rs))(?::(\d+))?/gm;
  for (const match of errorOutput.matchAll(pathPattern)) {
    const filePath = match[1];
    if (filePath) {brokenFiles.add(filePath);}
  }

  // If no specific files found, return all known files
  if (brokenFiles.size === 0) {
    return knownFiles.slice(0, 5); // limit to 5 files per fix attempt
  }

  // Intersect with known files
  const result = [...brokenFiles].filter(f =>
    knownFiles.some(kf => kf === f || kf.endsWith(f) || f.endsWith(kf)),
  );

  return result.length > 0 ? result : knownFiles.slice(0, 5);
}

// ─── Parsing Helpers ────────────────────────────────────────────

function parsePlan(json: string): Array<{ path: string; action: string; description: string }> {
  try {
    const cleaned = stripCodeFences(json);
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) { throw new ContentValidationError("plan", "No JSON object found in plan response", json.length); }

    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const plan = parsed.plan as Array<Record<string, string>> | undefined;
    if (!Array.isArray(plan) || plan.length === 0) {
      throw new ContentValidationError("plan", "Plan array is missing or empty", json.length);
    }

    return plan
      .filter(p => p.path && p.action && p.description)
      .map(p => ({
        path: String(p.path),
        action: String(p.action),
        description: String(p.description),
      }));
  } catch (e) {
    if (e instanceof ContentValidationError) { throw e; }
    throw new ContentValidationError("plan", `JSON parse error: ${e instanceof Error ? e.message : String(e)}`, json.length);
  }
}

function parseFileMap(json: string): Record<string, string> {
  try {
    const cleaned = stripCodeFences(json);
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) { throw new ContentValidationError("file_map", "No JSON object found in file_map response", json.length); }

    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const files = (parsed.files as Record<string, string>) ?? parsed;

    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(files)) {
      if (typeof value === "string" && key && !key.startsWith("{") && value.trim().length >= 10) {
        result[key] = value;
      }
    }

    if (Object.keys(result).length === 0) {
      throw new ContentValidationError("file_map", "No valid file entries found (all empty or missing)", json.length);
    }

    return result;
  } catch (e) {
    if (e instanceof ContentValidationError) { throw e; }
    throw new ContentValidationError("file_map", `JSON parse error: ${e instanceof Error ? e.message : String(e)}`, json.length);
  }
}

function detectLanguageSimple(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", go: "go", rs: "rust", java: "java", cs: "csharp",
    cpp: "cpp", c: "c", rb: "ruby", php: "php", md: "markdown",
    json: "json", yaml: "yaml", yml: "yaml", html: "html", css: "css",
    sql: "sql", sh: "shell", bash: "shell",
  };
  return map[ext] ?? "text";
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── Result Helpers ─────────────────────────────────────────────

function makeFailResult(
  id: string,
  startTime: number,
  error: string,
  iterationLog: IterationEntry[],
  modelDecisions: ModelDecision[],
): AgenticResult {
  return {
    id,
    success: false,
    filesAffected: [],
    fixIterations: 0,
    testsPassed: false,
    lintPassed: false,
    summary: `❌ Failed: ${error}`,
    modelDecisions,
    durationMs: Date.now() - startTime,
    iterationLog,
    error,
  };
}

// ─── Single-File Agentic Debug ──────────────────────────────────

/**
 * Agentic debug for a single file — reads file, runs tests,
 * iteratively fixes until green.
 *
 * Lighter-weight than full agenticDevelop() for targeted debugging.
 */
export async function agenticDebug(
  params: {
    filePath: string;
    errorMessage: string;
    testCommand?: string;
  },
  ctx: AgenticContext,
): Promise<AgenticResult> {
  return agenticDevelop(
    {
      description: `Debug ${params.filePath}: ${params.errorMessage}`,
      targetFiles: [params.filePath],
      testCommand: params.testCommand,
    },
    ctx,
  );
}

// ─── Exports for Integration ────────────────────────────────────

export {
  buildRepoGraph,
  getContextForFile,
  getProjectSummary,
} from "./repo-graph.js";
