/**
 * Agent Sandbox Pool Manager — Task Type Executors
 *
 * Specialized execution functions for each SandboxTaskType:
 * exec, browse, build, and file_op.
 */

import type { SandboxTask, SandboxTaskResult } from "./types.js";
import { SANDBOX_API_URL, TASK_TIMEOUT_MS } from "./config.js";
import { sandboxExecRaw, sandboxWriteFileRaw, sandboxReadFileRaw } from "./raw-api.js";

// ─── Exec Task ──────────────────────────────────────────────────

export async function executeExecTask(task: SandboxTask): Promise<SandboxTaskResult> {
  const command = (task.payload.command as string) ?? "echo 'no command'";
  const cwd = (task.payload.cwd as string) ?? task.workspaceDir;
  const timeout = Math.min((task.payload.timeout as number) ?? 300, TASK_TIMEOUT_MS / 1000);
  const raw = await sandboxExecRaw(command, cwd, timeout);
  return { ...raw, filesCreated: [] };
}

// ─── Browse Task ────────────────────────────────────────────────

export async function executeBrowseTask(task: SandboxTask): Promise<SandboxTaskResult> {
  const url = (task.payload.url as string) ?? "https://example.com";
  const action = (task.payload.action as string) ?? "screenshot";
  const start = Date.now();

  try {
    const res = await fetch(`${SANDBOX_API_URL}/browser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, url, ...task.payload }),
      signal: AbortSignal.timeout(TASK_TIMEOUT_MS),
    });
    const data = (await res.json()) as Record<string, unknown>;
    return {
      stdout: JSON.stringify(data, null, 2),
      stderr: "",
      exitCode: res.ok ? 0 : 1,
      durationMs: Date.now() - start,
      filesCreated: data.screenshot ? [data.screenshot as string] : [],
    };
  } catch (err) {
    return {
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
      exitCode: 1,
      durationMs: Date.now() - start,
      filesCreated: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Build Task ─────────────────────────────────────────────────

export async function executeBuildTask(task: SandboxTask): Promise<SandboxTaskResult> {
  const projectName = (task.payload.projectName as string) ?? "project";
  const buildCmd = (task.payload.buildCommand as string) ?? "npm install && npm run build";
  const start = Date.now();
  const allOutput: string[] = [];

  try {
    await sandboxExecRaw(`mkdir -p ${task.workspaceDir}/${projectName}`, "/workspace", 10);

    const files = task.payload.files as Record<string, string> | undefined;
    if (files) {
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = `${task.workspaceDir}/${projectName}/${filePath}`;
        const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
        await sandboxExecRaw(`mkdir -p ${dir}`, "/workspace", 10);
        await sandboxWriteFileRaw(fullPath, content);
      }
    }

    const buildResult = await sandboxExecRaw(
      buildCmd,
      `${task.workspaceDir}/${projectName}`,
      TASK_TIMEOUT_MS / 1000,
    );
    allOutput.push(buildResult.stdout);

    return {
      stdout: allOutput.join("\n"),
      stderr: buildResult.stderr,
      exitCode: buildResult.exitCode,
      durationMs: Date.now() - start,
      filesCreated: Object.keys(files ?? {}),
    };
  } catch (err) {
    return {
      stdout: allOutput.join("\n"),
      stderr: err instanceof Error ? err.message : String(err),
      exitCode: 1,
      durationMs: Date.now() - start,
      filesCreated: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── File Operation Task ────────────────────────────────────────

export async function executeFileTask(task: SandboxTask): Promise<SandboxTaskResult> {
  const op = (task.payload.operation as string) ?? "list";
  const path = (task.payload.path as string) ?? task.workspaceDir;
  const start = Date.now();

  try {
    if (op === "write") {
      const content = (task.payload.content as string) ?? "";
      await sandboxWriteFileRaw(path, content);
      return {
        stdout: `Written ${path}`,
        stderr: "",
        exitCode: 0,
        durationMs: Date.now() - start,
        filesCreated: [path],
      };
    }
    if (op === "read") {
      const content = await sandboxReadFileRaw(path);
      return {
        stdout: content ?? "",
        stderr: "",
        exitCode: content ? 0 : 1,
        durationMs: Date.now() - start,
        filesCreated: [],
      };
    }
    // Default: list
    const result = await sandboxExecRaw(`ls -la ${path}`, "/workspace", 10);
    return { ...result, filesCreated: [] };
  } catch (err) {
    return {
      stdout: "",
      stderr: String(err),
      exitCode: 1,
      durationMs: Date.now() - start,
      filesCreated: [],
      error: String(err),
    };
  }
}
