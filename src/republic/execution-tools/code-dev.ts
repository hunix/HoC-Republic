/**
 * Execution Tools — Code Development
 *
 * 11 tool executors for code writing, debugging, reviewing, testing,
 * linting, schema generation, git operations, and agentic development loops.
 */

import type { ExecutionResult, ExecutionContext } from "../execution-types.js";
import type { AgentTask } from "../types.js";
import { agenticDebug, agenticDevelop } from "../agentic-dev-loop.js";
import { assertContentValid, ContentValidationError } from "../content-validator.js";
import { callLLM } from "../execution-llm.js";
import { makeFailResult, detectLanguage } from "../execution-types.js";
import { selectModel } from "../model-council.js";
import { buildRepoGraph, getCachedGraph, getContextForFile } from "../repo-graph.js";
import { uid, ts } from "../utils.js";
import {
  execInWorkspace,
  getWorkspace,
  gitCommit,
  readWorkspaceFile,
  writeWorkspaceFile,
} from "../workspace-manager.js";

// ─── write_code ─────────────────────────────────────────────────

export async function executeWriteCode(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const filePath = (args.filePath as string) ?? "untitled.ts";
  const description = (args.description as string) ?? "Generate code";
  const language = (args.language as string) ?? detectLanguage(filePath);

  const task: AgentTask = {
    type: "decision",
    complexity: 0.6,
    citizenId: ctx.citizenId,
    description: `Write code: ${description}`,
  };

  const decision = selectModel({
    toolName: "write_code",
    task,
    specialization: ctx.specialization,
    skillLevel: ctx.skillLevel,
  });

  // ── Repo-graph context injection ───────────────────────────
  let repoContext = "";
  try {
    const ws = getWorkspace(ctx.projectId);
    if (ws) {
      const cached = getCachedGraph(ctx.projectId);
      if (!cached || Date.now() - cached.builtAt > 60_000) {
        await buildRepoGraph(ctx.projectId, ws.srcDir);
      }
      repoContext = getContextForFile(ctx.projectId, filePath);
    }
  } catch {
    // Non-critical — proceed without context
  }

  const contextualPrompt = repoContext
    ? `${repoContext}\n\nWrite ${language} code for: ${description}\nFile: ${filePath}\n\nUse the codebase context above to ensure consistency with existing types and APIs.`
    : `Write ${language} code for: ${description}\nFile: ${filePath}`;

  const code = await callLLM({
    prompt: contextualPrompt,
    systemPrompt: `You are ${ctx.citizenName}, a ${ctx.specialization} citizen. Write clean, production-quality ${language} code.`,
    decision,
  });

  // Validate content before writing — catches empty stubs and truncated output
  try {
    assertContentValid(code, "code");
  } catch (ve) {
    // Re-prompt once with explicit instruction
    const retryCode = await callLLM({
      prompt: `${contextualPrompt}\n\nPREVIOUS ATTEMPT WAS EMPTY OR INVALID. Return complete, working ${language} code. No placeholders.`,
      systemPrompt: `You are ${ctx.citizenName}, a ${ctx.specialization} citizen. Write clean, production-quality ${language} code.`,
      decision,
    }).catch(() => "");
    if (!retryCode || retryCode.trim().length < 30) {
      return makeFailResult(
        "write_code",
        ctx,
        start,
        `LLM returned empty or invalid code: ${ve instanceof ContentValidationError ? ve.message : String(ve)}`,
      );
    }
    const retryFile = await writeWorkspaceFile({
      projectId: ctx.projectId,
      relativePath: filePath,
      content: retryCode,
      language,
      citizenId: ctx.citizenId,
    });
    return {
      id: uid(),
      toolName: "write_code",
      citizenId: ctx.citizenId,
      projectId: ctx.projectId,
      status: "success",
      output: `Created ${retryFile.relativePath} (${retryFile.sizeBytes} bytes) [after retry]`,
      filesAffected: [retryFile.relativePath],
      modelDecision: decision,
      durationMs: Date.now() - start,
      timestamp: ts(),
    };
  }

  const file = await writeWorkspaceFile({
    projectId: ctx.projectId,
    relativePath: filePath,
    content: code,
    language,
    citizenId: ctx.citizenId,
  });

  return {
    id: uid(),
    toolName: "write_code",
    citizenId: ctx.citizenId,
    projectId: ctx.projectId,
    status: "success",
    output: `Created ${file.relativePath} (${file.sizeBytes} bytes)`,
    filesAffected: [file.relativePath],
    modelDecision: decision,
    durationMs: Date.now() - start,
    timestamp: ts(),
  };
}

