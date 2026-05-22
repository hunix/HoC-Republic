import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { ToolHandlerMap, ToolSummaryMap } from "./sandbox-tools/types.js";

const logger = createSubsystemLogger("mcp-client");

export class McpClientManager {
  private clients = new Map<string, Client>();
  private transports = new Map<string, StdioClientTransport>();

  /**
   * Connect to a local stdio-based MCP server
   */
  async connectStdioServer(serverId: string, command: string, args: string[]): Promise<void> {
    if (this.clients.has(serverId)) {
      logger.warn(`MCP Server ${serverId} is already connected.`);
      return;
    }

    const transport = new StdioClientTransport({
      command,
      args,
      env: { ...process.env } as Record<string, string>, // Pass environment downstream
    });

    const client = new Client(
      { name: `hoc-mcp-client-${serverId}`, version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
    this.clients.set(serverId, client);
    this.transports.set(serverId, transport);

    logger.info(`Connected to MCP Server: ${serverId}`);
  }

  /**
   * Fetch all tools from an active MCP server
   */
  async getTools(serverId: string) {
    const client = this.clients.get(serverId);
    if (!client) { throw new Error(`MCP Server ${serverId} not found`); }

    const result = await client.listTools();
    return result.tools;
  }

  /**
   * Execute a tool natively exposed by the MCP server
   */
  async executeTool(serverId: string, toolName: string, args: Record<string, unknown>) {
    const client = this.clients.get(serverId);
    if (!client) { throw new Error(`MCP Server ${serverId} not found`); }

    const response = await client.callTool({
      name: toolName,
      arguments: args,
    });

    if (response.isError) {
      throw new Error(`MCP Tool Error [${toolName}]: ${JSON.stringify(response.content)}`);
    }

    const callResult = response as { content: unknown[]; isError?: boolean };

    // Format output
    return callResult.content
      .map((c: unknown) => {
        const content = c as { type?: string; text?: string };
        return content.type === "text" ? content.text : JSON.stringify(c);
      })
      .join("\n");
  }

  /**
   * Fetch all LLM-formatted tools across all active MCP servers
   */
  async getAllLlmTools() {
    const allTools: unknown[] = [];
    for (const serverId of this.clients.keys()) {
      const tools = await this.getLlmTools(serverId);
      allTools.push(...tools);
    }
    return allTools;
  }

  /**
   * Convert external MCP tools into internal HoC LLM format
   */
  async getLlmTools(serverId: string) {
    const tools = await this.getTools(serverId);
    return tools.map((t: unknown) => {
      const tool = t as { name: string, description?: string, inputSchema?: unknown };
      return {
        name: tool.name,
        description: tool.description || `[MCP Tool: ${serverId}]`,
        input_schema: tool.inputSchema,
      };
    });
  }

  /**
   * Convert external MCP tools into internal HoC standard ToolHandlers
   */
  async exportHandlers(serverId: string): Promise<{ handlers: ToolHandlerMap; summaries: ToolSummaryMap }> {
    const tools = await this.getTools(serverId);
    const handlers: ToolHandlerMap = {};
    const summaries: ToolSummaryMap = {};

    for (const t of tools) {
      // Map MCP name directly
      handlers[t.name] = async (input: unknown) => {
        logger.debug(`Invoking MCP tool ${t.name} on ${serverId}`);
        return this.executeTool(serverId, t.name, input as Record<string, unknown>);
      };
      
      summaries[t.name] = (input: unknown) => `🔌 MCP [${serverId}]: ${t.name} -> ${JSON.stringify(input)}`;
    }

    return { handlers, summaries };
  }

  /**
   * Load MCP servers from config file
   */
  async loadConfig(configPath: string) {
    try {
      const fs = await import("fs");
      if (!fs.existsSync(configPath)) { return; }
      
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      const servers = config.mcpServers || {};
      
      for (const [serverId, srv] of Object.entries(servers)) {
        const { command, args } = srv as { command?: string; args?: string[] };
        if (command && args) {
          logger.info(`Auto-loading MCP server: ${serverId} -> ${command} ${args.join(" ")}`);
          await this.connectStdioServer(serverId, command, args).catch(e => {
            logger.error(`Failed to start MCP server ${serverId}: ${e.message}`);
          });
        }
      }
    } catch (e: unknown) {
      logger.error(`Error loading MCP config: ${(e as Error).message}`);
    }
  }

  async closeAll() {
    for (const [id, transport] of this.transports.entries()) {
      await transport.close();
      logger.info(`Closed MCP Server: ${id}`);
    }
    this.clients.clear();
    this.transports.clear();
  }
}

// Global singleton instance
export const mcpManager = new McpClientManager();
