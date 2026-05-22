/**
 * HoC Plugin Declarative Loader
 *
 * Reads enhanced `hoc.plugin.json` manifests and auto-generates everything
 * that hand-coded plugins currently do manually:
 *   • Tool registrations (with handlers that delegate to the backend)
 *   • Gateway RPC methods
 *   • Job queue tools (submit, status, cancel, queue-status)
 *   • Health checks
 *   • Init/shutdown lifecycle
 *
 * A plugin is considered "declarative" if its manifest has a `backend` key.
 * Plugins without `backend` continue loading via the existing hand-coded path.
 *
 * This module is called from `hoc-plugin-manager.ts` — it does NOT replace it,
 * it extends it with an alternative loading strategy.
 */

import type {
  HoCPluginContext,
  HoCPluginManifest,
  HoCPluginRecord,
  HoCHealthStatus,
} from "./hoc-plugin-types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveBackend, type BackendAdapter, type BackendConfig } from "./hoc-plugin-backends.js";
import {
  createPluginJobQueue,
  registerQueue,
  unregisterQueue,
  type PluginJobQueue,
  type JobPriority,
} from "./hoc-plugin-job-queue.js";

const logger = createSubsystemLogger("declarative-loader");

// ─── State ──────────────────────────────────────────────────────

/** Track backend + queue per declarative plugin for cleanup on shutdown */
const pluginAdapters = new Map<string, { backend: BackendAdapter; queue?: PluginJobQueue }>();

// ─── Public API ─────────────────────────────────────────────────

/**
 * Check whether a manifest should be loaded via the declarative path.
 * Returns true if the manifest has a `backend` key.
 */
export function isDeclarativePlugin(manifest: HoCPluginManifest): boolean {
  return !!manifest.backend;
}

/**
 * Load and initialize a declarative plugin.
 *
 * Called from `hoc-plugin-manager.ts` when a manifest has `backend`.
 * Sets up the backend adapter, registers tools and gateway RPCs,
 * optionally creates a job queue, and wires up health checks.
 *
 * @param record  The plugin record (must have manifest with `backend`)
 * @param ctx     The plugin context (from the plugin manager)
 */