// ─── develop (agentic) ──────────────────────────────────────────

export async function executeAgenticDevelop(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const description = (args.description as string) ?? "Implement feature";
  const targetFiles = args.targetFiles as string[] | undefined;
  const testCommand = args.testCommand as string | undefined;

  const result = await agenticDevelop(
    { description, targetFiles, testCommand },
    {
      citizenId: ctx.citizenId,
      citizenName: ctx.citizenName,
      specialization: ctx.specialization,
      skillLevel: ctx.skillLevel,
      projectId: ctx.projectId,
    },
  );

  return {
    id: uid(),
    toolName: "develop",
    citizenId: ctx.citizenId,
    projectId: ctx.projectId,
    status: result.success ? "success" : "failed",
    output: result.summary,
    filesAffected: result.filesAffected,
    modelDecision: result.modelDecisions[0] ?? null,
    durationMs: Date.now() - start,
    error: result.error,
    timestamp: ts(),
  };
}

// ─── agentic_debug ──────────────────────────────────────────────

export async function executeAgenticDebug(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const filePath = (args.filePath as string) ?? "";
  const errorMessage = (args.error as string) ?? "Unknown error";
  const testCommand = args.testCommand as string | undefined;

  const result = await agenticDebug(
    { filePath, errorMessage, testCommand },
    {
      citizenId: ctx.citizenId,
      citizenName: ctx.citizenName,
      specialization: ctx.specialization,
      skillLevel: ctx.skillLevel,
      projectId: ctx.projectId,
    },
  );

  return {
    id: uid(),
    toolName: "agentic_debug",
    citizenId: ctx.citizenId,
    projectId: ctx.projectId,
    status: result.success ? "success" : "failed",
    output: result.summary,
    filesAffected: result.filesAffected,
    modelDecision: result.modelDecisions[0] ?? null,
    durationMs: Date.now() - start,
    error: result.error,
    timestamp: ts(),
  };
}

// ─── create_file ────────────────────────────────────────────────

export async function executeCreateFile(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const filePath = (args.filePath as string) ?? "new-file.txt";
  const content = (args.content as string) ?? "";

  if (!content || content.trim().length === 0) {
    return makeFailResult("create_file", ctx, start, `Refusing to write empty file: ${filePath}`);
  }

  const file = await writeWorkspaceFile({
    projectId: ctx.projectId,
    relativePath: filePath,
    content,
    language: detectLanguage(filePath),
    citizenId: ctx.citizenId,
  });

  return {
    id: uid(),
    toolName: "create_file",
    citizenId: ctx.citizenId,
    projectId: ctx.projectId,
    status: "success",
    output: `Created ${file.relativePath}`,
    filesAffected: [file.relativePath],
    modelDecision: null,
    durationMs: Date.now() - start,
    timestamp: ts(),
  };
}

// ─── debug_code ─────────────────────────────────────────────────

