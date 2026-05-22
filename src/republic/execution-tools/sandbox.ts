/**
 * Execution Tools — Sandbox Operations
 *
 * 5 executors for sandbox tasks: exec, browse, build_project,
 * web_scrape, and the shared waitForSandboxCompletion poller.
 */

import type { ExecutionResult, ExecutionContext } from "../execution-types.js";
import { makeFailResult, makeSuccessResult } from "../execution-types.js";
import { uid, ts } from "../utils.js";

// ─── Sandbox Completion Poller ──────────────────────────────────

export async function waitForSandboxCompletion(
  taskId: string,
  getStatus: (id: string) => { status: string; result?: unknown } | null,
  maxWaitMs = 300_000,
): Promise<{
  status: string;
  result?: {
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
    filesCreated: string[];
    error?: string;
  };
} | null> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const task = getStatus(taskId);
    if (!task) {
      return null;
    }
    if (["success", "failed", "timeout", "cancelled"].includes(task.status)) {
      return task as {
        status: string;
        result?: {
          stdout: string;
          stderr: string;
          exitCode: number;
          durationMs: number;
          filesCreated: string[];
          error?: string;
        };
      };
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return null;
}

// ─── sandbox_exec ───────────────────────────────────────────────

export async function executeSandboxExec(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const command = (args.command as string) ?? "echo 'Hello from sandbox'";
  const cwd = (args.cwd as string) ?? "/workspace";
  const MAX = 2;
  for (let i = 0; i < MAX; i++) {
    try {
      const { submitSandboxTask, getSandboxTaskStatus } = await import("../agent-sandbox.js");
      const taskId = await submitSandboxTask({
        citizenId: ctx.citizenId,
        citizenName: ctx.citizenName,
        type: "exec",
        priority: ctx.skillLevel > 70 ? 80 : 50,
        payload: { command, cwd, timeout: 300 },
      });
      const result = await waitForSandboxCompletion(taskId, getSandboxTaskStatus);
      if (result?.result) {
        return {
          id: uid(),
          toolName: "sandbox_exec",
          citizenId: ctx.citizenId,
          projectId: ctx.projectId,
          status: result.status === "success" ? "success" : "failed",
          output: result.result.stdout || result.result.stderr,
          error: result.result.error,
          filesAffected: result.result.filesCreated,
          modelDecision: null,
          durationMs: Date.now() - start,
          timestamp: ts(),
        };
      }
      return makeSuccessResult("sandbox_exec", ctx, start, `Task ${taskId} submitted`, []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        /ENOENT|ECONNREFUSED|container.*not.*found|sandbox.*unavailable/i.test(msg) &&
        i < MAX - 1
      ) {
        await new Promise((r) => setTimeout(r, 3_000));
        continue;
      }
      return {
        id: uid(),
        toolName: "sandbox_exec",
        citizenId: ctx.citizenId,
        projectId: ctx.projectId,
        status: "failed",
        output: "",
        error: msg,
        filesAffected: [],
        modelDecision: null,
        durationMs: Date.now() - start,
        timestamp: ts(),
      };
    }
  }
  return makeFailResult("sandbox_exec", ctx, start, "All sandbox attempts exhausted");
}

// ─── sandbox_browse ─────────────────────────────────────────────

export async function executeSandboxBrowse(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const url = (args.url as string) ?? "https://example.com";
  const action = (args.action as string) ?? "screenshot";
  const MAX = 2;
  for (let i = 0; i < MAX; i++) {
    try {
      const { submitSandboxTask, getSandboxTaskStatus } = await import("../agent-sandbox.js");
      const taskId = await submitSandboxTask({
        citizenId: ctx.citizenId,
        citizenName: ctx.citizenName,
        type: "browse",
        priority: ctx.skillLevel > 70 ? 80 : 50,
        payload: { url, action },
      });
      const result = await waitForSandboxCompletion(taskId, getSandboxTaskStatus);
      if (result?.result) {
        return {
          id: uid(),
          toolName: "sandbox_browse",
          citizenId: ctx.citizenId,
          projectId: ctx.projectId,
          status: result.status === "success" ? "success" : "failed",
          output: result.result.stdout || `Browsed ${url}`,
          error: result.result.error,
          filesAffected: result.result.filesCreated,
          modelDecision: null,
          durationMs: Date.now() - start,
          timestamp: ts(),
        };
      }
      return makeSuccessResult("sandbox_browse", ctx, start, `Browse task ${taskId} submitted`, []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/ENOENT|ECONNREFUSED|container.*not.*found|Playwright.*crash/i.test(msg) && i < MAX - 1) {
        await new Promise((r) => setTimeout(r, 3_000));
        continue;
      }
      return {
        id: uid(),
        toolName: "sandbox_browse",
        citizenId: ctx.citizenId,
        projectId: ctx.projectId,
        status: "failed",
        output: "",
        error: msg,
        filesAffected: [],
        modelDecision: null,
        durationMs: Date.now() - start,
        timestamp: ts(),
      };
    }
  }
  return makeFailResult("sandbox_browse", ctx, start, "All browse attempts exhausted");
}

