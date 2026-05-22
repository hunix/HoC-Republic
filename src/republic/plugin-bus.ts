/**
 * HoC Plugin Bus (Enhanced)
 *
 * Central registry of all active plugin worker processes.
 *
 * New in this version:
 *  - Auto-restart with exponential backoff (max 5 attempts per plugin)
 *  - Parallel health checks (Promise.allSettled)
 *  - batchActivatePlugins() with boot-priority ordering
 *  - Event batching / coalescing with 5 ms flush window
 *  - busGetMetrics() for UI/dashboard telemetry
 *  - Memory guard: worker memory reports trigger restart if over limit
 */

import type { HoCPluginManifest, HoCHealthStatus, HoCProviderConfig } from "./hoc-plugin-types.js";
import type { WorkerMetrics } from "./plugin-ipc-types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { registerProvider } from "./compute-router.js";
import { PluginWorker } from "./plugin-worker.js";
import { registerTool, getTool } from "./tool-executor.js";

const logger = createSubsystemLogger("plugin-bus");

// ─── Constants ───────────────────────────────────────────────────

/** Maximum auto-restart attempts before giving up. */
const MAX_RESTART_ATTEMPTS = 5;

/** Base delay (ms) for exponential backoff. Doubles each attempt, cap 60 s. */
const RESTART_BASE_DELAY_MS = 1_000;

/** Max backoff delay (ms). */
const RESTART_MAX_DELAY_MS = 60_000;

/**
 * Window (ms) for event batching.
 * High-frequency events emitted to the same worker within this window are
 * coalesced into a single EMIT_EVENT_BATCH IPC message.
 */
const EVENT_BATCH_WINDOW_MS = 5;

// ─── State ───────────────────────────────────────────────────────

/** Active workers keyed by plugin ID. */
const workers = new Map<string, PluginWorker>();

// Registration maps — rebuilt on each worker spawn
const toolOwners = new Map<string, string>();
const gatewayOwners = new Map<string, string>();
const eventSubscriptions = new Map<string, Set<string>>();

