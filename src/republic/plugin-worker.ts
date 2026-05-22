/**
 * HoC Plugin Worker — Gateway-Side Handle (Enhanced)
 *
 * Wraps a single `child_process.fork()` worker and provides a typed API
 * for the plugin bus to interact with it.
 *
 * New in this version:
 *  - Circuit breaker (CLOSED → OPEN → HALF-OPEN) to short-circuit broken workers
 *  - Rolling latency window (200 samples) & adaptive call timeouts
 *  - Heartbeat keepalive (every 30 s) to detect silent hangs
 *  - IPC send queue with backpressure handling (pipe drain)
 *  - Per-worker telemetry (callCount, failureCount, p50/p95/p99, memory)
 *  - onCrash callback for the bus to trigger auto-restart
 */

import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HoCPluginManifest, HoCProviderConfig } from "./hoc-plugin-types.js";
import type {
  GWtoWorkerMsg,
  WorkerToGWMsg,
  PluginHealthResult,
  WorkerMetrics,
  LatencyStats,
} from "./plugin-ipc-types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("plugin-worker");

// ─── Constants ───────────────────────────────────────────────────

/** Initial timeout for INIT → READY handshake.
 *  Set to 5 minutes to allow heavy plugins (bark, magicanimate) to finish
 *  pip installs on first-run before timing out.
 */
const INIT_TIMEOUT_MS = 300_000;

/** Default per-call timeout (used until enough latency samples exist). */
const DEFAULT_CALL_TIMEOUT_MS = 120_000;

/** Minimum adaptive timeout floor. */
const MIN_CALL_TIMEOUT_MS = 10_000;

/** Maximum adaptive timeout ceiling. */
const MAX_CALL_TIMEOUT_MS = 300_000;

/** Circuit opens after this many consecutive call failures. */
const CIRCUIT_FAILURE_THRESHOLD = 5;

/** How long (ms) the circuit stays open before moving to HALF-OPEN. */
const CIRCUIT_RESET_INTERVAL_MS = 30_000;

/** Heartbeat interval — how often to ping the worker. */
const HEARTBEAT_INTERVAL_MS = 30_000;

/** Heartbeat must respond within this window or the worker is considered hung. */
const HEARTBEAT_TIMEOUT_MS = 10_000;

/** Size of the rolling latency sample window. */
const LATENCY_WINDOW_SIZE = 200;

// ─── Circuit Breaker ─────────────────────────────────────────────

type CircuitState = "closed" | "open" | "half-open";

class CircuitBreaker {
  state: CircuitState = "closed";
  consecutiveFailures = 0;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  /** Returns true if the call is allowed through. */
  allow(): boolean {
    return this.state !== "open";
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.state === "half-open") {
      this.state = "closed";
      logger.debug?.("Circuit closed (recovered).");
    }
  }

  recordFailure(pluginId: string): void {
    this.consecutiveFailures++;
    if (this.state === "half-open" || this.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
      if (this.state !== "open") {
        logger.warn(
          `[${pluginId}] Circuit OPEN after ${this.consecutiveFailures} consecutive failures.`,
        );
      }
      this.state = "open";
      if (this.resetTimer) {
        clearTimeout(this.resetTimer);
      }
      this.resetTimer = setTimeout(() => {
        this.state = "half-open";
        logger.info(`[${pluginId}] Circuit HALF-OPEN — probing worker.`);
      }, CIRCUIT_RESET_INTERVAL_MS);
    }
  }

  dispose(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
  }
}

// ─── Rolling Latency Window ──────────────────────────────────────

class LatencyWindow {
  private samples: number[] = [];

  record(durationMs: number): void {
    this.samples.push(durationMs);
    if (this.samples.length > LATENCY_WINDOW_SIZE) {
      this.samples.shift();
    }
  }

  stats(): LatencyStats {
    const n = this.samples.length;
    if (n === 0) {
      return { count: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, meanMs: 0 };
    }
    const sorted = [...this.samples].toSorted((a, b) => a - b);
    const pct = (p: number) => sorted[Math.min(Math.floor(n * p), n - 1)];
    const mean = this.samples.reduce((a, b) => a + b, 0) / n;
    return {
      count: n,
      p50Ms: Math.round(pct(0.5)),
      p95Ms: Math.round(pct(0.95)),
      p99Ms: Math.round(pct(0.99)),
      meanMs: Math.round(mean),
    };
  }

