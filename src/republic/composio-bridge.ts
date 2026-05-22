/**
 * Composio MCP Bridge — SaaS Connector via Model Context Protocol
 *
 * Adapted from ComposioHQ/openclaw-composio-plugin. Connects to Composio's
 * managed MCP server to provide access to 850+ SaaS applications (Gmail,
 * Slack, GitHub, Notion, Jira, HubSpot, Salesforce, Google Drive, etc.)
 * through a single consumer key.
 *
 * Architecture:
 *   1. On init, fetches the tool list from the MCP server (sync, via fetch)
 *   2. Maintains an async MCP client for executing tool calls
 *   3. Exposes status, tool listing, and tool execution for citizens + UI
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("republic:composio-bridge");

// ── Types ─────────────────────────────────────────────────────────────────

interface ComposioTool {
  name: string;
  description: string;
  category: string;
  inputSchema: Record<string, unknown>;
}

interface ComposioStatus {
  connected: boolean;
  enabled: boolean;
  toolCount: number;
  lastSync: number;
  mcpUrl: string;
  error: string | null;
  upSince: number;
}

interface ComposioConfig {
  enabled: boolean;
  consumerKey: string;
  mcpUrl: string;
}

// ── State ─────────────────────────────────────────────────────────────────

let _config: ComposioConfig = {
  enabled: false,
  consumerKey: "",
  mcpUrl: "https://connect.composio.dev/mcp",
};

const _tools: Map<string, ComposioTool> = new Map();
let _connected = false;
let _lastSync = 0;
let _lastError: string | null = null;
let _upSince = 0;

// ── Init & Sync ───────────────────────────────────────────────────────────

/**
 * Initialize the Composio bridge. Call on gateway boot.
 * Reads config from the provided object (normally from openclaw.json).
 */
export function initComposio(config?: Partial<ComposioConfig>): void {
  if (config) {
    if (typeof config.enabled === "boolean") { _config.enabled = config.enabled; }
    if (typeof config.consumerKey === "string") { _config.consumerKey = config.consumerKey.trim(); }
    if (typeof config.mcpUrl === "string" && config.mcpUrl.trim()) { _config.mcpUrl = config.mcpUrl.trim(); }
  }

  // Also check environment variable
  if (!_config.consumerKey) {
    _config.consumerKey = process.env.COMPOSIO_CONSUMER_KEY ?? "";
  }

  if (!_config.enabled) {
    log.info("Composio plugin disabled");
    return;
  }

  if (!_config.consumerKey) {
    log.warn(
      "Composio: No consumer key configured. Set COMPOSIO_CONSUMER_KEY env var " +
      "or plugins.composio.consumerKey in config. Get key from dashboard.composio.dev",
    );
    _lastError = "No consumer key configured";
    return;
  }

  // Fetch tools async (non-blocking)
  syncTools().catch((err) => {
    log.error(`Composio tool sync failed: ${err instanceof Error ? err.message : String(err)}`);
  });
}

/**
 * Fetch tools from the Composio MCP server and register them locally.
 */