// ─── sandbox_build_project ──────────────────────────────────────

export async function executeSandboxBuildProject(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const projectName = (args.projectName as string) ?? "citizen-project";
  const buildCommand = (args.buildCommand as string) ?? "npm install && npm run build";
  const files = args.files as Record<string, string> | undefined;
  try {
    const { submitSandboxTask, getSandboxTaskStatus } = await import("../agent-sandbox.js");
    const taskId = await submitSandboxTask({
      citizenId: ctx.citizenId,
      citizenName: ctx.citizenName,
      type: "build",
      priority: ctx.skillLevel > 70 ? 80 : 50,
      payload: { projectName, buildCommand, files },
    });
    const result = await waitForSandboxCompletion(taskId, getSandboxTaskStatus);
    if (result?.result) {
      return {
        id: uid(),
        toolName: "sandbox_build_project",
        citizenId: ctx.citizenId,
        projectId: ctx.projectId,
        status: result.status === "success" ? "success" : "failed",
        output: result.result.stdout || `Build completed for ${projectName}`,
        error: result.result.error,
        filesAffected: result.result.filesCreated,
        modelDecision: null,
        durationMs: Date.now() - start,
        timestamp: ts(),
      };
    }
    return makeSuccessResult(
      "sandbox_build_project",
      ctx,
      start,
      `Build task ${taskId} submitted`,
      [],
    );
  } catch (err) {
    return {
      id: uid(),
      toolName: "sandbox_build_project",
      citizenId: ctx.citizenId,
      projectId: ctx.projectId,
      status: "failed",
      output: "",
      error: String(err),
      filesAffected: [],
      modelDecision: null,
      durationMs: Date.now() - start,
      timestamp: ts(),
    };
  }
}

// ─── web_scrape ─────────────────────────────────────────────────

export async function executeWebScrape(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const url = (args.url as string) ?? "";
  const mode = (args.mode as string) ?? "fast";
  const selectors = args.selectors as string[] | string | undefined;
  const depth = args.depth as number | undefined;
  if (!url) {
    return makeFailResult("web_scrape", ctx, start, "No URL provided");
  }
  try {
    const { citizenScrape } = await import("../citizen-scraping.js");
    const result = await citizenScrape({
      citizenId: ctx.citizenId,
      citizenName: ctx.citizenName,
      url,
      mode: mode as "fast" | "stealth" | "dynamic" | "crawl" | "media",
      selectors,
      depth,
    });
    return {
      id: uid(),
      toolName: "web_scrape",
      citizenId: ctx.citizenId,
      projectId: ctx.projectId,
      status: result.ok ? "success" : "failed",
      output: result.ok
        ? JSON.stringify(result.data, null, 2).slice(0, 3000)
        : (result.error ?? "Scrape failed"),
      error: result.ok ? undefined : result.error,
      filesAffected: [],
      modelDecision: null,
      durationMs: result.durationMs,
      timestamp: ts(),
    };
  } catch (err) {
    return {
      id: uid(),
      toolName: "web_scrape",
      citizenId: ctx.citizenId,
      projectId: ctx.projectId,
      status: "failed",
      output: "",
      error: err instanceof Error ? err.message : String(err),
      filesAffected: [],
      modelDecision: null,
      durationMs: Date.now() - start,
      timestamp: ts(),
    };
  }
}