/** Restart tracking per plugin. */
const restartAttempts = new Map<string, number>();
const restartTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Pending manifest data for restart logic (so we don't need caller cooperation). */
const workerManifests = new Map<
  string,
  { manifest: HoCPluginManifest; pluginDir: string; dataDir: string }
>();

// ─── Event Batch Buffer ──────────────────────────────────────────

/** pending batched events per worker: pluginId → events[] */
const eventBatchBuffer = new Map<string, Array<{ event: string; data: unknown }>>();
/** Flush timer per worker. */
const eventBatchTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleEventFlush(pluginId: string): void {
  if (eventBatchTimers.has(pluginId)) {
    return;
  } // already scheduled
  const timer = setTimeout(() => {
    eventBatchTimers.delete(pluginId);
    const events = eventBatchBuffer.get(pluginId);
    if (!events || events.length === 0) {
      return;
    }
    eventBatchBuffer.delete(pluginId);
    const worker = workers.get(pluginId);
    if (worker?.ready) {
      worker.emitEventBatch(events);
    }
  }, EVENT_BATCH_WINDOW_MS);
  if (timer.unref) {
    timer.unref();
  }
  eventBatchTimers.set(pluginId, timer);
}

function queueEventForWorker(pluginId: string, event: string, data: unknown): void {
  const buf = eventBatchBuffer.get(pluginId) ?? [];
  buf.push({ event, data });
  eventBatchBuffer.set(pluginId, buf);
  scheduleEventFlush(pluginId);
}

// ─── Auto-Restart ────────────────────────────────────────────────

function scheduleRestart(pluginId: string): void {
  // Cancel any pending restart for this plugin
  const existing = restartTimers.get(pluginId);
  if (existing) {
    clearTimeout(existing);
  }

  const attempts = (restartAttempts.get(pluginId) ?? 0) + 1;
  restartAttempts.set(pluginId, attempts);

  if (attempts > MAX_RESTART_ATTEMPTS) {
    logger.error(
      `[${pluginId}] Exceeded max restart attempts (${MAX_RESTART_ATTEMPTS}). Plugin is degraded.`,
    );
    return;
  }

  const delay = Math.min(RESTART_MAX_DELAY_MS, RESTART_BASE_DELAY_MS * Math.pow(2, attempts - 1));

  logger.info(
    `[${pluginId}] Scheduling restart #${attempts} in ${delay / 1000}s ` +
      `(attempt ${attempts}/${MAX_RESTART_ATTEMPTS}).`,
  );

  const timer = setTimeout(async () => {
    restartTimers.delete(pluginId);
    const entry = workerManifests.get(pluginId);
    if (!entry) {
      return;
    }

    logger.info(`[${pluginId}] Auto-restarting worker...`);
    try {
      const worker = await spawnPluginWorker(entry.manifest, entry.pluginDir, entry.dataDir, {
        isRestart: true,
      });
      if (worker.ready) {
        // Reset restart counter on success
        restartAttempts.delete(pluginId);
        logger.info(`[${pluginId}] Auto-restart succeeded.`);
      } else {
        logger.warn(`[${pluginId}] Auto-restart failed: ${worker.error}`);
        scheduleRestart(pluginId); // try again
      }
    } catch (err) {
      logger.error(
        `[${pluginId}] Auto-restart threw: ${err instanceof Error ? err.message : String(err)}`,
      );
      scheduleRestart(pluginId);
    }
  }, delay);

  if (timer.unref) {
    timer.unref();
  }
  restartTimers.set(pluginId, timer);
}

// ─── Spawn ───────────────────────────────────────────────────────

interface SpawnOptions {
  initTimeoutMs?: number;
  /** Set to true when called from auto-restart (preserves restart counter). */
  isRestart?: boolean;
}

/**
 * Spawn a worker for the given plugin and wait for it to become ready.
 */
export async function spawnPluginWorker(
  manifest: HoCPluginManifest,
  pluginDir: string,
  dataDir: string,
  opts?: SpawnOptions,
): Promise<PluginWorker> {
  const pluginId = manifest.id;

  // Kill any existing worker first (without triggering restart)
  await _killWorker(pluginId, false);

  // Save manifest data for auto-restart
  workerManifests.set(pluginId, { manifest, pluginDir, dataDir });

  if (!opts?.isRestart) {
    restartAttempts.delete(pluginId);
  }

  logger.info(`[${pluginId}] Spawning worker${opts?.isRestart ? " (restart)" : ""}...`);

  const worker = new PluginWorker(pluginId, manifest, pluginDir, dataDir);

  // Wire up callbacks
  worker.setCallbacks({
    onRegisterTool(toolName: string, description: string, schema: unknown) {
      toolOwners.set(toolName, pluginId);
      
      // Phase 11: Auto-register plugin tools into the global meta-learning registry
      if (!getTool(toolName)) {
        registerTool({
          id: toolName,
          name: toolName.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          description: description,
          tier: 2, // Default plugins to external/tier-2 unless specified otherwise
          category: "computation", // Default category
          parameters: schema ? [{ name: "args", type: "object", required: true, description: "JSON schema matched args" }] : [],
          enabled: true,
          timeoutMs: 30000,
          estimatedCost: { computeMs: 100 },
        });
      }

      logger.info(`[${pluginId}] Registered tool: ${toolName}`);
    },
    onRegisterGateway(method: string) {
      gatewayOwners.set(method, pluginId);
      gatewayOwners.set(`plugin.${pluginId}.${method}`, pluginId);
      logger.info(`[${pluginId}] Registered gateway method: ${method}`);
    },
    onRegisterProvider(name: string, config: HoCProviderConfig) {
      registerProvider(`plugin-${pluginId}-${name}`, {
        available: config.available,
        models: config.models,
        throughput: config.throughput,
      });
      logger.info(`[${pluginId}] Registered provider: ${name}`);
    },
    onSubscribeEvent(event: string) {
      const subs = eventSubscriptions.get(event) ?? new Set<string>();
      subs.add(pluginId);
      eventSubscriptions.set(event, subs);
      logger.debug?.(`[${pluginId}] Subscribed to event: ${event}`);
    },
    onEmitEvent(event: string, data: unknown) {
      fanOutEvent(event, data, pluginId);
    },
    onCrash(_code: number | null, signal: string | null) {
      logger.warn(`[${pluginId}] Worker crashed (signal=${signal}). Scheduling auto-restart.`);
      scheduleRestart(pluginId);
    },
  });

  workers.set(pluginId, worker);

  const ready = await worker.init(opts?.initTimeoutMs);

  if (ready) {
    logger.info(`[${pluginId}] Worker ready.`);
  } else {
    logger.warn(`[${pluginId}] Worker did not become ready: ${worker.error ?? "unknown"}`);
  }

  return worker;
}

// ─── Kill ─────────────────────────────────────────────────────────

/** Internal kill — optionally cancel restart too. */
async function _killWorker(pluginId: string, cancelRestart = true): Promise<void> {
  if (cancelRestart) {
    const t = restartTimers.get(pluginId);
    if (t) {
      clearTimeout(t);
      restartTimers.delete(pluginId);
    }
    restartAttempts.delete(pluginId);
  }

  const worker = workers.get(pluginId);
  if (!worker) {
    return;
  }

  logger.info(`[${pluginId}] Shutting down worker.`);
  await worker.shutdown();
  workers.delete(pluginId);

  // Clean registrations
  for (const [toolName, owner] of toolOwners) {
    if (owner === pluginId) {
      toolOwners.delete(toolName);
    }
  }
  for (const [method, owner] of gatewayOwners) {
    if (owner === pluginId) {
      gatewayOwners.delete(method);
    }
  }
  for (const subs of eventSubscriptions.values()) {
    subs.delete(pluginId);
  }

  // Clean event batch state
  eventBatchBuffer.delete(pluginId);
  const t2 = eventBatchTimers.get(pluginId);
  if (t2) {
    clearTimeout(t2);
    eventBatchTimers.delete(pluginId);
  }
}

/**
 * Gracefully shut down a worker and cancel any pending auto-restart.
 * Call this when the USER explicitly deactivates a plugin.
 */
export async function killPluginWorker(pluginId: string): Promise<void> {
  workerManifests.delete(pluginId);
  await _killWorker(pluginId, true);
}

// ─── Batch Activation ────────────────────────────────────────────

interface BatchActivateOptions {
  initTimeoutMs?: number;
  /** Concurrency within each priority group. Default: 4. */
  concurrency?: number;
}

/**
 * Activate multiple plugins respecting boot priority.
 *
 * Plugins with the same priority are activated concurrently (up to `concurrency`
 * at a time). Higher-priority groups complete before lower-priority groups start.
 *
 * @returns Map of pluginId → { ok, error }
 */
export async function batchActivatePlugins(
  entries: Array<{ manifest: HoCPluginManifest; pluginDir: string; dataDir: string }>,
  opts?: BatchActivateOptions,
): Promise<Map<string, { ok: boolean; error?: string }>> {
  const concurrency = opts?.concurrency ?? 4;
  const results = new Map<string, { ok: boolean; error?: string }>();

  // Sort by bootPriority descending (higher = boot first)
  const sorted = [...entries].toSorted(
    (a, b) => (b.manifest.bootPriority ?? 50) - (a.manifest.bootPriority ?? 50),
  );

  // Group by priority level
  const groups = new Map<number, typeof sorted>();
  for (const entry of sorted) {
    const p = entry.manifest.bootPriority ?? 50;
    const g = groups.get(p) ?? [];
    g.push(entry);
    groups.set(p, g);
  }

  // Process each priority level sequentially
  const priorityLevels = [...groups.keys()].toSorted((a, b) => b - a);
  for (const level of priorityLevels) {
    const group = groups.get(level)!;
    logger.info(
      `Activating ${group.length} plugin(s) at priority ${level}: ` +
        group.map((e) => e.manifest.id).join(", "),
    );

    // Fan out within the group up to `concurrency` at a time
    for (let i = 0; i < group.length; i += concurrency) {
      const slice = group.slice(i, i + concurrency);
      const outcomes = await Promise.allSettled(
        slice.map(async (entry) => {
          const worker = await spawnPluginWorker(entry.manifest, entry.pluginDir, entry.dataDir, {
            initTimeoutMs: opts?.initTimeoutMs,
          });
          return { id: entry.manifest.id, worker };
        }),
      );

      for (const outcome of outcomes) {
        if (outcome.status === "fulfilled") {
          const { id, worker } = outcome.value;
          results.set(id, {
            ok: worker.ready,
            error: worker.ready ? undefined : (worker.error ?? "Worker not ready"),
          });
        } else {
          // Rejected — we might not know the plugin id, use a fallback
          const msg =
            outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
          logger.error(`Batch activation error: ${msg}`);
        }
      }
    }
  }

  return results;
}

// ─── Routing ─────────────────────────────────────────────────────

export async function busCallTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const pluginId = toolOwners.get(toolName);
  if (!pluginId) {
    return undefined;
  }
  const worker = workers.get(pluginId);
  if (!worker?.ready) {
    return { error: `Plugin ${pluginId} is not ready` };
  }
  return worker.callTool(toolName, args);
}