async function syncTools(): Promise<void> {
  try {
    log.info(`Fetching tools from ${_config.mcpUrl}`);

    const body = JSON.stringify({ jsonrpc: "2.0", id: "1", method: "tools/list" });

    const response = await fetch(_config.mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "x-consumer-api-key": _config.consumerKey,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    let raw = await response.text();

    // Handle SSE format: "event: message\ndata: {...}"
    const dataMatch = raw.match(/^data:\s*(.+)$/m);
    if (dataMatch) { raw = dataMatch[1]; }

    const parsed = JSON.parse(raw) as {
      error?: { message?: string };
      result?: {
        tools?: Array<{
          name: string;
          description?: string;
          inputSchema?: Record<string, unknown>;
        }>;
      };
    };

    if (parsed.error) {
      throw new Error(parsed.error.message ?? JSON.stringify(parsed.error));
    }

    const tools = parsed.result?.tools ?? [];
    _tools.clear();

    for (const tool of tools) {
      const category = extractCategory(tool.name);
      _tools.set(tool.name, {
        name: tool.name,
        description: tool.description ?? "",
        category,
        inputSchema: (tool.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
      });
    }

    _connected = true;
    _lastSync = Date.now();
    _lastError = null;
    _upSince = _upSince || Date.now();

    log.info(`Composio ready — ${_tools.size} tools registered`);
  } catch (err) {
    _lastError = err instanceof Error ? err.message : String(err);
    _connected = false;
    log.error(`Composio sync failed: ${_lastError}`);
  }
}

/**
 * Extract a category from a Composio tool name (e.g. "GMAIL_SEND_EMAIL" → "gmail")
 */
function extractCategory(name: string): string {
  const parts = name.split("_");
  return (parts[0] ?? "other").toLowerCase();
}

// ── Tool Execution ────────────────────────────────────────────────────────

/**
 * Call a Composio tool by name. Uses HTTP JSON-RPC against the MCP server.
 */
export async function callComposioTool(
  toolName: string,
  params: Record<string, unknown>,
): Promise<{ ok: boolean; result?: string; error?: string }> {
  if (!_config.enabled) {
    return { ok: false, error: "Composio plugin is disabled" };
  }
  if (!_connected) {
    return { ok: false, error: "Composio not connected — check consumer key" };
  }

  const tool = _tools.get(toolName);
  if (!tool) {
    return { ok: false, error: `Unknown tool: ${toolName}. Use republic.composio.tools to list available tools.` };
  }

  try {
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now().toString(),
      method: "tools/call",
      params: { name: toolName, arguments: params },
    });

    const response = await fetch(_config.mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "x-consumer-api-key": _config.consumerKey,
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });

    let raw = await response.text();
    const dataMatch = raw.match(/^data:\s*(.+)$/m);
    if (dataMatch) { raw = dataMatch[1]; }

    const parsed = JSON.parse(raw) as {
      error?: { message?: string };
      result?: {
        content?: Array<{ type: string; text?: string }>;
      };
    };

    if (parsed.error) {
      return { ok: false, error: parsed.error.message ?? "MCP call failed" };
    }

    const text = Array.isArray(parsed.result?.content)
      ? parsed.result.content
          .map((c) => c.type === "text" ? (c.text ?? "") : JSON.stringify(c))
          .join("\n")
      : JSON.stringify(parsed.result);

    return { ok: true, result: text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Tool call failed: ${msg}` };
  }
}

// ── Query APIs ────────────────────────────────────────────────────────────

export function getComposioStatus(): ComposioStatus {
  return {
    connected: _connected,
    enabled: _config.enabled,
    toolCount: _tools.size,
    lastSync: _lastSync,
    mcpUrl: _config.mcpUrl,
    error: _lastError,
    upSince: _upSince,
  };
}

export function listComposioTools(filter?: string): ComposioTool[] {
  const tools = Array.from(_tools.values());
  if (!filter) { return tools; }
  const q = filter.toLowerCase();
  return tools.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q),
  );
}

export function getComposioApps(): Array<{ name: string; toolCount: number }> {
  const categories = new Map<string, number>();
  for (const tool of _tools.values()) {
    categories.set(tool.category, (categories.get(tool.category) ?? 0) + 1);
  }
  return Array.from(categories.entries())
    .map(([name, toolCount]) => ({ name, toolCount }))
    .toSorted((a, b) => b.toolCount - a.toolCount);
}

export function getComposioConfig(): ComposioConfig {
  return { ..._config, consumerKey: _config.consumerKey ? "ck_****" : "" };
}

export function updateComposioConfig(updates: Partial<ComposioConfig>): void {
  if (typeof updates.enabled === "boolean") { _config.enabled = updates.enabled; }
  if (typeof updates.consumerKey === "string") { _config.consumerKey = updates.consumerKey.trim(); }
  if (typeof updates.mcpUrl === "string" && updates.mcpUrl.trim()) { _config.mcpUrl = updates.mcpUrl.trim(); }
}

export async function reconnectComposio(): Promise<{ ok: boolean; toolCount: number; error?: string }> {
  _tools.clear();
  _connected = false;
  _lastError = null;

  await syncTools();
  return {
    ok: _connected,
    toolCount: _tools.size,
    error: _lastError ?? undefined,
  };
}
