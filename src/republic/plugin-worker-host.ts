/**
 * HoC Plugin Worker Host
 *
 * This is the entry point that runs INSIDE every forked plugin worker process.
 * It is launched via child_process.fork() by plugin-worker.ts.
 *
 * Lifecycle:
 *   1. Receives INIT message from the gateway with manifest + dirs
 *   2. Builds a HoCPluginContext whose methods send IPC messages back to the gateway
 *      instead of registering locally
 *   3. Calls loadDeclarativePlugin() or loadPluginModule() + init()
 *   4. Sends READY when done (or ERROR if it fails)
 *   5. Handles subsequent CALL_TOOL / CALL_GATEWAY / HEALTH_CHECK / EMIT_EVENT / SHUTDOWN
 *
 * Each plugin runs in its own isolated OS process → plugin crashes, slow pip
 * installs, and blocking Python subprocesses cannot affect the gateway.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  HoCPluginContext,
  HoCPluginLogger,
  HoCPluginManifest,
  HoCPluginModule,
  HoCPluginRecord,
  HoCHealthStatus,
} from "./hoc-plugin-types.js";
import type { GWtoWorkerMsg, WorkerToGWMsg, PluginHealthResult } from "./plugin-ipc-types.js";
import {
  isDeclarativePlugin,
  loadDeclarativePlugin,
  healthCheckDeclarativePlugin,
} from "./hoc-plugin-declarative-loader.js";

// ─── IPC Helpers ─────────────────────────────────────────────────

function send(msg: WorkerToGWMsg): void {
  if (process.send) {
    process.send(msg);
  }
}

function log(level: "info" | "warn" | "error" | "debug", message: string): void {
  send({ type: "LOG", level, message });
}

const workerLog: HoCPluginLogger = {
  info: (msg) => log("info", msg),
  warn: (msg) => log("warn", msg),
  error: (msg) => log("error", msg),
  debug: (msg) => log("debug", msg),
};

// ─── Memory Reporting ────────────────────────────────────────────

const MEMORY_REPORT_INTERVAL_MS = 60_000; // Report RSS every 60 s

function startMemoryReporting(): void {
  const timer = setInterval(() => {
    const mem = process.memoryUsage();
    send({
      type: "MEMORY_REPORT",
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    });
  }, MEMORY_REPORT_INTERVAL_MS);
  // Unref so memory reporting doesn't prevent the worker from exiting cleanly
  if (timer.unref) {
    timer.unref();
  }
}

// ─── Local state ─────────────────────────────────────────────────

/**
 * Registered tools — keyed by name.
 * The handler is the actual function; called when CALL_TOOL arrives.
 */
const registeredTools = new Map<string, (args: Record<string, unknown>) => unknown>();

/**
 * Registered gateway handlers — keyed by method.
 */
const registeredGateway = new Map<string, (params: unknown) => unknown>();

/**
 * Event handlers registered by hand-coded plugins via ctx.on().
 * Used to dispatch EMIT_EVENT and EMIT_EVENT_BATCH messages.
 */
const registeredEventHandlers = new Map<string, Array<(data: unknown) => unknown>>();

/** Subscribed event names */
const subscribedEvents = new Set<string>();

/** Whether the declarative path was used (gates health check routing) */
let isDeclarative = false;
let currentManifestId = "";

/** For legacy hand-coded plugins: keep a reference to the loaded module */
let pluginModule: HoCPluginModule | null = null;

// ─── Plugin Context ───────────────────────────────────────────────

/**
 * Create the HoCPluginContext that plugins receive during init().
 *
 * Instead of registering with local maps (as the gateway does), each
 * method here MESSAGES THE GATEWAY over IPC so the gateway can maintain
 * its own registries and route calls to this worker.
 */
