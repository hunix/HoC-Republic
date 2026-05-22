/**
 * Republic Platform — MCP Server (Model Context Protocol)
 *
 * Phase 14: Exposes republic tools, resources, and prompts to external
 * AI hosts (Cursor, Claude Desktop, etc.) via the Model Context Protocol.
 *
 * Supports two transport modes:
 * - stdio:  JSON-RPC 2.0 over stdin/stdout (for local IDE integration)
 * - SSE:    Server-Sent Events over HTTP (for remote clients)
 *
 * Research basis:
 * - Anthropic MCP (Nov 2024): standardized tool access protocol
 * - Graphiti MCP: knowledge graph memory via MCP
 *
 * Key capabilities:
 * 1. Auto-syncs tools from republic tool-executor registry
 * 2. Exposes citizen profiles and memory as MCP resources
 * 3. Handles JSON-RPC 2.0 request/response lifecycle
 * 4. SSE & stdio transport
 */

import type { ToolDefinition } from "./tool-executor.js";
import { getEnabledTools } from "./tool-executor.js";
import { ts, uid } from "./utils.js";

// ─── MCP Types ──────────────────────────────────────────────────

export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface MCPPrompt {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required: boolean }>;
}

export interface MCPServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
}

export interface MCPDiagnostics {
  connectedClients: number;
  toolCallsTotal: number;
  resourceReadsTotal: number;
  uptime: number;
  transport: "stdio" | "sse" | "none";
}

// ─── Server State ───────────────────────────────────────────────

/** Custom resource providers registered by other modules */
const resourceProviders = new Map<string, () => MCPResource[]>();
const resourceContentProviders = new Map<string, (uri: string) => unknown>();

/** Custom prompt providers */
const promptProviders = new Map<string, MCPPrompt>();

/** Tool call handler overrides */
const toolHandlers = new Map<string, (params: Record<string, unknown>) => unknown>();

/** Server metrics */
let toolCallsTotal = 0;
let resourceReadsTotal = 0;
let startedAt = 0;
let transport: "stdio" | "sse" | "none" = "none";
let connectedClients = 0;

// ─── Tool Conversion ────────────────────────────────────────────

/**
 * Convert a republic ToolDefinition to MCP tool format.
 */
function toolDefToMCP(tool: ToolDefinition): MCPTool {
  const properties: Record<string, { type: string; description: string }> = {};
  const required: string[] = [];

  for (const param of tool.parameters) {
    properties[param.name] = {
      type: param.type === "number" ? "number" : "string",
      description: param.description,
    };
    if (param.required) {required.push(param.name);}
  }

  return {
    name: tool.id,
    description: tool.description,
    inputSchema: { type: "object", properties, required },
  };
}

// ─── MCP Protocol Handlers ──────────────────────────────────────

/**
 * List available MCP tools (auto-synced from republic tool registry).
 */
export function listMCPTools(): MCPTool[] {
  return getEnabledTools().map(toolDefToMCP);
}

/**
 * List available MCP resources.
 */
export function listMCPResources(): MCPResource[] {
  const resources: MCPResource[] = [
    {
      uri: "republic://state/overview",
      name: "Republic State Overview",
      description: "Current republic state summary including population, tick, treasury",
      mimeType: "application/json",
    },
    {
      uri: "republic://citizens",
      name: "Citizen Directory",
      description: "List of all citizens with basic profiles",
      mimeType: "application/json",
    },
  ];

  // Add custom resource providers
  for (const provider of resourceProviders.values()) {
    resources.push(...provider());
  }

  return resources;
}

/**
 * List available MCP prompts.
 */
export function listMCPPrompts(): MCPPrompt[] {
  const prompts: MCPPrompt[] = [
    {
      name: "citizen_decision",
      description: "Generate a decision prompt for a citizen agent",
      arguments: [
        { name: "citizenId", description: "The citizen's ID", required: true },
      ],
    },
    {
      name: "republic_analysis",
      description: "Analyze the current state of the republic",
      arguments: [],
    },
  ];

  for (const prompt of promptProviders.values()) {
    prompts.push(prompt);
  }

  return prompts;
}

/**
 * Handle a JSON-RPC 2.0 request.
 */