export async function executeDebugCode(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const filePath = (args.filePath as string) ?? "";
  const errorMessage = (args.error as string) ?? "Unknown error";

  if (!filePath) {
    return makeFailResult("debug_code", ctx, start, "No file path provided");
  }

  let existingCode: string;
  try {
    existingCode = await readWorkspaceFile(ctx.projectId, filePath);
  } catch {
    return makeFailResult("debug_code", ctx, start, `File not found: ${filePath}`);
  }

  const task: AgentTask = {
    type: "decision",
    complexity: 0.7,
    citizenId: ctx.citizenId,
    description: `Debug: ${errorMessage}`,
  };

  const decision = selectModel({
    toolName: "debug_code",
    task,
    specialization: ctx.specialization,
    skillLevel: ctx.skillLevel,
  });

  const fixedCode = await callLLM({
    prompt: `Fix this code:\n\nError: ${errorMessage}\n\nCode:\n${existingCode}`,
    systemPrompt: `You are ${ctx.citizenName}, a ${ctx.specialization}. Fix the bug and return the corrected full file content.`,
    decision,
  });

  try {
    assertContentValid(fixedCode, "code");
  } catch (ve) {
    return {
      id: uid(),
      toolName: "debug_code",
      citizenId: ctx.citizenId,
      projectId: ctx.projectId,
      status: "failed",
      output: "",
      filesAffected: [],
      modelDecision: decision,
      durationMs: Date.now() - start,
      error: `LLM returned invalid fix (original preserved): ${ve instanceof ContentValidationError ? ve.message : String(ve)}`,
      timestamp: ts(),
    };
  }

  await writeWorkspaceFile({
    projectId: ctx.projectId,
    relativePath: filePath,
    content: fixedCode,
    language: detectLanguage(filePath),
    citizenId: ctx.citizenId,
  });

  return {
    id: uid(),
    toolName: "debug_code",
    citizenId: ctx.citizenId,
    projectId: ctx.projectId,
    status: "success",
    output: `Debugged ${filePath} (error: ${errorMessage.slice(0, 80)})`,
    filesAffected: [filePath],
    modelDecision: decision,
    durationMs: Date.now() - start,
    timestamp: ts(),
  };
}

// ─── code_review ────────────────────────────────────────────────

export async function executeCodeReview(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const filePath = (args.filePath as string) ?? "";

  if (!filePath) {
    return makeFailResult("code_review", ctx, start, "No file path provided");
  }

  let code: string;
  try {
    code = await readWorkspaceFile(ctx.projectId, filePath);
  } catch {
    return makeFailResult("code_review", ctx, start, `File not found: ${filePath}`);
  }

  const task: AgentTask = {
    type: "decision",
    complexity: 0.6,
    citizenId: ctx.citizenId,
    description: `Review: ${filePath}`,
  };

  const decision = selectModel({
    toolName: "code_review",
    task,
    specialization: ctx.specialization,
    skillLevel: ctx.skillLevel,
  });

  const review = await callLLM({
    prompt: `Review this code for quality, bugs, and improvements:\n\n${code}`,
    systemPrompt: `You are ${ctx.citizenName}, a senior ${ctx.specialization}. Provide constructive code review feedback.`,
    decision,
  });

  const reviewPath = filePath.replace(/\.[^.]+$/, ".review.md");
  await writeWorkspaceFile({
    projectId: ctx.projectId,
    relativePath: `docs/${reviewPath}`,
    content: `# Code Review: ${filePath}\n\nReviewer: ${ctx.citizenName} (${ctx.specialization})\nDate: ${ts()}\n\n${review}`,
    language: "markdown",
    citizenId: ctx.citizenId,
  });

  return {
    id: uid(),
    toolName: "code_review",
    citizenId: ctx.citizenId,
    projectId: ctx.projectId,
    status: "success",
    output: review.slice(0, 500),
    filesAffected: [`docs/${reviewPath}`],
    modelDecision: decision,
    durationMs: Date.now() - start,
    timestamp: ts(),
  };
}

// ─── run_tests ──────────────────────────────────────────────────

export async function executeRunTests(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const command = (args.command as string) ?? "npm";
  const testArgs = (args.args as string[]) ?? ["test"];

  const ws = getWorkspace(ctx.projectId);
  if (!ws) {
    return makeFailResult("run_tests", ctx, start, "Workspace not found");
  }

  const shellResult = await execInWorkspace(ctx.projectId, command, testArgs, {
    timeout: 120_000,
  });

  return {
    id: uid(),
    toolName: "run_tests",
    citizenId: ctx.citizenId,
    projectId: ctx.projectId,
    status: shellResult.exitCode === 0 ? "success" : "failed",
    output: (shellResult.stdout + "\n" + shellResult.stderr).slice(0, 2000),
    filesAffected: [],
    modelDecision: null,
    durationMs: Date.now() - start,
    error: shellResult.exitCode !== 0 ? `Exit code: ${shellResult.exitCode}` : undefined,
    timestamp: ts(),
  };
}

// ─── lint_code ──────────────────────────────────────────────────