export async function busCallGateway(
  method: string,
  params: unknown,
): Promise<unknown> {
  const pluginId = gatewayOwners.get(method);
  if (!pluginId) {
    return undefined;
  }
  const worker = workers.get(pluginId);
  if (!worker?.ready) {
    return { error: `Plugin ${pluginId} is not ready` };
  }
  return worker.callGateway(method, params);
}

export function busHasTool(toolName: string): boolean {
  return toolOwners.has(toolName);
}
export function busHasGatewayMethod(method: string): boolean {
  return gatewayOwners.has(method);
}
export function busGetToolOwner(toolName: string): string | undefined {
  return toolOwners.get(toolName);
}
export function busGetAllTools(): string[] {
  return Array.from(toolOwners.keys());
}

// ─── Data-Parallel Fan-Out (Phase 5) ─────────────────────────────

export type FanOutStrategy = "round-robin" | "least-loaded" | "affinity-first";

export interface FanOutOptions {
  /** Distribution strategy. Default: "round-robin" */
  strategy?: FanOutStrategy;
  /** Maximum concurrent calls across all workers. Default: no limit */
  maxConcurrent?: number;
}

export interface FanOutResult<T = unknown> {
  /** Index from the original batch */
  index: number;
  /** Result (undefined if failed) */
  result?: T;
  /** Error message if this item failed */
  error?: string;
  /** Which plugin worker handled this item */
  workerId: string;
}