  /** Adaptive timeout: p99 * 3, clamped to [MIN, MAX]. */
  adaptiveTimeout(): number {
    const n = this.samples.length;
    if (n < 10) {
      return DEFAULT_CALL_TIMEOUT_MS;
    } // Not enough data
    const { p99Ms } = this.stats();
    return Math.min(MAX_CALL_TIMEOUT_MS, Math.max(MIN_CALL_TIMEOUT_MS, p99Ms * 3));
  }
}

// ─── IPC Send Queue ──────────────────────────────────────────────

class IpcSendQueue {
  private queue: GWtoWorkerMsg[] = [];
  private draining = false;

  constructor(private readonly proc: ChildProcess) {
    proc.on("drain" as never, () => {
      this.draining = false;
      this.flush();
    });
  }

  send(msg: GWtoWorkerMsg): void {
    if (!this.proc.connected) {
      return;
    }
    if (this.queue.length > 0 || this.draining) {
      this.queue.push(msg);
      return;
    }
    const ok = this.proc.send(msg);
    if (!ok) {
      // Backpressure — buffer until drain
      this.draining = true;
      this.queue.push(msg);
    }
  }

  private flush(): void {
    while (this.queue.length > 0 && !this.draining && this.proc.connected) {
      const msg = this.queue.shift()!;
      const ok = this.proc.send(msg);
      if (!ok) {
        this.draining = true;
        this.queue.unshift(msg); // put it back
        break;
      }
    }
  }

  get queueDepth(): number {
    return this.queue.length;
  }
}

// ─── Plugin Worker Class ─────────────────────────────────────────

export interface PluginWorkerCallbacks {
  onRegisterTool: (toolName: string, description: string, schema: unknown) => void;
  onRegisterGateway: (method: string) => void;
  onRegisterProvider: (name: string, config: HoCProviderConfig) => void;
  onSubscribeEvent: (event: string) => void;
  onEmitEvent: (event: string, data: unknown) => void;
  /** Invoked when the worker exits unexpectedly (bus uses this to auto-restart). */
  onCrash: (exitCode: number | null, signal: string | null) => void;
}

export class PluginWorker {
  /** Is the worker currently alive and usable? */
  ready = false;
  /** If the worker crashed or failed to init, the most recent error message. */
  error: string | undefined;

  // ─ Registrations ─
  readonly tools = new Map<string, { description: string; schema: unknown }>();
  readonly gatewayMethods = new Set<string>();
  readonly subscribedEvents = new Set<string>();

  // ─ Telemetry ─
  callCount = 0;
  failureCount = 0;
  lastCallAt: number | null = null;
  restartCount = 0;
  lastRestartAt: number | null = null;
  memoryRssMb: number | null = null;

  private readonly circuit = new CircuitBreaker();
  private readonly latency = new LatencyWindow();

