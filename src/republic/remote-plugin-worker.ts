/**
 * Remote Plugin Worker
 *
 * A drop-in replacement for PluginWorker that routes IPC calls over Redis
 * pub/sub to a worker process running on a remote cluster node.
 *
 * From the plugin bus's perspective, RemotePluginWorker has the same interface
 * as the local PluginWorker — it just transits messages through Redis channels
 * instead of Node.js child_process IPC.
 *
 * Message flow:
 *   Gateway (local) ──publish──▶ Redis channel "plugin:rpc:{targetNodeId}"
 *   Target node's ClusterAgent ──receives──▶ forwards to local PluginWorker
 *   PluginWorker result ──publish──▶ Redis channel "plugin:rpc:{sourceNodeId}"
 *   Gateway (local) ──receives──▶ resolves the pending promise
 */

import { randomUUID } from "node:crypto";
import type { HoCPluginManifest, HoCProviderConfig } from "./hoc-plugin-types.js";
import type { PluginHealthResult, WorkerMetrics } from "./plugin-ipc-types.js";
import { createSubsystemLogger } from "../logging.js";

const logger = createSubsystemLogger("cluster:remote-worker");

// ─── Remote IPC Message Types ──────────────────────────────────

/**
 * Messages sent between cluster nodes for remote plugin operations.
 * These travel over Redis pub/sub channels.
 */