export async function executeLintCode(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const command = (args.command as string) ?? "npx";
  const lintArgs = (args.args as string[]) ?? ["eslint", "."];

  const shellResult = await execInWorkspace(ctx.projectId, command, lintArgs, {
    timeout: 60_000,
  });

  return {
    id: uid(),
    toolName: "lint_code",
    citizenId: ctx.citizenId,
    projectId: ctx.projectId,
    status: shellResult.exitCode === 0 ? "success" : "failed",
    output: (shellResult.stdout + "\n" + shellResult.stderr).slice(0, 2000),
    filesAffected: [],
    modelDecision: null,
    durationMs: Date.now() - start,
    error: shellResult.exitCode !== 0 ? `Lint errors found` : undefined,
    timestamp: ts(),
  };
}

// ─── write_test ─────────────────────────────────────────────────

export async function executeWriteTest(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const targetFile = (args.targetFile as string) ?? "";
  const testFile = (args.testFile as string) ?? targetFile.replace(/\.([^.]+)$/, ".test.$1");

  let sourceCode = "";
  if (targetFile) {
    try {
      sourceCode = await readWorkspaceFile(ctx.projectId, targetFile);
    } catch {
      // Source file not found — generate tests from description only
    }
  }

  const task: AgentTask = {
    type: "decision",
    complexity: 0.4,
    citizenId: ctx.citizenId,
    description: `Write tests for ${targetFile}`,
  };

  const decision = selectModel({
    toolName: "write_test",
    task,
    specialization: ctx.specialization,
    skillLevel: ctx.skillLevel,
  });

  const testCode = await callLLM({
    prompt: sourceCode
      ? `Write comprehensive unit tests for this code:\n\n${sourceCode}`
      : `Write unit tests for: ${targetFile}`,
    systemPrompt: `You are ${ctx.citizenName}, a QA specialist. Write thorough test cases with edge cases.`,
    decision,
  });

  const file = await writeWorkspaceFile({
    projectId: ctx.projectId,
    relativePath: `tests/${testFile}`,
    content: testCode,
    language: detectLanguage(testFile),
    citizenId: ctx.citizenId,
  });

  return {
    id: uid(),
    toolName: "write_test",
    citizenId: ctx.citizenId,
    projectId: ctx.projectId,
    status: "success",
    output: `Created tests/${file.relativePath} (${file.sizeBytes} bytes)`,
    filesAffected: [`tests/${file.relativePath}`],
    modelDecision: decision,
    durationMs: Date.now() - start,
    timestamp: ts(),
  };
}

// ─── git_commit ─────────────────────────────────────────────────

export async function executeGitCommit(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const message = (args.message as string) ?? `Update by ${ctx.citizenName}`;

  const commitResult = await gitCommit(ctx.projectId, message, ctx.citizenId);

  return {
    id: uid(),
    toolName: "git_commit",
    citizenId: ctx.citizenId,
    projectId: ctx.projectId,
    status: commitResult.exitCode === 0 ? "success" : "failed",
    output: commitResult.stdout.slice(0, 500),
    filesAffected: [],
    modelDecision: null,
    durationMs: Date.now() - start,
    error: commitResult.exitCode !== 0 ? commitResult.stderr : undefined,
    timestamp: ts(),
  };
}

// ─── write_schema ───────────────────────────────────────────────

export async function executeWriteSchema(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const description = (args.description as string) ?? "Database schema";
  const database = (args.database as string) ?? "PostgreSQL";

  const task: AgentTask = {
    type: "strategy",
    complexity: 0.8,
    citizenId: ctx.citizenId,
    description: `Design ${database} schema: ${description}`,
  };

  const decision = selectModel({
    toolName: "write_schema",
    task,
    specialization: ctx.specialization,
    skillLevel: ctx.skillLevel,
  });

  const schema = await callLLM({
    prompt: `Design a ${database} database schema for: ${description}`,
    systemPrompt: `You are ${ctx.citizenName}, a database architect. Design a normalized, efficient schema.`,
    decision,
  });

  const schemaFile = `schema.${database.toLowerCase() === "postgresql" ? "sql" : "sql"}`;
  await writeWorkspaceFile({
    projectId: ctx.projectId,
    relativePath: schemaFile,
    content: schema,
    language: "sql",
    citizenId: ctx.citizenId,
  });

  return {
    id: uid(),
    toolName: "write_schema",
    citizenId: ctx.citizenId,
    projectId: ctx.projectId,
    status: "success",
    output: `Created ${schemaFile} for ${database}`,
    filesAffected: [schemaFile],
    modelDecision: decision,
    durationMs: Date.now() - start,
    timestamp: ts(),
  };
}

