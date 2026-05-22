/**
 * Republic Platform — Composio MCP RPC Handlers
 *
 * Gateway API for the Composio SaaS connector:
 *   - Status: connection health, tool count
 *   - Tools: searchable 850+ tool directory
 *   - Call: execute any Composio tool by name
 *   - Apps: list connected SaaS apps
 *   - Config: consumer key and MCP URL management
 *   - Reconnect: force re-sync with MCP server
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  getComposioStatus,
  listComposioTools,
  callComposioTool,
  getComposioApps,
  getComposioConfig,
  updateComposioConfig,
  reconnectComposio,
} from "../../../republic/composio-bridge.js";

export const composioHandlers: Partial<GatewayRequestHandlers> = {
  /** republic.composio.status — Connection health + tool statistics */
  "republic.composio.status": ({ respond }) => {
    respond(true, { ok: true, ...getComposioStatus() }, undefined);
  },

  /** republic.composio.tools — List available tools (with optional search filter) */
  "republic.composio.tools": ({ params, respond }) => {
    const { filter, limit = 100 } = (params ?? {}) as { filter?: string; limit?: number };
    const tools = listComposioTools(filter);
    respond(true, {
      ok: true,
      total: tools.length,
      tools: tools.slice(0, limit).map((t) => ({
        name: t.name,
        description: t.description,
        category: t.category,
      })),
    }, undefined);
  },

  /** republic.composio.call — Execute a Composio tool by name */
  "republic.composio.call": async ({ params, respond }) => {
    const { tool, args = {} } = (params ?? {}) as { tool?: string; args?: Record<string, unknown> };
    if (!tool) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing required parameter: tool"));
      return;
    }
    const result = await callComposioTool(tool, args);
    respond(true, { ok: result.ok, result: result.result, error: result.error }, undefined);
  },

  /** republic.composio.apps — List connected SaaS apps (categories with tool counts) */
  "republic.composio.apps": ({ respond }) => {
    respond(true, { ok: true, apps: getComposioApps() }, undefined);
  },

  /** republic.composio.config — Get/update Composio configuration */
  "republic.composio.config": ({ params, respond }) => {
    const { consumerKey, enabled, mcpUrl } = (params ?? {}) as {
      consumerKey?: string;
      enabled?: boolean;
      mcpUrl?: string;
    };

    if (consumerKey !== undefined || enabled !== undefined || mcpUrl !== undefined) {
      updateComposioConfig({ consumerKey, enabled, mcpUrl });
      respond(true, { ok: true, config: getComposioConfig(), updated: true }, undefined);
      return;
    }

    respond(true, { ok: true, config: getComposioConfig() }, undefined);
  },

  /** republic.composio.reconnect — Force re-sync with MCP server */
  "republic.composio.reconnect": async ({ respond }) => {
    const result = await reconnectComposio();
    respond(true, { ok: result.ok, toolCount: result.toolCount, error: result.error }, undefined);
  },
};