/**
 * Distribute a batch of work items across all workers that own a given tool.
 *
 * This enables data parallelism: e.g. splitting 30 TTS clips across 3 GPU
 * nodes, running 10 on each, and merging all results.
 *
 * @param toolName — The tool to call on each worker
 * @param batch — Array of arg objects, one per `callTool` invocation
 * @param opts — Distribution strategy and concurrency limits
 * @returns Array of results in the same order as the input batch
 */
export async function busCallToolFanOut<T = unknown>(
  toolName: string,
  batch: Array<Record<string, unknown>>,
  opts?: FanOutOptions,
): Promise<FanOutResult<T>[]> {
  const strategy = opts?.strategy ?? "round-robin";

  // Find ALL workers that have this tool registered
  const eligibleWorkers: Array<{ pluginId: string; worker: PluginWorker }> = [];
  for (const [pluginId, worker] of workers) {
    if (worker.ready && worker.tools.has(toolName)) {
      eligibleWorkers.push({ pluginId, worker });
    }
  }

  if (eligibleWorkers.length === 0) {
    logger.warn(`Fan-out: no eligible workers for tool "${toolName}"`);
    return batch.map((_, index) => ({
      index,
      error: `No worker found for tool "${toolName}"`,
      workerId: "none",
    }));
  }

  logger.info(
    `Fan-out: distributing ${batch.length} items across ${eligibleWorkers.length} workers for "${toolName}"`,
    {
      strategy,
      workerIds: eligibleWorkers.map((w) => w.pluginId),
    },
  );

  // Assign each batch item to a worker
  const assignments: Array<{
    index: number;
    args: Record<string, unknown>;
    worker: PluginWorker;
    pluginId: string;
  }> = [];

  if (strategy === "round-robin") {
    for (let i = 0; i < batch.length; i++) {
      const target = eligibleWorkers[i % eligibleWorkers.length];
      assignments.push({
        index: i,
        args: batch[i],
        worker: target.worker,
        pluginId: target.pluginId,
      });
    }
  } else if (strategy === "least-loaded") {
    // Sort workers by call count (least busy first), reassign round-robin on sorted order
    const sorted = [...eligibleWorkers].toSorted(
      (a, b) => a.worker.getMetrics().callCount - b.worker.getMetrics().callCount,
    );
    for (let i = 0; i < batch.length; i++) {
      const target = sorted[i % sorted.length];
      assignments.push({
        index: i,
        args: batch[i],
        worker: target.worker,
        pluginId: target.pluginId,
      });
    }
  } else {
    // affinity-first: use toolOwners to pick the "primary" worker first, overflow to others
    const primaryOwner = toolOwners.get(toolName);
    const primary = eligibleWorkers.find((w) => w.pluginId === primaryOwner) ?? eligibleWorkers[0];
    const others = eligibleWorkers.filter((w) => w.pluginId !== primary.pluginId);
    const all = [primary, ...others];

    for (let i = 0; i < batch.length; i++) {
      const target = all[i % all.length];
      assignments.push({
        index: i,
        args: batch[i],
        worker: target.worker,
        pluginId: target.pluginId,
      });
    }
  }

  // Execute all calls (respecting maxConcurrent if set)
  const maxConcurrent = opts?.maxConcurrent ?? assignments.length;
  const results: FanOutResult<T>[] = Array.from({ length: batch.length });

  // Process in chunks to respect concurrency limit
  for (let start = 0; start < assignments.length; start += maxConcurrent) {
    const chunk = assignments.slice(start, start + maxConcurrent);
    const chunkResults = await Promise.allSettled(
      chunk.map(async (assignment) => {
        const result = await assignment.worker.callTool(
          (assignment.args.toolName as string) ?? toolName,
          assignment.args,
        );
        return { index: assignment.index, result: result as T, workerId: assignment.pluginId };
      }),
    );

    for (const settled of chunkResults) {
      if (settled.status === "fulfilled") {
        results[settled.value.index] = {
          index: settled.value.index,
          result: settled.value.result,
          workerId: settled.value.workerId,
        };
      } else {
        // Find the assignment for this failed promise
        const failedIdx = chunk[chunkResults.indexOf(settled)]?.index ?? 0;
        results[failedIdx] = {
          index: failedIdx,
          error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
          workerId: chunk[chunkResults.indexOf(settled)]?.pluginId ?? "unknown",
        };
      }
    }
  }

  const succeeded = results.filter((r) => r.result !== undefined).length;
  logger.info(`Fan-out complete: ${succeeded}/${batch.length} succeeded for "${toolName}"`);

  return results;
}

