/**
 * Agent Sandbox Pool Manager — High-Level API Client
 *
 * Backward-compatible wrappers that auto-start the container
 * before delegating to the raw API layer.
 */

import { SANDBOX_API_URL, TASK_TIMEOUT_MS } from "./config.js";
import { ensureContainerRunning } from "./container-lifecycle.js";
import {
  sandboxExecRaw,
  sandboxWriteFileRaw,
  sandboxReadFileRaw,
  sandboxDockerExecRaw,
} from "./raw-api.js";

// ─── High-Level Wrappers (auto-start container) ─────────────────

export async function sandboxExec(
  command: string,
  cwd = "/workspace",
  timeout = 60,
): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> {
  await ensureContainerRunning();
  return sandboxExecRaw(command, cwd, timeout);
}

export async function sandboxWriteFile(path: string, content: string): Promise<boolean> {
  await ensureContainerRunning();
  return sandboxWriteFileRaw(path, content);
}

export async function sandboxReadFile(path: string): Promise<string | null> {
  await ensureContainerRunning();
  return sandboxReadFileRaw(path);
}

export async function sandboxListFiles(
  path = "/workspace",
): Promise<Array<{ name: string; type: string; size: number }>> {
  await ensureContainerRunning();

  // Try HTTP API first
  try {
    const res = await fetch(`${SANDBOX_API_URL}/list-files?path=${encodeURIComponent(path)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        entries: Array<{ name: string; type: string; size: number }>;
      };
      return data.entries;
    }
  } catch {
    // HTTP API unavailable — fall through to docker exec
  }

  // Fallback: docker exec ls
  try {
    const result = await sandboxDockerExecRaw(
      `ls -la --time-style=+%s ${JSON.stringify(path)} 2>/dev/null | tail -n +2`,
      "/",
      10,
    );
    if (result.exitCode !== 0) {
      return [];
    }
    const entries: Array<{ name: string; type: string; size: number }> = [];
    for (const line of result.stdout.split("\n")) {
      if (!line.trim()) {
        continue;
      }
      const parts = line.split(/\s+/);
      if (parts.length < 7) {
        continue;
      }
      const perms = parts[0] ?? "";
      const size = parseInt(parts[4] ?? "0", 10);
      const name = parts.slice(6).join(" ");
      if (!name || name === "." || name === "..") {
        continue;
      }
      const type = perms.startsWith("d") ? "directory" : "file";
      entries.push({ name, type, size });
    }
    return entries;
  } catch {
    return [];
  }
}

export async function sandboxBrowser(action: {
  action: string;
  url?: string;
  selector?: string;
  text?: string;
  code?: string;
}): Promise<Record<string, unknown>> {
  await ensureContainerRunning();
  const res = await fetch(`${SANDBOX_API_URL}/browser`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
    signal: AbortSignal.timeout(TASK_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Browser action failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown>;
}
