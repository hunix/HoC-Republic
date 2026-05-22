/**
 * MCP Server + ACP Bridge — Test Suite
 *
 * Tests for JSON-RPC 2.0 handling, tool/resource/prompt listing,
 * custom handlers, ACP agent registration, task sending, and incoming tasks.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createMCPServer,
  startMCPTransport,
  handleMCPRequest,
  processRawMessage,
  listMCPTools,
  listMCPResources,
  listMCPPrompts,
  registerResourceProvider,
  registerToolHandler,
  mcpDiagnostics,
  resetMCPState,
  type _JSONRPCRequest,
} from "../republic/mcp-server.js";
import {
  registerACPEndpoint,
  unregisterACPEndpoint,
  getACPAgent,
  listACPAgents,
  _getACPTask,
  _listACPTasks,
  setIncomingTaskHandler,
  handleACPIncoming,
  acpBridgeDiagnostics,
  resetACPState,
} from "../republic/acp-bridge.js";

describe("MCP Server", () => {
  beforeEach(() => {
    resetMCPState();
  });

  // ─── Server Lifecycle ───────────────────────────────────────
  describe("Server lifecycle", () => {
    it("creates a server with stdio transport", () => {
      const server = createMCPServer({ transport: "stdio" });
      expect(server.id).toBeDefined();
      expect(server.transport).toBe("stdio");
      expect(server.started).toBe(false);
    });

    it("starts transport", () => {
      const server = createMCPServer({ transport: "sse", port: 8080 });
      const started = startMCPTransport(server);
      expect(started.started).toBe(true);
    });
  });

  // ─── Tool Listing ──────────────────────────────────────────
  describe("Tool listing", () => {
    it("lists all enabled tools in MCP format", () => {
      const tools = listMCPTools();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0].name).toBeDefined();
      expect(tools[0].inputSchema.type).toBe("object");
    });

    it("includes graph memory tools", () => {
      const tools = listMCPTools();
      const graphTool = tools.find((t) => t.name === "graph_query");
      expect(graphTool).toBeDefined();
    });

    it("includes MCP/ACP tools", () => {
      const tools = listMCPTools();
      expect(tools.find((t) => t.name === "mcp_list_tools")).toBeDefined();
      expect(tools.find((t) => t.name === "acp_send_task")).toBeDefined();
    });
  });

  // ─── Resource Listing ──────────────────────────────────────
  describe("Resource listing", () => {
    it("lists default resources", () => {
      const resources = listMCPResources();
      expect(resources.length).toBeGreaterThanOrEqual(2);
      expect(resources.find((r) => r.uri === "republic://state/overview")).toBeDefined();
    });

    it("includes custom resource providers", () => {
      registerResourceProvider("test", () => [
        { uri: "republic://test/data", name: "Test Data", description: "Test resource", mimeType: "application/json" },
      ]);
      const resources = listMCPResources();
      expect(resources.find((r) => r.uri === "republic://test/data")).toBeDefined();
    });
  });

  // ─── Prompt Listing ────────────────────────────────────────
  describe("Prompt listing", () => {
    it("lists default prompts", () => {
      const prompts = listMCPPrompts();
      expect(prompts.length).toBeGreaterThanOrEqual(2);
      expect(prompts.find((p) => p.name === "citizen_decision")).toBeDefined();
    });
  });

  // ─── JSON-RPC Handler ─────────────────────────────────────
  describe("handleMCPRequest", () => {
    it("handles initialize", async () => {
      const res = await handleMCPRequest({
        jsonrpc: "2.0", id: 1, method: "initialize",
      });
      expect(res.result).toBeDefined();
      const result = res.result as { serverInfo: { name: string } };
      expect(result.serverInfo.name).toBe("hoc-republic-mcp");
    });

    it("handles tools/list", async () => {
      const res = await handleMCPRequest({
        jsonrpc: "2.0", id: 2, method: "tools/list",
      });
      const result = res.result as { tools: unknown[] };
      expect(result.tools.length).toBeGreaterThan(0);
    });

    it("handles tools/call", async () => {
      const res = await handleMCPRequest({
        jsonrpc: "2.0", id: 3, method: "tools/call",
        params: { name: "read_state", arguments: { path: "/citizens" } },
      });
      const result = res.result as { content: Array<{ text: string }> };
      expect(result.content[0].text).toContain("read_state");
    });

    it("handles tools/call with custom handler", async () => {
      registerToolHandler("custom_test", (params) => ({ echo: params }));
      const res = await handleMCPRequest({
        jsonrpc: "2.0", id: 4, method: "tools/call",
        params: { name: "custom_test", arguments: { hello: "world" } },
      });
      const result = res.result as { content: Array<{ text: string }> };
      expect(result.content[0].text).toContain("hello");
    });

    it("handles resources/list", async () => {
      const res = await handleMCPRequest({
        jsonrpc: "2.0", id: 5, method: "resources/list",
      });
      const result = res.result as { resources: unknown[] };
      expect(result.resources.length).toBeGreaterThan(0);
    });

    it("handles resources/read", async () => {
      const res = await handleMCPRequest({
        jsonrpc: "2.0", id: 6, method: "resources/read",
        params: { uri: "republic://state/overview" },
      });
      expect(res.result).toBeDefined();
    });

    it("handles ping", async () => {
      const res = await handleMCPRequest({
        jsonrpc: "2.0", id: 7, method: "ping",
      });
      expect(res.result).toEqual({});
    });

    it("returns error for unknown methods", async () => {
      const res = await handleMCPRequest({
        jsonrpc: "2.0", id: 8, method: "unknown/method",
      });
      expect(res.error?.code).toBe(-32601);
    });
  });

  // ─── Raw Message Processing ────────────────────────────────
  describe("processRawMessage", () => {
    it("processes valid JSON-RPC", async () => {
      const result = await processRawMessage(JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "ping",
      }));
      const parsed = JSON.parse(result);
      expect(parsed.result).toEqual({});
    });

    it("returns parse error for invalid JSON", async () => {
      const result = await processRawMessage("not json");
      const parsed = JSON.parse(result);
      expect(parsed.error.code).toBe(-32700);
    });
  });

  // ─── Diagnostics ───────────────────────────────────────────
  describe("Diagnostics", () => {
    it("tracks tool call count", async () => {
      await handleMCPRequest({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "test" },
      });
      const diag = mcpDiagnostics();
      expect(diag.toolCallsTotal).toBe(1);
    });
  });
});

describe("ACP Bridge", () => {
  beforeEach(() => {
    resetACPState();
  });

  // ─── Agent Registration ────────────────────────────────────
  describe("Agent registration", () => {
    it("registers an agent", () => {
      const agent = registerACPEndpoint("agent-1", "http://localhost:9000", "crewai", ["search"]);
      expect(agent.id).toBe("agent-1");
      expect(agent.framework).toBe("crewai");
      expect(agent.status).toBe("online");
    });

    it("updates existing agent", () => {
      registerACPEndpoint("agent-1", "http://localhost:9000");
      const updated = registerACPEndpoint("agent-1", "http://localhost:9001", "smolagents");
      expect(updated.url).toBe("http://localhost:9001");
      expect(updated.framework).toBe("smolagents");
    });

    it("unregisters agent", () => {
      registerACPEndpoint("agent-1", "http://localhost:9000");
      expect(unregisterACPEndpoint("agent-1")).toBe(true);
      expect(getACPAgent("agent-1")).toBeUndefined();
    });

    it("lists all agents", () => {
      registerACPEndpoint("a1", "http://a1.local");
      registerACPEndpoint("a2", "http://a2.local");
      expect(listACPAgents().length).toBe(2);
    });
  });

  // ─── Incoming Task Handling ────────────────────────────────
  describe("Incoming tasks", () => {
    it("handles agent/info request", async () => {
      const res = await handleACPIncoming({ method: "agent/info", agentId: "ext-1" });
      expect(res.ok).toBe(true);
      const data = res.data as { id: string };
      expect(data.id).toBe("republic");
    });

    it("queues incoming tasks without handler", async () => {
      const res = await handleACPIncoming({
        method: "task/send",
        agentId: "ext-1",
        payload: { description: "Analyze data" },
      });
      expect(res.ok).toBe(true);
      const data = res.data as { taskId: string };
      expect(data.taskId).toBeDefined();
    });

    it("processes incoming tasks with custom handler", async () => {
      setIncomingTaskHandler(async (task) => ({ result: `Processed: ${task.description}` }));
      const res = await handleACPIncoming({
        method: "task/send",
        agentId: "ext-1",
        payload: { description: "Analyze data" },
      });
      expect(res.ok).toBe(true);
      const data = res.data as { result: { result: string } };
      expect(data.result.result).toContain("Processed");
    });

    it("handles task/status request", async () => {
      // First create a task
      const createRes = await handleACPIncoming({
        method: "task/send",
        agentId: "ext-1",
        payload: { description: "Test" },
      });
      const taskId = (createRes.data as { taskId: string }).taskId;

      // Then check its status
      const statusRes = await handleACPIncoming({
        method: "task/status",
        agentId: "ext-1",
        payload: taskId,
      });
      expect(statusRes.ok).toBe(true);
    });

    it("returns error for unknown methods", async () => {
      const res = await handleACPIncoming({
        method: "unknown/method" as "task/send",
        agentId: "ext-1",
      });
      expect(res.ok).toBe(false);
    });
  });

  // ─── Diagnostics ───────────────────────────────────────────
  describe("Diagnostics", () => {
    it("returns comprehensive diagnostics", () => {
      registerACPEndpoint("a1", "http://a1.local");
      registerACPEndpoint("a2", "http://a2.local");
      const diag = acpBridgeDiagnostics();
      expect(diag.registeredAgents).toBe(2);
      expect(diag.onlineAgents).toBe(2);
    });
  });
});