function buildPluginContext(record: HoCPluginRecord): HoCPluginContext {
  return {
    dataDir: record.dataDir,
    pluginDir: record.pluginDir,
    logger: workerLog,
    log: workerLog,

    registerProvider(name, config) {
      send({ type: "REGISTER_PROVIDER", name, config });
    },

    registerTools(tools) {
      for (const tool of tools) {
        // Keep local handler for execution
        registeredTools.set(tool.name, tool.handler as (args: Record<string, unknown>) => unknown);
        // Tell the gateway a new tool is available
        send({
          type: "REGISTER_TOOL",
          toolName: tool.name,
          description: tool.description,
          schema: tool.parameters ?? {},
        });
      }
    },

    registerTool(name, description, schema, handler) {
      registeredTools.set(name, handler as (args: Record<string, unknown>) => unknown);
      send({ type: "REGISTER_TOOL", toolName: name, description, schema });
    },

    on(event, handler) {
      // Store the handler locally for inbound EMIT_EVENT / EMIT_EVENT_BATCH messages.
      const existing = registeredEventHandlers.get(event) ?? [];
      existing.push(handler as (data: unknown) => unknown);
      registeredEventHandlers.set(event, existing);
      subscribedEvents.add(event);
      send({ type: "SUBSCRIBE_EVENT", event });
    },

    emit(event, data) {
      send({ type: "EMIT_EVENT", event, data });
    },

    registerGateway(method, handler) {
      registeredGateway.set(method, handler as (params: unknown) => unknown);
      // Also register the prefixed method for backward compat
      const prefixed = `plugin.${record.id}.${method}`;
      registeredGateway.set(prefixed, handler as (params: unknown) => unknown);
      send({ type: "REGISTER_GATEWAY", method });
    },
  };
}

// ─── Load Legacy (hand-coded) Plugin ─────────────────────────────