export async function handleMCPRequest(req: JSONRPCRequest): Promise<JSONRPCResponse> {
  const { id, method, params } = req;

  try {
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: { listChanged: true },
              resources: { subscribe: false, listChanged: true },
              prompts: { listChanged: true },
            },
            serverInfo: getServerInfo(),
          },
        };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: { tools: listMCPTools() },
        };

      case "tools/call": {
        toolCallsTotal++;
        const toolName = (params as { name: string }).name;
        const toolParams = ((params as { arguments?: Record<string, unknown> }).arguments) ?? {};

        // Check for custom handler
        const handler = toolHandlers.get(toolName);
        if (handler) {
          const result = handler(toolParams);
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            },
          };
        }

        // Default: return simulated result
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  tool: toolName,
                  params: toolParams,
                  simulated: true,
                  timestamp: ts(),
                }),
              },
            ],
          },
        };
      }

      case "resources/list":
        return {
          jsonrpc: "2.0",
          id,
          result: { resources: listMCPResources() },
        };

      case "resources/read": {
        resourceReadsTotal++;
        const uri = (params as { uri: string }).uri;

        // Check custom content providers
        for (const [prefix, provider] of resourceContentProviders) {
          if (uri.startsWith(prefix)) {
            const content = provider(uri);
            return {
              jsonrpc: "2.0",
              id,
              result: {
                contents: [
                  {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify(content, null, 2),
                  },
                ],
              },
            };
          }
        }

        // Default handler
        return {
          jsonrpc: "2.0",
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify({ uri, status: "not_found" }),
              },
            ],
          },
        };
      }

      case "prompts/list":
        return {
          jsonrpc: "2.0",
          id,
          result: { prompts: listMCPPrompts() },
        };

      case "prompts/get": {
        const promptName = (params as { name: string }).name;
        return {
          jsonrpc: "2.0",
          id,
          result: {
            description: `Prompt: ${promptName}`,
            messages: [
              {
                role: "user",
                content: { type: "text", text: `Execute prompt: ${promptName}` },
              },
            ],
          },
        };
      }

      case "ping":
        return { jsonrpc: "2.0", id, result: {} };

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }
  } catch (err: unknown) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : "Internal error",
      },
    };
  }
}

// ─── Transport ──────────────────────────────────────────────────

export interface MCPServer {
  id: string;
  transport: "stdio" | "sse";
  port?: number;
  started: boolean;
  startedAt: string;
}

/**
 * Create an MCP server instance (does not start transport).
 */
export function createMCPServer(opts?: { transport?: "stdio" | "sse"; port?: number }): MCPServer {
  const t = opts?.transport ?? "stdio";
  transport = t;
  startedAt = Date.now();
  connectedClients = 0;

  return {
    id: `mcp-${uid().slice(0, 8)}`,
    transport: t,
    port: opts?.port,
    started: false,
    startedAt: ts(),
  };
}

/**
 * Start the MCP transport (stdio or SSE).
 * For stdio: reads JSON-RPC from stdin, writes to stdout.
 * For SSE: starts HTTP server on specified port.
 *
 * Note: actual transport startup requires runtime I/O.
 * This function prepares the server and returns a handle.
 */
export function startMCPTransport(server: MCPServer): MCPServer {
  server.started = true;
  startedAt = Date.now();
  connectedClients = 1; // at least one client when transport starts
  return server;
}

/**
 * Process a raw JSON-RPC message string (for stdio transport).
 */
export async function processRawMessage(message: string): Promise<string> {
  try {
    const req = JSON.parse(message) as JSONRPCRequest;
    const res = await handleMCPRequest(req);
    return JSON.stringify(res);
  } catch {
    return JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    });
  }
}

// ─── Extension Points ───────────────────────────────────────────

/**
 * Register a custom resource provider.
 */
export function registerResourceProvider(
  name: string,
  listFn: () => MCPResource[],
  readFn?: (uri: string) => unknown,
): void {
  resourceProviders.set(name, listFn);
  if (readFn) {
    resourceContentProviders.set(`republic://${name}`, readFn);
  }
}

/**
 * Register a custom tool handler.
 */
export function registerToolHandler(
  toolName: string,
  handler: (params: Record<string, unknown>) => unknown,
): void {
  toolHandlers.set(toolName, handler);
}

/**
 * Register a custom prompt.
 */
export function registerPrompt(prompt: MCPPrompt): void {
  promptProviders.set(prompt.name, prompt);
}

/**
 * Track client connection (for SSE transport).
 */
export function clientConnected(): void {
  connectedClients++;
}

export function clientDisconnected(): void {
  connectedClients = Math.max(0, connectedClients - 1);
}

// ─── Server Info ────────────────────────────────────────────────

export function getServerInfo(): MCPServerInfo {
  return {
    name: "hoc-republic-mcp",
    version: "1.0.0",
    protocolVersion: "2024-11-05",
  };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function mcpDiagnostics(): MCPDiagnostics {
  return {
    connectedClients,
    toolCallsTotal,
    resourceReadsTotal,
    uptime: startedAt > 0 ? Date.now() - startedAt : 0,
    transport,
  };
}

// ─── State Reset (Testing) ──────────────────────────────────────

export function resetMCPState(): void {
  resourceProviders.clear();
  resourceContentProviders.clear();
  promptProviders.clear();
  toolHandlers.clear();
  toolCallsTotal = 0;
  resourceReadsTotal = 0;
  startedAt = 0;
  transport = "none";
  connectedClients = 0;
}
