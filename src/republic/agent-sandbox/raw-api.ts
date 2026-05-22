/**
 * Agent Sandbox Pool Manager — Raw API Calls
 *
 * Low-level exec, file I/O, and docker exec fallbacks.
 * These functions do NOT auto-start the container.
 */

import { execFileSync } from "node:child_process";
import {
  SANDBOX_CONTAINER_NAME,
  SANDBOX_API_PORT,
  SANDBOX_API_URL,
  TASK_TIMEOUT_MS,
} from "./config.js";

// ─── Port Cache ─────────────────────────────────────────────────

const _portCache = new Map<number, { value: boolean; ts: number }>();
const PORT_CACHE_TTL_MS = 30_000;

export function isPortListening(port: number): boolean {
  const cached = _portCache.get(port);
  if (cached && Date.now() - cached.ts < PORT_CACHE_TTL_MS) {
    return cached.value;
  }
  let value = false;
  try {
    const out = execFileSync(
      "docker",
      [
        "inspect",
        "--format",
        `{{(index (index .NetworkSettings.Ports "${port}/tcp") 0).HostPort}}`,
        SANDBOX_CONTAINER_NAME,
      ],
      { timeout: 2_000, stdio: "pipe" },
    )
      .toString()
      .trim();
    value = out.length > 0 && !Number.isNaN(Number(out));
  } catch {
    value = false;
  }
  _portCache.set(port, { value, ts: Date.now() });
  return value;
}

/** Invalidate the port cache when the container state changes */
export function invalidatePortCache(): void {
  _portCache.clear();
}

// ─── Docker Exec ────────────────────────────────────────────────

/** Execute a command directly via `docker exec` — works for any container. */
export async function sandboxDockerExecRaw(
  command: string,
  cwd: string,
  timeout: number,
): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> {
  const start = Date.now();
  const { execFile } = await import("node:child_process");
  return new Promise((resolve) => {
    const args = ["exec", "-w", cwd || "/", SANDBOX_CONTAINER_NAME, "bash", "-c", command];
    execFile("docker", args, { timeout: timeout * 1000 + 5000 }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout ?? "",
        stderr: stderr ?? err?.message ?? "",
        exitCode: (err as NodeJS.ErrnoException & { code?: number })?.code ?? (err ? 1 : 0),
        durationMs: Date.now() - start,
      });
    });
  });
}

/** Public docker exec wrapper — exported for the RPC exec handler. */
export async function sandboxDockerExec(
  command: string,
  cwd = "/",
  timeout = 60,
): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> {
  const { isContainerRunning } = await import("./pool-state.js");
  if (!isContainerRunning()) {
    throw new Error("Sandbox container is not running");
  }
  return sandboxDockerExecRaw(command, cwd, timeout);
}

// ─── HTTP API Exec ──────────────────────────────────────────────

export async function sandboxExecRaw(
  command: string,
  cwd: string,
  timeout: number,
): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> {
  if (isPortListening(SANDBOX_API_PORT)) {
    try {
      const res = await fetch(`${SANDBOX_API_URL}/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, cwd, timeout }),
        signal: AbortSignal.timeout(Math.max(timeout * 1000 + 5000, 30_000)),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          stdout: string;
          stderr: string;
          exit_code: number;
          duration_ms: number;
        };
        return {
          stdout: data.stdout,
          stderr: data.stderr,
          exitCode: data.exit_code,
          durationMs: data.duration_ms,
        };
      }
    } catch {
      // HTTP API unavailable — fall through to docker exec
    }
  }
  return sandboxDockerExecRaw(command, cwd, timeout);
}

// ─── File Operations ────────────────────────────────────────────

export async function sandboxWriteFileRaw(filePath: string, content: string): Promise<boolean> {
  if (isPortListening(SANDBOX_API_PORT)) {
    try {
      const res = await fetch(`${SANDBOX_API_URL}/write-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath, content }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        return true;
      }
    } catch {
      // HTTP API unavailable — fall through to docker exec
    }
  }
  try {
    const b64 = Buffer.from(content, "utf-8").toString("base64");
    const safePath = filePath.replace(/'/g, "'\\''");
    const mkdirCmd = `mkdir -p "$(dirname '${safePath}')" && echo '${b64}' | base64 -d > '${safePath}'`;
    const result = await sandboxDockerExecRaw(mkdirCmd, "/", 10);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function sandboxReadFileRaw(filePath: string): Promise<string | null> {
  try {
    const res = await fetch(`${SANDBOX_API_URL}/read-file?path=${encodeURIComponent(filePath)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      const data = (await res.json()) as { content: string };
      return data.content;
    }
  } catch {
    // HTTP API unavailable — fall through to docker exec
  }
  try {
    const result = await sandboxDockerExecRaw(
      `base64 -w 0 ${JSON.stringify(filePath)} 2>/dev/null`,
      "/",
      10,
    );
    if (result.exitCode === 0 && result.stdout.length > 0) {
      return Buffer.from(result.stdout.trim(), "base64").toString("utf-8");
    }
  } catch {
    // docker exec also failed
  }
  return null;
}

// ─── Browser API ────────────────────────────────────────────────

export async function sandboxBrowserRaw(action: {
  action: string;
  url?: string;
  selector?: string;
  text?: string;
  code?: string;
}): Promise<Record<string, unknown>> {
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
