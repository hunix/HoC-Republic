/**
 * Republic Platform — Preview Server Manager
 *
 * Manages `vite preview` (or `serve`) processes per project.
 * Each project gets its own port. The gateway proxy routes
 * /preview/:projectId/* → http://localhost:<port>/*
 *
 * This makes the React UI able to embed:
 *   <iframe src="/preview/abc123" />
 * with zero CORS issues (same-origin through the gateway proxy).
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

// ─── State ────────────────────────────────────────────────────────

interface PreviewProcess {
  projectId: string;
  port: number;
  pid: number;
  process: ChildProcess;
  rootDir: string;
  startedAt: number;
  url: string;
}

const previews = new Map<string, PreviewProcess>();

// ─── Port Management ──────────────────────────────────────────────

/** Find a free port in the range 4100-4999 (reserved for project previews) */
async function findFreePort(): Promise<number> {
  const used = new Set([...previews.values()].map((p) => p.port));

  for (let port = 4100; port <= 4999; port++) {
    if (used.has(port)) {
      continue;
    }
    const available = await isPortFree(port);
    if (available) {
      return port;
    }
  }
  throw new Error("No free preview ports available in range 4100-4999");
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "127.0.0.1");
  });
}

// ─── Preview Server Lifecycle ─────────────────────────────────────

/**
 * Start a vite preview server for the given project workspace.
 * First tries `vite preview` (for Vite projects), falls back to `npx serve dist`.
 */
export async function startPreviewServer(projectId: string, rootDir: string): Promise<boolean> {
  // Stop existing preview if any
  await stopPreviewServer(projectId);

  if (!rootDir) {
    return false;
  }

  let port: number;
  try {
    port = await findFreePort();
  } catch {
    console.warn(`[Preview] No free port for project ${projectId}`);
    return false;
  }

  // Determine the serve command
  // Try vite preview if dist/ exists, otherwise npx serve on dist/ or ./
  const distDir = path.join(rootDir, "dist");
  const serveTarget = distDir;

  let proc: ChildProcess;
  try {
    // Try `vite preview` first (works for Vite projects after npm run build)
    proc = spawn("npx", ["vite", "preview", "--port", String(port), "--host", "127.0.0.1"], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      detached: false,
    });
  } catch {
    // Fallback: serve the dist directory
    try {
      proc = spawn("npx", ["serve", "-l", String(port), serveTarget], {
        cwd: rootDir,
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
        detached: false,
      });
    } catch {
      return false;
    }
  }

  if (!proc.pid) {
    return false;
  }

  const url = `http://127.0.0.1:${port}`;

  const preview: PreviewProcess = {
    projectId,
    port,
    pid: proc.pid,
    process: proc,
    rootDir,
    startedAt: Date.now(),
    url,
  };

  previews.set(projectId, preview);

  // Handle process exit
  proc.on("exit", (code) => {
    if (previews.get(projectId)?.pid === proc.pid) {
      previews.delete(projectId);
      console.log(`[Preview] Process for ${projectId} exited with code ${code}`);
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString();
    if (/error|failed/i.test(msg)) {
      console.warn(`[Preview:${projectId}] ${msg.slice(0, 200)}`);
    }
  });

  // Wait for the server to become ready (max 10 seconds)
  try {
    await waitForPort(port, 10_000);
    console.log(`[Preview] Project ${projectId} live at ${url}`);
    return true;
  } catch {
    // Server didn't start in time — still return true (might start later)
    return true;
  }
}

/**
 * Stop the preview server for a project.
 */
export async function stopPreviewServer(projectId: string): Promise<void> {
  const preview = previews.get(projectId);
  if (!preview) {
    return;
  }

  try {
    preview.process.kill("SIGTERM");
    // Force kill after 3s if SIGTERM didn't work
    setTimeout(() => {
      try {
        preview.process.kill("SIGKILL");
      } catch {
        /* already dead */
      }
    }, 3_000);
  } catch {
    /* already dead */
  }

  previews.delete(projectId);
}

/**
 * Get the preview URL for a project (if running).
 */
export function getPreviewUrl(projectId: string): string | null {
  return previews.get(projectId)?.url ?? null;
}

/**
 * Get all running preview servers.
 */
export function getAllPreviews(): Array<{ projectId: string; url: string; port: number }> {
  return [...previews.values()].map((p) => ({
    projectId: p.projectId,
    url: p.url,
    port: p.port,
  }));
}

/**
 * Restart a preview server (e.g., after a new build).
 */
export async function restartPreviewServer(projectId: string, rootDir: string): Promise<boolean> {
  await stopPreviewServer(projectId);
  // Small delay to allow port to be fully released
  await new Promise((r) => setTimeout(r, 500));
  return startPreviewServer(projectId, rootDir);
}

// ─── Utility ──────────────────────────────────────────────────────

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const client = new (require("node:net").Socket as typeof import("node:net").Socket)();
      client.setTimeout(200);
      client.once("connect", () => {
        client.destroy();
        resolve();
      });
      client.once("timeout", () => {
        client.destroy();
        retry();
      });
      client.once("error", () => retry());
      client.connect(port, "127.0.0.1");
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Port ${port} not ready within ${timeoutMs}ms`));
        return;
      }
      setTimeout(check, 300);
    };

    check();
  });
}

/**
 * Cleanup all preview servers on gateway shutdown.
 */
export async function stopAllPreviews(): Promise<void> {
  for (const projectId of previews.keys()) {
    await stopPreviewServer(projectId);
  }
}