export async function loadDeclarativePlugin(
  record: HoCPluginRecord,
  ctx: HoCPluginContext,
): Promise<void> {
  const { manifest } = record;
  const backendConfig = manifest.backend as BackendConfig;

  logger.info(`Loading declarative plugin: ${manifest.name} (${manifest.id})`);

  // ─── 1. Create backend adapter ────────────────────────────
  const backend = resolveBackend(backendConfig, record.dataDir, ctx.logger);

  // ─── 2. Detect + install ──────────────────────────────────
  let status = await backend.detect();
  if (!status.ready) {
    ctx.logger.info(`Backend not ready — attempting install for ${manifest.id}...`);
    status = await backend.install();
  }

  if (!status.ready) {
    ctx.logger.warn(
      `Backend not ready for ${manifest.id}: ${status.errors.join(", ")}. Plugin in degraded mode.`,
    );
  }

  // ─── 3. Create job queue (if enabled) ─────────────────────
  let queue: PluginJobQueue | undefined;
  if (manifest.jobQueue) {
    const queueConfig = typeof manifest.jobQueue === "object" ? manifest.jobQueue : {};
    queue = createPluginJobQueue(manifest.id, backend, ctx.logger, queueConfig);
    registerQueue(manifest.id, queue);
    ctx.logger.info(
      `Job queue created for ${manifest.id} (max concurrent: ${queueConfig.maxConcurrent ?? 1})`,
    );
  }

  // ─── 4. Register tools from manifest ──────────────────────
  if (manifest.toolDefinitions) {
    for (const toolDef of manifest.toolDefinitions) {
      const toolSchema: Record<string, unknown> = {
        type: "object",
        properties: {} as Record<string, unknown>,
        required: [] as string[],
      };

      if (toolDef.params) {
        const props: Record<string, unknown> = {};
        const required: string[] = [];
        for (const [paramName, paramDef] of Object.entries(toolDef.params)) {
          const prop: Record<string, unknown> = { type: paramDef.type };
          if (paramDef.description) {
            prop.description = paramDef.description;
          }
          if (paramDef.enum) {
            prop.enum = paramDef.enum;
          }
          props[paramName] = prop;
          if (paramDef.required) {
            required.push(paramName);
          }
        }
        toolSchema.properties = props;
        if (required.length > 0) {
          toolSchema.required = required;
        }
      }

      ctx.registerTool(
        toolDef.name,
        toolDef.description,
        toolSchema,
        (args: Record<string, unknown>) => {
          if (!status.ready) {
            return { error: `${manifest.name} backend not available` };
          }

          // If the plugin has a job queue, submit as a job
          if (queue) {
            const priority = (args.priority as JobPriority) ?? "normal";
            delete args.priority; // Don't pass priority to the backend
            const job = queue.submit(toolDef.command, args, priority);
            return {
              jobId: job.id,
              status: job.status,
              message: `Job queued: ${job.id}`,
            };
          }

          // No job queue — execute directly
          return backend.execute(toolDef.command, args);
        },
      );
    }
    ctx.logger.info(`Registered ${manifest.toolDefinitions.length} tool(s) from manifest`);
  }

  // ─── 5. Auto-register job queue tools ─────────────────────
  if (queue) {
    const prefix = manifest.id.replace(/^hoc-plugin-/, "").replace(/-/g, "_");

    ctx.registerTool(
      `${prefix}_job_status`,
      `Check the status of a ${manifest.name} job.`,
      {
        type: "object",
        properties: { job_id: { type: "string", description: "Job ID" } },
        required: ["job_id"],
      },
      (args: Record<string, unknown>) => {
        const job = queue.getJob(args.job_id as string);
        if (!job) {
          return { error: "Job not found" };
        }
        return {
          id: job.id,
          status: job.status,
          progress: job.progress,
          output: job.output,
          error: job.error,
          createdAt: job.createdAt,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
        };
      },
    );

    ctx.registerTool(
      `${prefix}_cancel`,
      `Cancel a queued ${manifest.name} job.`,
      {
        type: "object",
        properties: { job_id: { type: "string", description: "Job ID" } },
        required: ["job_id"],
      },
      (args: Record<string, unknown>) => ({
        cancelled: queue.cancel(args.job_id as string),
      }),
    );

    ctx.registerTool(
      `${prefix}_queue_status`,
      `View ${manifest.name} job queue statistics.`,
      { type: "object", properties: {} },
      () => queue.getStats(),
    );

    ctx.logger.info(
      `Registered 3 job-queue tools: ${prefix}_job_status, ${prefix}_cancel, ${prefix}_queue_status`,
    );
  }

  // ─── 6. Register gateway RPCs from manifest ───────────────
  if (manifest.gatewayDefinitions) {
    for (const gwDef of manifest.gatewayDefinitions) {
      // Internal job-queue delegations use special names
      if (gwDef.delegateTo === "_job_status") {
        ctx.registerGateway(gwDef.method, ((params: unknown) => {
          if (!queue) {
            return { error: "No job queue" };
          }
          const p = params as Record<string, unknown>;
          return queue.getJob(p.jobId as string) ?? { error: "Job not found" };
        }) as never);
      } else if (gwDef.delegateTo === "_cancel") {
        ctx.registerGateway(gwDef.method, ((params: unknown) => {
          if (!queue) {
            return { error: "No job queue" };
          }
          const p = params as Record<string, unknown>;
          return { cancelled: queue.cancel(p.jobId as string) };
        }) as never);
      } else if (gwDef.delegateTo === "_queue_status") {
        ctx.registerGateway(gwDef.method, (() => {
          if (!queue) {
            return { error: "No job queue" };
          }
          return queue.getStats();
        }) as never);
      } else {
        // Regular delegation — forward to backend.execute()
        ctx.registerGateway(gwDef.method, ((params: unknown) => {
          const p = (params ?? {}) as Record<string, unknown>;
          if (!status.ready) {
            return { error: `${manifest.name} backend not available` };
          }
          if (queue) {
            const job = queue.submit(gwDef.delegateTo, p);
            return { jobId: job.id, status: job.status };
          }
          return backend.execute(gwDef.delegateTo, p);
        }) as never);
      }
    }
    ctx.logger.info(
      `Registered ${manifest.gatewayDefinitions.length} gateway RPC(s) from manifest`,
    );
  }

  // ─── 7. Subscribe to tick events for queue processing ─────
  if (queue) {
    ctx.on("tick:before", () => {
      queue.tick();
    });
  }

  // ─── 8. Store adapter reference for shutdown ──────────────
  pluginAdapters.set(manifest.id, { backend, queue });

  logger.info(
    `Declarative plugin loaded: ${manifest.name} v${manifest.version} ` +
      `(backend: ${backendConfig.type}, ready: ${status.ready})`,
  );
}

/**
 * Shut down a declarative plugin — called by plugin manager on deactivation.
 */
export async function shutdownDeclarativePlugin(pluginId: string): Promise<void> {
  const adapter = pluginAdapters.get(pluginId);
  if (!adapter) {
    return;
  }

  await adapter.backend.shutdown();
  if (adapter.queue) {
    unregisterQueue(pluginId);
  }
  pluginAdapters.delete(pluginId);
  logger.info(`Declarative plugin shut down: ${pluginId}`);
}

/**
 * Health check for a declarative plugin — called by plugin manager.
 */
export async function healthCheckDeclarativePlugin(pluginId: string): Promise<HoCHealthStatus> {
  const adapter = pluginAdapters.get(pluginId);
  if (!adapter) {
    return { healthy: false, message: "Plugin not loaded" };
  }

  const backendHealth = await adapter.backend.healthCheck();
  const queueStats = adapter.queue?.getStats();

  return {
    healthy: backendHealth.healthy,
    message: backendHealth.message,
    details: {
      ...backendHealth.details,
      queue: queueStats
        ? {
            total: queueStats.totalJobs,
            queued: queueStats.queuedJobs,
            running: queueStats.runningJobs,
            completed: queueStats.completedJobs,
            failed: queueStats.failedJobs,
          }
        : undefined,
    },
  };
}