// ─── Event Fan-out ────────────────────────────────────────────────

/**
 * Emit an event to all subscribed workers.
 * Events are coalesced via the batch buffer to minimise IPC messages.
 */
export function fanOutEvent(event: string, data: unknown, sourcePluginId?: string): void {
  const subs = eventSubscriptions.get(event);
  if (!subs || subs.size === 0) {
    return;
  }

  for (const pluginId of subs) {
    if (pluginId === sourcePluginId) {
      continue;
    }
    const worker = workers.get(pluginId);
    if (worker?.ready) {
      // Use batch buffer — events within same 5 ms window are coalesced
      queueEventForWorker(pluginId, event, data);
    }
  }
}

// ─── Health ───────────────────────────────────────────────────────

/**
 * Run health checks on all active workers in parallel.
 */
export async function busHealthCheckAll(): Promise<Record<string, HoCHealthStatus>> {
  const entries = Array.from(workers.entries());
  const results = await Promise.allSettled(
    entries.map(async ([pluginId, worker]) => {
      if (!worker.ready) {
        return {
          pluginId,
          result: {
            healthy: false,
            message: worker.error ?? "Worker not ready",
          } as HoCHealthStatus,
        };
      }
      const result = await worker.healthCheck();
      return { pluginId, result: result as HoCHealthStatus };
    }),
  );

  const out: Record<string, HoCHealthStatus> = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      out[r.value.pluginId] = r.value.result;
    }
  }
  return out;
}

export async function busHealthCheck(pluginId: string): Promise<HoCHealthStatus | null> {
  const worker = workers.get(pluginId);
  if (!worker) {
    return null;
  }
  return worker.healthCheck() as Promise<HoCHealthStatus>;
}

// ─── Metrics ─────────────────────────────────────────────────────

/**
 * Collect telemetry from all active workers.
 */
export function busGetMetrics(): WorkerMetrics[] {
  return Array.from(workers.values()).map((w) => w.getMetrics());
}

/**
 * Get metrics for a single plugin worker.
 */
export function busGetWorkerMetrics(pluginId: string): WorkerMetrics | null {
  return workers.get(pluginId)?.getMetrics() ?? null;
}

// ─── Inspection ──────────────────────────────────────────────────

export function getWorker(pluginId: string): PluginWorker | undefined {
  return workers.get(pluginId);
}

/** Number of pending restart timers (useful for tests / status pages). */
export function getBusRestartQueueSize(): number {
  return restartTimers.size;
}

// ─── Shutdown ────────────────────────────────────────────────────

/**
 * Gracefully shut down all workers.
 * Cancels all pending restart timers to ensure clean exit.
 */
export async function shutdownAllWorkers(): Promise<void> {
  logger.info("Shutting down all plugin workers...");

  // Cancel all pending restart timers first
  for (const [id, timer] of restartTimers) {
    clearTimeout(timer);
    restartTimers.delete(id);
  }
  restartAttempts.clear();
  workerManifests.clear();

  const ids = Array.from(workers.keys());
  await Promise.allSettled(ids.map((id) => _killWorker(id, false)));
  logger.info("All plugin workers shut down.");
}
