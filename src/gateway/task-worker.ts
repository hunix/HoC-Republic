/**
 * HoC Task Worker — Entry point for worker threads
 *
 * This file runs inside each worker thread spawned by task-pool.ts.
 * Each worker has its own V8 instance, event loop, and memory.
 * A crash here cannot affect the main gateway thread.
 *
 * Register task handlers below — they run in complete isolation.
 */

import { parentPort } from "node:worker_threads";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

// ─── Task Handler Registry ──────────────────────────────────────────────────

type TaskHandler = (params: unknown) => Promise<unknown>;

const taskHandlers: Record<string, TaskHandler> = {

  /** Run nvidia-smi to get GPU info — isolated from main thread */
  "gpu.info": async () => {
    let totalVramGB = 0;
    const gpus: Array<{ name: string; vramGB: number; vramUsedGB: number; utilization: number; temperature: number }> = [];
    try {
      const { stdout } = await execFileAsync("nvidia-smi", [
        "--query-gpu=name,memory.total,memory.used,utilization.gpu,temperature.gpu",
        "--format=csv,noheader,nounits",
      ], { encoding: "utf-8", timeout: 5000 });

      for (const line of stdout.trim().split("\n")) {
        const parts = line.split(",").map((s) => s.trim());
        if (parts.length >= 5) {
          const vramTotal = Math.round(parseInt(parts[1], 10) / 1024 * 10) / 10;
          const vramUsed = Math.round(parseInt(parts[2], 10) / 1024 * 10) / 10;
          gpus.push({
            name: parts[0],
            vramGB: vramTotal,
            vramUsedGB: vramUsed,
            utilization: parseInt(parts[3], 10),
            temperature: parseInt(parts[4], 10),
          });
          totalVramGB += vramTotal;
        }
      }
    } catch {
      /* nvidia-smi not available */
    }
    return { totalVramGB, gpus };
  },

  /** Recursively calculate directory size — async, non-blocking */
  "fs.dirSize": async (params) => {
    const { dirPath } = params as { dirPath: string };
    return _asyncDirSize(dirPath);
  },

  /** Multi-directory size scan — parallel */
  "fs.multiDirSize": async (params) => {
    const { dirs } = params as { dirs: string[] };
    const sizes = await Promise.all(dirs.map((d) => _asyncDirSize(d)));
    const result: Record<string, number> = {};
    for (let i = 0; i < dirs.length; i++) {
      result[dirs[i]] = sizes[i];
    }
    return result;
  },

  /** Run a shell command and return stdout — isolated */
  "shell.exec": async (params) => {
    const { cmd, args, timeoutMs } = params as { cmd: string; args?: string[]; timeoutMs?: number };
    const { stdout, stderr } = await execFileAsync(cmd, args ?? [], {
      encoding: "utf-8",
      timeout: timeoutMs ?? 30_000,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  },

  /** CPU-intensive JSON processing */
  "data.process": async (params) => {
    const { data, operation } = params as { data: unknown; operation: string };
    switch (operation) {
      case "sort":
        return Array.isArray(data) ? data.toSorted() : data;
      case "deduplicate":
        return Array.isArray(data) ? [...new Set(data)] : data;
      case "count":
        return Array.isArray(data) ? data.length : typeof data === "object" && data ? Object.keys(data).length : 0;
      default:
        return data;
    }
  },

  /** Health check — used to verify worker is alive */
  "health.ping": async () => {
    return { ok: true, workerTs: Date.now(), pid: process.pid };
  },
};

// ─── Async Directory Size ────────────────────────────────────────────────────

async function _asyncDirSize(dirPath: string): Promise<number> {
  try {
    let total = 0;
    const entries = await readdir(dirPath, { withFileTypes: true });
    const tasks: Promise<number>[] = [];
    for (const entry of entries) {
      const full = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        tasks.push(_asyncDirSize(full));
      } else if (entry.isFile()) {
        tasks.push(stat(full).then((s) => s.size).catch(() => 0));
      }
    }
    const sizes = await Promise.all(tasks);
    for (const s of sizes) { total += s; }
    return total;
  } catch {
    return 0;
  }
}

// ─── Message Handler ─────────────────────────────────────────────────────────

if (parentPort) {
  parentPort.on("message", async (msg: { type: string; id: string; taskName: string; params: unknown }) => {
    if (msg.type !== "run") { return; }

    const handler = taskHandlers[msg.taskName];
    if (!handler) {
      parentPort!.postMessage({ type: "error", id: msg.id, error: `Unknown task: ${msg.taskName}` });
      return;
    }

    try {
      const result = await handler(msg.params);
      parentPort!.postMessage({ type: "result", id: msg.id, result });
    } catch (err) {
      parentPort!.postMessage({
        type: "error",
        id: msg.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
