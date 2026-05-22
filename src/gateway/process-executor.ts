/**
 * HoC Process Executor
 *
 * Runs external commands in separate processes with:
 * - Detached process spawning (separate console windows on Windows)
 * - Resource-aware scheduling via ResourceMonitor
 * - Process lifecycle tracking
 * - Output capture and streaming
 * - Automatic cleanup on gateway shutdown
 *
 * Usage:
 *   import { processExecutor } from './process-executor.js';
 *   const proc = processExecutor.spawn('pip', ['install', 'torch'], { detached: true });
 */

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProcessOptions {
  /** Run in a detached console window. Default: false */
  detached?: boolean;
  /** Working directory */
  cwd?: string;
  /** Environment variables (merged with process.env) */
  env?: Record<string, string>;
  /** Max runtime in ms. 0 = unlimited. Default: 0 */
  timeoutMs?: number;
  /** Resource classification for scheduling */
  resourceClass?: "cpu" | "gpu" | "io" | "network";
  /** 0=highest, 10=lowest. Default: 5 */
  priority?: number;
  /** Capture stdout/stderr. Default: true */
  capture?: boolean;
  /** Human-readable label for UI display */
  label?: string;
}

export interface ProcessInfo {
  id: string;
  pid: number;
  command: string;
  args: string[];
  label: string;
  status: "running" | "completed" | "failed" | "killed" | "timeout";
  exitCode: number | null;
  startedAt: number;
  endedAt: number | null;
  duration: number;
  resourceClass: string;
  stdout: string;
  stderr: string;
}

// ─── Process Executor ────────────────────────────────────────────────────────

let _procIdCounter = 0;

class ProcessExecutor extends EventEmitter {
  private processes = new Map<string, {
    proc: ChildProcess;
    info: ProcessInfo;
    timer: ReturnType<typeof setTimeout> | null;
  }>();

  /**
   * Spawn an external process
   */
  spawn(command: string, args: string[] = [], options?: ProcessOptions): ProcessInfo {
    const id = `proc_${++_procIdCounter}`;
    const opts = {
      detached: options?.detached ?? false,
      cwd: options?.cwd ?? process.cwd(),
      env: { ...process.env, ...options?.env },
      timeoutMs: options?.timeoutMs ?? 0,
      resourceClass: options?.resourceClass ?? "cpu",
      priority: options?.priority ?? 5,
      capture: options?.capture ?? true,
      label: options?.label ?? `${command} ${args.join(" ")}`.slice(0, 80),
    };

    const spawnOpts: Parameters<typeof spawn>[2] = {
      cwd: opts.cwd,
      env: opts.env,
      detached: opts.detached,
      stdio: opts.capture ? ["ignore", "pipe", "pipe"] : "ignore",
      // On Windows, use a new console window for detached
      ...(opts.detached && process.platform === "win32" ? { shell: true } : {}),
    };

    const proc = spawn(command, args, spawnOpts);

    // If detached, unref so gateway doesn't wait for it
    if (opts.detached) { proc.unref(); }

    const info: ProcessInfo = {
      id,
      pid: proc.pid ?? 0,
      command,
      args,
      label: opts.label,
      status: "running",
      exitCode: null,
      startedAt: Date.now(),
      endedAt: null,
      duration: 0,
      resourceClass: opts.resourceClass,
      stdout: "",
      stderr: "",
    };

    // Capture output (last 10KB per stream to avoid memory bloat)
    const maxCapture = 10_240;
    if (opts.capture && proc.stdout) {
      proc.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        info.stdout = (info.stdout + text).slice(-maxCapture);
        this.emit("output", { id, stream: "stdout", text });
      });
    }
    if (opts.capture && proc.stderr) {
      proc.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        info.stderr = (info.stderr + text).slice(-maxCapture);
        this.emit("output", { id, stream: "stderr", text });
      });
    }

    // Lifecycle handlers
    proc.on("exit", (code, signal) => {
      info.endedAt = Date.now();
      info.duration = info.endedAt - info.startedAt;
      info.exitCode = code;
      info.status = signal === "SIGTERM" || signal === "SIGKILL"
        ? "killed"
        : code === 0 ? "completed" : "failed";

      this.emit("exit", { id, exitCode: code, signal, duration: info.duration });

      // Clean up timer
      const entry = this.processes.get(id);
      if (entry?.timer) { clearTimeout(entry.timer); }

      // Keep process info for 5 minutes after exit for UI display
      setTimeout(() => { this.processes.delete(id); }, 300_000).unref?.();
    });

    proc.on("error", (err) => {
      info.status = "failed";
      info.stderr += `\n[spawn error] ${err.message}`;
      info.endedAt = Date.now();
      info.duration = info.endedAt - info.startedAt;
      this.emit("error", { id, error: err.message });
    });

    // Timeout
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (opts.timeoutMs > 0) {
      timer = setTimeout(() => {
        info.status = "timeout";
        proc.kill("SIGTERM");
        setTimeout(() => { proc.kill("SIGKILL"); }, 5000).unref?.();
      }, opts.timeoutMs);
      timer.unref?.();
    }

    this.processes.set(id, { proc, info, timer });

    console.info(
      `[process-executor] ▶ Spawned ${id}: ${command} ${args.join(" ")} ` +
      `(pid=${proc.pid}, ${opts.detached ? "detached" : "attached"}, ${opts.resourceClass})`,
    );

    return { ...info };
  }

  /** Kill a running process */
  kill(id: string): boolean {
    const entry = this.processes.get(id);
    if (!entry || entry.info.status !== "running") { return false; }
    entry.info.status = "killed";
    entry.proc.kill("SIGTERM");
    setTimeout(() => { entry.proc.kill("SIGKILL"); }, 5000).unref?.();
    return true;
  }

  /** List all tracked processes */
  list(): ProcessInfo[] {
    return [...this.processes.values()].map((e) => ({
      ...e.info,
      duration: e.info.endedAt
        ? e.info.endedAt - e.info.startedAt
        : Date.now() - e.info.startedAt,
    }));
  }

  /** Get info for a specific process */
  get(id: string): ProcessInfo | null {
    const entry = this.processes.get(id);
    if (!entry) { return null; }
    return {
      ...entry.info,
      duration: entry.info.endedAt
        ? entry.info.endedAt - entry.info.startedAt
        : Date.now() - entry.info.startedAt,
    };
  }

  /** Kill all running processes (for gateway shutdown) */
  killAll(): number {
    let killed = 0;
    for (const [id, entry] of this.processes) {
      if (entry.info.status === "running") {
        this.kill(id);
        killed++;
      }
    }
    if (killed > 0) {
      console.info(`[process-executor] 🛑 Killed ${killed} running processes`);
    }
    return killed;
  }

  /** Get summary metrics */
  getMetrics(): {
    running: number;
    completed: number;
    failed: number;
    total: number;
  } {
    const all = [...this.processes.values()];
    return {
      running: all.filter((e) => e.info.status === "running").length,
      completed: all.filter((e) => e.info.status === "completed").length,
      failed: all.filter((e) => e.info.status === "failed" || e.info.status === "timeout").length,
      total: all.length,
    };
  }
}

/** Singleton process executor */
export const processExecutor = new ProcessExecutor();
