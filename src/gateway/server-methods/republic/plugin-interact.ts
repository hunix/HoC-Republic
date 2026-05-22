/**
 * Plugin Interaction — Gateway RPC Handlers
 *
 * Provides two generalized endpoints for the Plugin Detail Panels UI:
 *
 *  1. republic.plugins.invoke-tool — Execute any registered plugin tool by name
 *  2. republic.plugins.call-gateway — Call any plugin's gateway method
 *
 * These handlers enable the interactive plugin UI panels to directly
 * invoke plugin capabilities without needing per-plugin gateway wiring.
 */

import type { GatewayRequestHandlers } from "../types.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import { getPluginTool, getPluginGatewayMethod } from "../../../republic/hoc-plugin-manager.js";

const logger = createSubsystemLogger("gateway:plugin-interact");

export const pluginInteractHandlers: Partial<GatewayRequestHandlers> = {
  /**
   * Invoke a plugin tool by name with given parameters.
   *
   * Params:
   *   toolName: string — The registered tool name (e.g. "omnigen_generate")
   *   params: Record<string, unknown> — Parameters to pass to the tool
   *
   * Returns the tool result or an error if the tool is not found / fails.
   */
  "republic.plugins.invoke-tool": async ({ params, respond }) => {
    const p = params as { toolName?: string; params?: Record<string, unknown> };
    const toolName = p?.toolName;
    if (!toolName || typeof toolName !== "string") {
      respond(false, undefined, {
        code: "INVALID_PARAMS",
        message: "Missing required parameter: toolName",
      });
      return;
    }

    const handler = getPluginTool(toolName);
    if (typeof handler !== "function") {
      respond(false, undefined, {
        code: "NOT_FOUND",
        message: `Tool "${toolName}" is not registered or not available. Ensure the plugin providing this tool is activated.`,
      });
      return;
    }

    logger.info(`Invoking plugin tool: ${toolName}`);

    try {
      const result = await Promise.resolve(handler(p.params ?? {}));
      respond(true, { ok: true, toolName, result }, undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Plugin tool ${toolName} failed: ${message}`);
      respond(false, undefined, {
        code: "INTERNAL_ERROR",
        message: `Tool "${toolName}" failed: ${message}`,
      });
    }
  },

  /**
   * Call any plugin's gateway method by name with given parameters.
   *
   * Params:
   *   method: string — The gateway method name (e.g. "qwen3tts.speak")
   *   params: Record<string, unknown> — Parameters to pass to the method
   *
   * Returns the method result or an error if the method is not found / fails.
   */
  "republic.plugins.call-gateway": async ({ params, respond }) => {
    const p = params as { method?: string; params?: Record<string, unknown> };
    const method = p?.method;
    if (!method || typeof method !== "string") {
      respond(false, undefined, {
        code: "INVALID_PARAMS",
        message: "Missing required parameter: method",
      });
      return;
    }

    const handler = getPluginGatewayMethod(method) as ((params: unknown) => unknown) | undefined;
    if (typeof handler !== "function") {
      respond(false, undefined, {
        code: "NOT_FOUND",
        message: `Gateway method "${method}" is not registered or not available. Ensure the plugin providing this method is activated.`,
      });
      return;
    }

    logger.info(`Calling plugin gateway: ${method}`);

    try {
      const result = await Promise.resolve(handler(p.params ?? {}));
      respond(true, { ok: true, method, result }, undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`Plugin gateway ${method} failed: ${message}`);
      respond(false, undefined, {
        code: "INTERNAL_ERROR",
        message: `Gateway method "${method}" failed: ${message}`,
      });
    }
  },
};