// ─── deploy_app ─────────────────────────────────────────────────

export async function executeDeployApp(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const projectName = (args.projectName as string) ?? ctx.projectId;
  const environment = (args.environment as string) ?? "dev";
  const buildCmd = (args.buildCommand as string) ?? "npm";
  const buildArgs = (args.buildArgs as string[]) ?? ["run", "build"];

  // Step 1: Ensure workspace exists (auto-create if needed)
  let ws = getWorkspace(ctx.projectId);
  if (!ws) {
    const { listWorkspaces } = await import("../workspace-manager.js");
    const all = listWorkspaces();
    ws = all.find(
      (w) => w.name === projectName || w.slug === projectName.toLowerCase().replace(/\s+/g, "-"),
    );
  }

  // Step 2: Build
  const buildResult = await execInWorkspace(ctx.projectId, buildCmd, buildArgs, {
    timeout: 120_000,
  });

  if (buildResult.exitCode !== 0) {
    return {
      id: uid(),
      toolName: "deploy_app",
      citizenId: ctx.citizenId,
      projectId: ctx.projectId,
      status: "failed",
      output: `Build failed:\n${buildResult.stderr.slice(0, 1000)}`,
      filesAffected: [],
      modelDecision: null,
      durationMs: Date.now() - start,
      error: `Build failed with exit code ${buildResult.exitCode}`,
      timestamp: ts(),
    };
  }

  // Step 3: Find a free port and start preview server
  let previewUrl: string | undefined;
  let previewPort: number | undefined;

  try {
    const net = await import("node:net");
    const getPort = (): Promise<number> =>
      new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, "127.0.0.1", () => {
          const addr = srv.address() as { port: number };
          srv.close(() => resolve(addr.port));
        });
        srv.on("error", reject);
      });

    previewPort = await getPort();
    previewUrl = `http://localhost:${previewPort}`;

    const wsForPreview = ws ?? getWorkspace(ctx.projectId);
    const hasVite =
      wsForPreview?.framework?.includes("vite") ||
      wsForPreview?.framework?.includes("react") ||
      wsForPreview?.framework?.includes("three");

    if (hasVite) {
      const { spawn } = await import("node:child_process");
      const previewProc = spawn(
        "npx",
        ["vite", "preview", "--port", String(previewPort), "--host", "localhost"],
        {
          cwd: wsForPreview?.rootDir ?? process.cwd(),
          detached: true,
          stdio: "ignore",
          env: { ...process.env },
        },
      );
      previewProc.unref();
    } else {
      const { spawn } = await import("node:child_process");
      const startProc = spawn("npm", ["start"], {
        cwd: wsForPreview?.rootDir ?? process.cwd(),
        detached: true,
        stdio: "ignore",
        env: { ...process.env, PORT: String(previewPort) },
      });
      startProc.unref();
    }

    await new Promise<void>((r) => setTimeout(r, 1500));

    const { setPreviewUrl } = await import("../workspace-manager.js");
    await setPreviewUrl(ctx.projectId, previewUrl, previewPort);
  } catch {
    previewUrl = undefined;
  }

  const envLabel =
    environment === "production"
      ? "🚀 Production"
      : environment === "staging"
        ? "🔬 Staging"
        : "🧪 Dev";
  const previewNote = previewUrl
    ? `\nLive preview: ${previewUrl}`
    : "\nNote: start preview manually with `npm run preview`";

  return {
    id: uid(),
    toolName: "deploy_app",
    citizenId: ctx.citizenId,
    projectId: ctx.projectId,
    status: "success",
    output: `${envLabel} deploy complete for "${projectName}".${previewNote}`,
    filesAffected: [],
    modelDecision: null,
    durationMs: Date.now() - start,
    timestamp: ts(),
  };
}
