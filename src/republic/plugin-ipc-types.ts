/**
 * HoC Plugin IPC Protocol — Types (Enhanced)
 *
 * Defines all messages exchanged between the gateway process and each
 * plugin worker process (spawned via child_process.fork).
 *
 * Gateway → Worker  (GWtoWorkerMsg)
 * Worker  → Gateway (WorkerToGWMsg)
 *
 * Every request that expects a reply carries a `reqId` (UUID string).
 * The worker echoes `reqId` back in the corresponding `RESULT` message.
 */

import type { HoCPluginManifest, HoCProviderConfig } from "./hoc-plugin-types.js";

// ─── Gateway → Worker ────────────────────────────────────────────

export type GWtoWorkerMsg =
  /** Sent once right after fork. Worker initialises itself and replies with READY. */
  | {
      type: "INIT";
      manifest: HoCPluginManifest;
      pluginDir: string;
      dataDir: string;
    }
  /** Invoke a registered tool inside the worker. */
  | {
      type: "CALL_TOOL";
      reqId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  /** Invoke a registered gateway RPC handler inside the worker. */
  | {
      type: "CALL_GATEWAY";
      reqId: string;
      method: string;
      params: unknown;
    }
  /** Run a health check inside the worker and return result. */
  | { type: "HEALTH_CHECK"; reqId: string }
  /** Forward a single event to this worker. */
  | { type: "EMIT_EVENT"; event: string; data: unknown }
  /**
   * Deliver multiple events in a single IPC message (batched fan-out).
   * Workers process each entry sequentially to preserve ordering.
   */
  | { type: "EMIT_EVENT_BATCH"; events: Array<{ event: string; data: unknown }> }
  /** Ask the worker to clean up and exit. */
  | { type: "SHUTDOWN" };

// ─── Worker → Gateway ────────────────────────────────────────────

export type WorkerToGWMsg =
  /** Worker finished initialising — tools and gateway methods are now registered. */
  | { type: "READY" }
  /** Fatal or per-request error. Stack and code are optional but encouraged. */
  | { type: "ERROR"; reqId?: string; message: string; stack?: string; code?: string }
  /** Reply to CALL_TOOL / CALL_GATEWAY / HEALTH_CHECK. */
  | { type: "RESULT"; reqId: string; result: unknown }
  /** Worker wants to register a tool with the gateway. */
  | {
      type: "REGISTER_TOOL";
      toolName: string;
      description: string;
      schema: unknown;
    }
  /** Worker wants to register a gateway RPC method. */
  | { type: "REGISTER_GATEWAY"; method: string }
  /** Worker wants to register a compute provider. */
  | {
      type: "REGISTER_PROVIDER";
      name: string;
      config: HoCProviderConfig;
    }
  /** Worker wants to subscribe to a Republic event. */
  | { type: "SUBSCRIBE_EVENT"; event: string }
  /** Worker emits an event into the Republic event bus. */
  | { type: "EMIT_EVENT"; event: string; data: unknown }
  /**
   * Periodic memory usage report (sent every ~60 s).
   * Used by the bus to trigger restarts if RSS exceeds manifest.maxMemoryMb.
   */
  | { type: "MEMORY_REPORT"; rssMb: number; heapUsedMb: number }
  /** Log message from within the worker. */
  | { type: "LOG"; level: "info" | "warn" | "error" | "debug"; message: string };

// ─── Health Check Result ─────────────────────────────────────────

export interface PluginHealthResult {
  healthy: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

// ─── Telemetry ──────────────────────────────────────────────────

/** Rolling latency statistics aggregated per worker. */
export interface LatencyStats {
  /** Number of samples in the window. */
  count: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  /** Arithmetic mean latency in ms. */
  meanMs: number;
}

/** All telemetry tracked per active worker. */
export interface WorkerMetrics {
  pluginId: string;
  callCount: number;
  failureCount: number;
  lastCallAt: number | null;
  /** Recent latency percentiles (rolling 200-sample window). */
  latency: LatencyStats;
  /** Number of times this worker has been automatically restarted. */
  restartCount: number;
  lastRestartAt: number | null;
  /** Latest RSS reported by the worker (or null if no report received yet). */
  memoryRssMb: number | null;
  /** Circuit breaker state. */
  circuitState: "closed" | "open" | "half-open";
  /** Consecutive failures that contributed to the current circuit state. */
  consecutiveFailures: number;
}