async function loadLegacyPlugin(record: HoCPluginRecord): Promise<void> {
  const { manifest, pluginDir } = record;
  const entryPoints = [
    path.join(pluginDir, "index.ts"),
    path.join(pluginDir, "index.js"),
    path.join(pluginDir, "index.mts"),
    path.join(pluginDir, "index.mjs"),
  ];

  if (manifest.lifecycle?.init) {
    const [file] = manifest.lifecycle.init.split("#");
    if (file) {
      entryPoints.unshift(path.join(pluginDir, file));
    }
  }

  let mod: HoCPluginModule | null = null;
  for (const entry of entryPoints) {
    if (fs.existsSync(entry)) {
      try {
        mod = (await import(pathToFileURL(entry).href)) as HoCPluginModule;
        break;
      } catch (err) {
        workerLog.warn(
          `Failed to load ${entry}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  pluginModule = mod;
  const ctx = buildPluginContext(record);

  if (mod?.init) {
    await mod.init(ctx);
  } else if (typeof mod?.default === "function") {
    await Promise.resolve(mod.default(ctx));
  }
}

// ─── Initialise Plugin ────────────────────────────────────────────

async function initPlugin(
  manifest: HoCPluginManifest,
  pluginDir: string,
  dataDir: string,
): Promise<void> {
  // Ensure data dir exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const record: HoCPluginRecord = {
    id: manifest.id,
    manifest,
    pluginDir,
    dataDir,
    status: "initializing",
    loadedAt: Date.now(),
  };

  currentManifestId = manifest.id;

  // Check env requirements
  if (manifest.requirements?.env) {
    const missing = manifest.requirements.env.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      workerLog.warn(`Missing env vars: ${missing.join(", ")} — skipping init`);
      return; // Non-fatal in degraded mode
    }
  }

  if (isDeclarativePlugin(manifest)) {
    isDeclarative = true;
    const ctx = buildPluginContext(record);
    await loadDeclarativePlugin(record, ctx);
  } else {
    await loadLegacyPlugin(record);
  }
}

// ─── Handle Health Check ──────────────────────────────────────────

async function handleHealthCheck(): Promise<PluginHealthResult> {
  if (isDeclarative) {
    try {
      const result: HoCHealthStatus = await healthCheckDeclarativePlugin(currentManifestId);
      return result;
    } catch (err) {
      return {
        healthy: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (pluginModule?.healthCheck) {
    try {
      return await pluginModule.healthCheck();
    } catch (err) {
      return {
        healthy: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return { healthy: true, message: "Running (no health check)" };
}

// ─── Main IPC Listener ────────────────────────────────────────────

let initialized = false;

process.on("message", async (rawMsg: GWtoWorkerMsg) => {
  switch (rawMsg.type) {
    case "INIT": {
      if (initialized) {
        // Ignore duplicate INIT (shouldn't happen but guard anyway)
        break;
      }
      initialized = true;
      try {
        await initPlugin(rawMsg.manifest, rawMsg.pluginDir, rawMsg.dataDir);
        startMemoryReporting(); // Begin periodic RSS reports
        send({ type: "READY" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        send({ type: "ERROR", message, stack });
      }
      break;
    }

    case "CALL_TOOL": {
      const { reqId, toolName, args } = rawMsg;
      const handler = registeredTools.get(toolName);
      if (!handler) {
        send({ type: "RESULT", reqId, result: { error: `Tool not found: ${toolName}` } });
        break;
      }
      try {
        const result = await Promise.resolve(handler(args));
        send({ type: "RESULT", reqId, result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        send({ type: "ERROR", reqId, message, stack });
      }
      break;
    }

    case "CALL_GATEWAY": {
      const { reqId, method, params } = rawMsg;
      // Try direct method, then prefixed
      const handler =
        registeredGateway.get(method) ??
        registeredGateway.get(`plugin.${currentManifestId}.${method}`);
      if (!handler) {
        send({ type: "RESULT", reqId, result: { error: `Gateway method not found: ${method}` } });
        break;
      }
      try {
        const result = await Promise.resolve(handler(params));
        send({ type: "RESULT", reqId, result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        send({ type: "ERROR", reqId, message, stack });
      }
      break;
    }

    case "HEALTH_CHECK": {
      const { reqId } = rawMsg;
      try {
        const result = await handleHealthCheck();
        send({ type: "RESULT", reqId, result });
      } catch (err) {
        send({
          type: "RESULT",
          reqId,
          result: { healthy: false, message: err instanceof Error ? err.message : String(err) },
        });
      }
      break;
    }

    case "EMIT_EVENT": {
      // Single event forwarded from the gateway bus fan-out.
      // No-op at the worker level — declarative loader drives its own tick loop.
      break;
    }

    case "EMIT_EVENT_BATCH": {
      // Batch of coalesced events from the gateway bus.
      // Same reasoning as EMIT_EVENT — no-op for declarative plugins.
      // Hand-coded plugins that registered ctx.on() handlers do need these though.
      for (const { event, data } of rawMsg.events) {
        // If there are native Node.js event listeners registered via ctx.on(), fire them.
        // The registeredEventHandlers map is maintained alongside registeredTools.
        const handlers = registeredEventHandlers.get(event);
        if (handlers) {
          for (const fn of handlers) {
            try {
              await Promise.resolve(fn(data));
            } catch {
              /* non-fatal */
            }
          }
        }
      }
      break;
    }

    case "SHUTDOWN": {
      if (isDeclarative) {
        const { shutdownDeclarativePlugin } = await import("./hoc-plugin-declarative-loader.js");
        await shutdownDeclarativePlugin(currentManifestId).catch(() => {});
      } else if (pluginModule?.shutdown) {
        await pluginModule.shutdown().catch(() => {});
      }
      process.exit(0);
    }
  }
});

// Propagate unexpected errors to the gateway
process.on("uncaughtException", (err) => {
  send({ type: "ERROR", message: `Uncaught: ${err.message}`, stack: err.stack });
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  send({ type: "ERROR", message: `Unhandled rejection: ${err.message}`, stack: err.stack });
});