export type ClusterPluginMsg =
  /** Request a remote node to spawn a plugin worker */
  | {
      type: "REMOTE_SPAWN";
      reqId: string;
      sourceNodeId: string;
      pluginId: string;
      manifest: HoCPluginManifest;
      pluginDir: string;
      dataDir: string;
    }
  /** Response to REMOTE_SPAWN */
  | {
      type: "SPAWN_RESULT";
      reqId: string;
      pluginId: string;
      success: boolean;
      error?: string;
      tools?: Array<{ name: string; description: string; schema: unknown }>;
      gatewayMethods?: string[];
      providers?: Array<{ name: string; config: HoCProviderConfig }>;
    }
  /** Remote tool call request */
  | {
      type: "REMOTE_CALL_TOOL";
      reqId: string;
      sourceNodeId: string;
      pluginId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  /** Remote gateway call request */
  | {
      type: "REMOTE_CALL_GATEWAY";
      reqId: string;
      sourceNodeId: string;
      pluginId: string;
      method: string;
      params: unknown;
    }
  /** Remote health check request */
  | {
      type: "REMOTE_HEALTH_CHECK";
      reqId: string;
      sourceNodeId: string;
      pluginId: string;
    }
  /** Result for any remote call */
  | {
      type: "REMOTE_RESULT";
      reqId: string;
      pluginId: string;
      result: unknown;
      error?: string;
    }
  /** Remote kill request */
  | {
      type: "REMOTE_KILL";
      reqId: string;
      sourceNodeId: string;
      pluginId: string;
    }
  /** Event forwarding from remote to local */
  | {
      type: "REMOTE_EVENT";
      pluginId: string;
      event: string;
      data: unknown;
    }
  /** Remote metrics report */
  | {
      type: "REMOTE_METRICS";
      pluginId: string;
      metrics: WorkerMetrics;
    };

// ─── Pending Call Tracker ──────────────────────────────────────

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Default timeout for remote calls (3 minutes, to account for network + processing) */
const REMOTE_CALL_TIMEOUT_MS = 180_000;

/** Default timeout for remote spawn (2 minutes) */
const REMOTE_SPAWN_TIMEOUT_MS = 120_000;

// ─── Remote Plugin Worker Class ──────────────────────────────────

export class RemotePluginWorker {
  ready = false;
  error: string | undefined;

  readonly tools = new Map<string, { description: string; schema: unknown }>();
  readonly gatewayMethods = new Set<string>();
  readonly providers = new Map<string, HoCProviderConfig>();
  readonly subscribedEvents = new Set<string>();

  /** Pending IPC calls awaiting a REMOTE_RESULT via Redis. */
  private pendingCalls = new Map<string, PendingCall>();

  /** Simulated metrics for remote workers. */
  private _metrics: WorkerMetrics;

  /** Callback for tool registration (used by plugin bus). */
  private _onRegisterTool?: (toolName: string, description: string, schema: unknown) => void;
  private _onRegisterGateway?: (method: string) => void;
  private _onRegisterProvider?: (name: string, config: HoCProviderConfig) => void;
  private _onSubscribeEvent?: (event: string) => void;
  private _onEmitEvent?: (event: string, data: unknown) => void;
  private _onCrash?: (exitCode: number | null, signal: string | null) => void;

  constructor(
    public readonly pluginId: string,
    public readonly manifest: HoCPluginManifest,
    public readonly targetNodeId: string,
    private readonly localNodeId: string,
    private readonly publishFn: (channel: string, msg: ClusterPluginMsg) => Promise<void>,
  ) {
    this._metrics = {
      pluginId,
      callCount: 0,
      failureCount: 0,
      lastCallAt: null,
      latency: { count: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, meanMs: 0 },
      restartCount: 0,
      lastRestartAt: null,
      memoryRssMb: null,
      circuitState: "closed",
      consecutiveFailures: 0,
    };
  }

  /** Set callbacks (same interface as local PluginWorker). */
  setCallbacks(cbs: {
    onRegisterTool: (toolName: string, description: string, schema: unknown) => void;
    onRegisterGateway: (method: string) => void;
    onRegisterProvider: (name: string, config: HoCProviderConfig) => void;
    onSubscribeEvent: (event: string) => void;
    onEmitEvent: (event: string, data: unknown) => void;
    onCrash: (exitCode: number | null, signal: string | null) => void;
  }): void {
    this._onRegisterTool = cbs.onRegisterTool;
    this._onRegisterGateway = cbs.onRegisterGateway;
    this._onRegisterProvider = cbs.onRegisterProvider;
    this._onSubscribeEvent = cbs.onSubscribeEvent;
    this._onEmitEvent = cbs.onEmitEvent;
    this._onCrash = cbs.onCrash;
  }

  /**
   * Request the remote node to spawn a plugin worker.
   * Waits for SPAWN_RESULT via Redis pub/sub.
   */
  async init(timeoutMs = REMOTE_SPAWN_TIMEOUT_MS): Promise<boolean> {
    const reqId = randomUUID();

    try {
      const result = await this.remoteCall<{
        success: boolean;
        error?: string;
        tools?: Array<{ name: string; description: string; schema: unknown }>;
        gatewayMethods?: string[];
        providers?: Array<{ name: string; config: HoCProviderConfig }>;
      }>(
        {
          type: "REMOTE_SPAWN",
          reqId,
          sourceNodeId: this.localNodeId,
          pluginId: this.pluginId,
          manifest: this.manifest,
          pluginDir: "", // Remote node uses its own plugin directory
          dataDir: "", // Remote node uses its own data directory
        },
        timeoutMs,
      );

      if (result && typeof result === "object" && "success" in result) {
        const spawnResult = result as {
          success: boolean;
          error?: string;
          tools?: Array<{ name: string; description: string; schema: unknown }>;
          gatewayMethods?: string[];
          providers?: Array<{ name: string; config: HoCProviderConfig }>;
        };

        if (spawnResult.success) {
          this.ready = true;

          // Register all tools/gateways/providers from the remote worker
          if (spawnResult.tools) {
            for (const tool of spawnResult.tools) {
              this.tools.set(tool.name, { description: tool.description, schema: tool.schema });
              this._onRegisterTool?.(tool.name, tool.description, tool.schema);
            }
          }
          if (spawnResult.gatewayMethods) {
            for (const method of spawnResult.gatewayMethods) {
              this.gatewayMethods.add(method);
              this._onRegisterGateway?.(method);
            }
          }
          if (spawnResult.providers) {
            for (const prov of spawnResult.providers) {
              this.providers.set(prov.name, prov.config);
              this._onRegisterProvider?.(prov.name, prov.config);
            }
          }

          logger.info(`Remote worker ready: ${this.pluginId} on ${this.targetNodeId}`);
          return true;
        } else {
          this.error = spawnResult.error ?? "Remote spawn failed";
          logger.error(`Remote spawn failed for ${this.pluginId}: ${this.error}`);
          return false;
        }
      }

      this.error = "Invalid spawn response";
      return false;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      logger.error(`Remote init failed for ${this.pluginId}: ${this.error}`);
      return false;
    }
  }

  /**
   * Call a tool on the remote worker.
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const reqId = randomUUID();
    this._metrics.callCount++;
    this._metrics.lastCallAt = Date.now();

    const start = Date.now();
    try {
      const result = await this.remoteCall(
        {
          type: "REMOTE_CALL_TOOL",
          reqId,
          sourceNodeId: this.localNodeId,
          pluginId: this.pluginId,
          toolName,
          args,
        },
        REMOTE_CALL_TIMEOUT_MS,
      );
      this._metrics.consecutiveFailures = 0;
      return result;
    } catch (err) {
      this._metrics.failureCount++;
      this._metrics.consecutiveFailures++;
      throw err;
    } finally {
      const elapsed = Date.now() - start;
      this.updateLatency(elapsed);
    }
  }

  /**
   * Call a gateway method on the remote worker.
   */
  async callGateway(method: string, params: unknown): Promise<unknown> {
    const reqId = randomUUID();
    return this.remoteCall(
      {
        type: "REMOTE_CALL_GATEWAY",
        reqId,
        sourceNodeId: this.localNodeId,
        pluginId: this.pluginId,
        method,
        params,
      },
      REMOTE_CALL_TIMEOUT_MS,
    );
  }

  /**
   * Health check the remote worker.
   */
  async healthCheck(): Promise<PluginHealthResult> {
    const reqId = randomUUID();
    try {
      const result = await this.remoteCall(
        {
          type: "REMOTE_HEALTH_CHECK",
          reqId,
          sourceNodeId: this.localNodeId,
          pluginId: this.pluginId,
        },
        30_000,
      );
      return result as PluginHealthResult;
    } catch {
      return { healthy: false, message: "Remote health check failed" };
    }
  }

  /**
   * Kill the remote worker.
   */
  async kill(): Promise<void> {
    const reqId = randomUUID();
    try {
      await this.remoteCall(
        {
          type: "REMOTE_KILL",
          reqId,
          sourceNodeId: this.localNodeId,
          pluginId: this.pluginId,
        },
        10_000,
      );
    } catch {
      logger.warn(`Remote kill timed out for ${this.pluginId} on ${this.targetNodeId}`);
    }

    this.ready = false;
    this.dispose();
  }

  /**
   * Handle an incoming Redis message directed at this worker (REMOTE_RESULT, etc.).
   */
  handleIncomingMessage(msg: ClusterPluginMsg): void {
    if (msg.type === "REMOTE_RESULT" && msg.pluginId === this.pluginId) {
      const pending = this.pendingCalls.get(msg.reqId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingCalls.delete(msg.reqId);

        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve(msg.result);
        }
      }
    } else if (msg.type === "SPAWN_RESULT" && msg.pluginId === this.pluginId) {
      // Handle spawn result specifically
      const pending = this.pendingCalls.get(msg.reqId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingCalls.delete(msg.reqId);
        pending.resolve(msg);
      }
    } else if (msg.type === "REMOTE_EVENT" && msg.pluginId === this.pluginId) {
      this._onEmitEvent?.(msg.event, msg.data);
    } else if (msg.type === "REMOTE_METRICS" && msg.pluginId === this.pluginId) {
      // Update local metrics mirror
      Object.assign(this._metrics, msg.metrics);
    }
  }

  /** Get current metrics snapshot. */
  getMetrics(): WorkerMetrics {
    return { ...this._metrics };
  }

  /** Clean up all pending calls. */
  dispose(): void {
    for (const [, pending] of this.pendingCalls) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Remote worker disposed"));
    }
    this.pendingCalls.clear();
  }

  // ─── Internal Helpers ──────────────────────────────────────────

  private async remoteCall<T = unknown>(
    msg: ClusterPluginMsg & { reqId: string },
    timeoutMs: number,
  ): Promise<T> {
    const channel = `plugin:rpc:${this.targetNodeId}`;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCalls.delete(msg.reqId);
        reject(
          new Error(
            `Remote call timed out after ${timeoutMs}ms (${msg.type} for ${this.pluginId})`,
          ),
        );
      }, timeoutMs);

      this.pendingCalls.set(msg.reqId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      this.publishFn(channel, msg).catch((err) => {
        clearTimeout(timer);
        this.pendingCalls.delete(msg.reqId);
        reject(new Error(`Failed to publish remote call: ${String(err)}`));
      });
    });
  }

  private updateLatency(durationMs: number): void {
    const lat = this._metrics.latency;
    lat.count++;
    // Simple running average (not a full rolling window for remote workers)
    lat.meanMs = lat.meanMs + (durationMs - lat.meanMs) / lat.count;
    lat.p50Ms = lat.meanMs * 0.9; // rough approximation
    lat.p95Ms = lat.meanMs * 1.8;
    lat.p99Ms = lat.meanMs * 2.5;
  }
}
