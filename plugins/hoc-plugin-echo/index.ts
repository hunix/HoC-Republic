/**
 * HoC Echo Plugin — Example Plugin
 *
 * This is a reference implementation showing how to build an HoC plugin.
 * It demonstrates:
 *   - Plugin lifecycle (init, shutdown, healthCheck)
 *   - Provider registration
 *   - Tool registration
 *   - Event subscription
 *   - Gateway method registration
 *
 * Use this as a template for building your own plugins.
 */

import type {
  HoCPluginContext,
  HoCPluginModule,
  HoCHealthStatus,
} from "../../src/republic/hoc-plugin-types.ts";

// ─── Plugin State ───────────────────────────────────────────────

let initialized = false;
let requestCount = 0;
let ctx: HoCPluginContext | null = null;

// ─── Lifecycle Exports ──────────────────────────────────────────

/**
 * Initialize the Echo plugin.
 * Called by the plugin manager during boot.
 */
export async function init(pluginCtx: HoCPluginContext): Promise<void> {
  ctx = pluginCtx;
  ctx.logger.info("Echo plugin initializing...");

  // Register as an inference provider
  ctx.registerProvider("echo", {
    available: true,
    models: ["echo-v1"],
    throughput: 1000, // Echo is instant
  });

  // Register a tool that citizens can use
  ctx.registerTools([
    {
      name: "echo_message",
      description: "Echoes back the input message. Useful for testing.",
      parameters: {
        message: { type: "string", description: "The message to echo" },
      },
      handler: async (params) => {
        requestCount++;
        const message = (params.message as string) || "Hello from Echo Plugin!";
        ctx?.logger.info(`Echo tool invoked: "${message}"`);
        return { echoed: message, timestamp: Date.now(), totalRequests: requestCount };
      },
    },
  ]);

  // Subscribe to Republic events
  ctx.on("tick:after", () => {
    // Optional: do something on each tick
  });

  // Register gateway RPC methods
  ctx.registerGateway("echo.ping", async () => {
    return { pong: true, uptime: Date.now(), requests: requestCount };
  });

  ctx.registerGateway("echo.status", async () => {
    return {
      initialized,
      requestCount,
      provider: "echo",
      models: ["echo-v1"],
    };
  });

  initialized = true;
  ctx.logger.info("Echo plugin ready!");
}

/**
 * Gracefully shut down the Echo plugin.
 * Called by the plugin manager during shutdown.
 */
export async function shutdown(): Promise<void> {
  ctx?.logger.info(`Echo plugin shutting down. Total requests served: ${requestCount}`);
  initialized = false;
  ctx = null;
}

/**
 * Health check for the Echo plugin.
 * Called periodically or on demand.
 */
export async function healthCheck(): Promise<HoCHealthStatus> {
  return {
    healthy: initialized,
    message: initialized ? `Echo running, ${requestCount} requests served` : "Not initialized",
    details: {
      requestCount,
      initialized,
    },
  };
}

// Default export for module-level import
const echoPlugin: HoCPluginModule = { init, shutdown, healthCheck };
export default echoPlugin;