  // ─ IPC / Lifecycle ─
  private proc: ChildProcess;
  private sendQueue!: IpcSendQueue;
  private pending = new Map<
    string,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      startedAt: number;
    }
  >();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: PluginWorkerCallbacks | null = null;

  constructor(
    public readonly pluginId: string,
    private readonly manifest: HoCPluginManifest,
    private readonly pluginDir: string,
    private readonly dataDir: string,
  ) {
    this.proc = this.spawnProcess();
  }

  // ─── Spawn ──────────────────────────────────────────────────

  private spawnProcess(): ChildProcess {
    const workerPath = resolveWorkerHostSync();
    const execArgv: string[] = [];
    if (workerPath.endsWith(".ts")) {
      const hasTsx = (() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require.resolve("tsx/esm");
          return true;
        } catch {
          return false;
        }
      })();
      if (hasTsx) {
        execArgv.push("--import", "tsx/esm");
      }
    }

    const proc = fork(workerPath, [], {
      execArgv,
      silent: false,
      env: { ...process.env },
    });

    this.sendQueue = new IpcSendQueue(proc);

    proc.on("message", (msg: WorkerToGWMsg) => this.handleMessage(msg));

    proc.on("exit", (code, signal) => {
      this.stopHeartbeat();
      const wasReady = this.ready;
      this.ready = false;
      this.error = `Worker exited (code=${code}, signal=${signal})`;
      // Reject all pending requests
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(this.error));
      }
      this.pending.clear();
      if (wasReady) {
        logger.warn(
          `[${this.pluginId}] Worker exited unexpectedly — code=${code}, signal=${signal}`,
        );
        this.callbacks?.onCrash(code, signal);
      }
    });

    proc.on("error", (err) => {
      logger.error(`[${this.pluginId}] Spawn error: ${err.message}`);
      this.error = err.message;
    });

    return proc;
  }

  // ─── Callbacks ──────────────────────────────────────────────

  setCallbacks(cbs: PluginWorkerCallbacks): void {
    this.callbacks = cbs;
  }

  // ─── Init ───────────────────────────────────────────────────

  async init(timeoutMs = INIT_TIMEOUT_MS): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        logger.warn(`[${this.pluginId}] Init timed out after ${timeoutMs / 1000}s`);
        this.error = "Init timed out";
        resolve(false);
      }, timeoutMs);

      const onMsg = (msg: WorkerToGWMsg) => {
        if (msg.type === "READY") {
          clearTimeout(timer);
          this.proc.off("message", onMsg);
          this.ready = true;
          this.startHeartbeat();
          resolve(true);
        } else if (msg.type === "ERROR" && !msg.reqId) {
          clearTimeout(timer);
          this.proc.off("message", onMsg);
          this.error = msg.message;
          logger.error(
            `[${this.pluginId}] Init error: ${msg.message}` + (msg.stack ? `\n${msg.stack}` : ""),
          );
          resolve(false);
        }
      };

      this.proc.on("message", onMsg);
      this.sendQueue.send({
        type: "INIT",
        manifest: this.manifest,
        pluginDir: this.pluginDir,
        dataDir: this.dataDir,
      });
    });
  }

  // ─── Heartbeat ──────────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(async () => {
      if (!this.ready) {
        return;
      }
      try {
        await this.ipcCall({ type: "HEALTH_CHECK", reqId: uid() }, HEARTBEAT_TIMEOUT_MS);
      } catch {
        logger.warn(`[${this.pluginId}] Heartbeat timed out — worker appears hung.`);
        this.ready = false;
        this.error = "Heartbeat timeout";
        this.callbacks?.onCrash(null, "HEARTBEAT_TIMEOUT");
        if (!this.proc.killed) {
          this.proc.kill("SIGKILL");
        }
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Prevent timer from keeping Node alive
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ─── Tool / Gateway Calls ────────────────────────────────────

  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    return this.guardedCall(() =>
      this.ipcCall({
        type: "CALL_TOOL",
        reqId: uid(),
        toolName,
        args,
      }),
    );
  }

  callGateway(method: string, params: unknown): Promise<unknown> {
    return this.guardedCall(() =>
      this.ipcCall({
        type: "CALL_GATEWAY",
        reqId: uid(),
        method,
        params,
      }),
    );
  }

  async healthCheck(): Promise<PluginHealthResult> {
    try {
      const result = await this.ipcCall(
        { type: "HEALTH_CHECK", reqId: uid() },
        HEARTBEAT_TIMEOUT_MS,
      );
      return result as PluginHealthResult;
    } catch (err) {
      return {
        healthy: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  emitEvent(event: string, data: unknown): void {
    if (this.ready) {
      this.sendQueue.send({ type: "EMIT_EVENT", event, data });
    }
  }

  emitEventBatch(events: Array<{ event: string; data: unknown }>): void {
    if (this.ready && events.length > 0) {
      this.sendQueue.send({ type: "EMIT_EVENT_BATCH", events });
    }
  }

  // ─── Shutdown ───────────────────────────────────────────────

  async shutdown(): Promise<void> {
    this.stopHeartbeat();
    this.circuit.dispose();
    if (!this.proc.killed) {
      this.sendQueue.send({ type: "SHUTDOWN" });
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (!this.proc.killed) {
            this.proc.kill("SIGKILL");
          }
          resolve();
        }, 5_000);
        this.proc.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    this.ready = false;
  }

  // ─── Metrics ────────────────────────────────────────────────

  getMetrics(): WorkerMetrics {
    return {
      pluginId: this.pluginId,
      callCount: this.callCount,
      failureCount: this.failureCount,
      lastCallAt: this.lastCallAt,
      latency: this.latency.stats(),
      restartCount: this.restartCount,
      lastRestartAt: this.lastRestartAt,
      memoryRssMb: this.memoryRssMb,
      circuitState: this.circuit.state,
      consecutiveFailures: this.circuit.consecutiveFailures,
    };
  }

  // ─── Private ────────────────────────────────────────────────

  /**
   * Run a call through the circuit breaker.
   * Records latency and updates success/failure counters.
   */
  private async guardedCall(fn: () => Promise<unknown>): Promise<unknown> {
    if (!this.circuit.allow()) {
      throw new Error(
        `[${this.pluginId}] Circuit is OPEN — worker is unhealthy. ` +
          `Will retry after ${CIRCUIT_RESET_INTERVAL_MS / 1000}s cooldown.`,
      );
    }

    this.callCount++;
    this.lastCallAt = Date.now();
    const start = Date.now();

    try {
      const result = await fn();
      const durationMs = Date.now() - start;
      this.latency.record(durationMs);
      this.circuit.recordSuccess();
      return result;
    } catch (err) {
      this.failureCount++;
      this.circuit.recordFailure(this.pluginId);
      throw err;
    }
  }

  private ipcCall(msg: GWtoWorkerMsg & { reqId: string }, timeoutMs?: number): Promise<unknown> {
    const timeout = timeoutMs ?? this.latency.adaptiveTimeout();
    return new Promise<unknown>((resolve, reject) => {
      const { reqId } = msg;
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        const elapsed = Date.now() - (this.pending.get(reqId)?.startedAt ?? Date.now());
        reject(
          new Error(
            `[${this.pluginId}] IPC call timed out after ${timeout / 1000}s ` +
              `(reqId=${reqId}, elapsed=${elapsed}ms)`,
          ),
        );
      }, timeout);

      this.pending.set(reqId, { resolve, reject, timer, startedAt: Date.now() });
      this.sendQueue.send(msg);
    });
  }

  private handleMessage(msg: WorkerToGWMsg): void {
    switch (msg.type) {
      case "RESULT": {
        const p = this.pending.get(msg.reqId);
        if (p) {
          clearTimeout(p.timer);
          this.pending.delete(msg.reqId);
          p.resolve(msg.result);
        }
        break;
      }

      case "ERROR": {
        if (msg.reqId) {
          const p = this.pending.get(msg.reqId);
          if (p) {
            clearTimeout(p.timer);
            this.pending.delete(msg.reqId);
            const err = new Error(msg.message);
            if (msg.stack) {
              err.stack = msg.stack;
            }
            if (msg.code) {
              (err as NodeJS.ErrnoException).code = msg.code;
            }
            p.reject(err);
          }
        } else {
          logger.error(`[${this.pluginId}] Worker error: ${msg.message}`);
          if (msg.stack) {
            logger.debug?.(`[${this.pluginId}] Stack:\n${msg.stack}`);
          }
        }
        break;
      }

      case "REGISTER_TOOL": {
        this.tools.set(msg.toolName, { description: msg.description, schema: msg.schema });
        this.callbacks?.onRegisterTool(msg.toolName, msg.description, msg.schema);
        break;
      }

      case "REGISTER_GATEWAY": {
        this.gatewayMethods.add(msg.method);
        this.callbacks?.onRegisterGateway(msg.method);
        break;
      }

      case "REGISTER_PROVIDER": {
        this.callbacks?.onRegisterProvider(msg.name, msg.config);
        break;
      }

      case "SUBSCRIBE_EVENT": {
        this.subscribedEvents.add(msg.event);
        this.callbacks?.onSubscribeEvent(msg.event);
        break;
      }

      case "EMIT_EVENT": {
        this.callbacks?.onEmitEvent(msg.event, msg.data);
        break;
      }

      case "MEMORY_REPORT": {
        this.memoryRssMb = msg.rssMb;
        const maxMb = (this.manifest as { maxMemoryMb?: number }).maxMemoryMb;
        if (maxMb && msg.rssMb > maxMb) {
          logger.warn(
            `[${this.pluginId}] RSS ${msg.rssMb} MB exceeds limit ${maxMb} MB — ` +
              `signalling bus to restart.`,
          );
          this.callbacks?.onCrash(null, "MEMORY_LIMIT_EXCEEDED");
        }
        break;
      }

      case "LOG": {
        const tag = `[${this.pluginId}]`;
        switch (msg.level) {
          case "info":
            logger.info(`${tag} ${msg.message}`);
            break;
          case "warn":
            logger.warn(`${tag} ${msg.message}`);
            break;
          case "error":
            logger.error(`${tag} ${msg.message}`);
            break;
          case "debug":
            logger.debug?.(`${tag} ${msg.message}`);
            break;
        }
        break;
      }
    }
  }
}

// ─── Helper: Resolve Worker Host ─────────────────────────────────

function resolveWorkerHostSync(): string {
  try {
    const thisDir = path.dirname(fileURLToPath(import.meta.url));
    const tsPath = path.join(thisDir, "plugin-worker-host.ts");
    const jsPath = path.join(thisDir, "plugin-worker-host.js");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { existsSync } = require("node:fs") as { existsSync: (p: string) => boolean };
    return existsSync(tsPath) ? tsPath : jsPath;
  } catch {
    return "plugin-worker-host.js";
  }
}

// ─── ID Generator ────────────────────────────────────────────────

let _seq = 0;
function uid(): string {
  return `req-${Date.now()}-${(++_seq).toString(36)}`;
}
