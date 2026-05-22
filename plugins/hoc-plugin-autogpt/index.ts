/**
 * AutoGPT Platform Plugin — Entry Point
 *
 * Registers 6 tools and 6 gateway RPC methods to expose
 * autonomous AI agent capabilities to HoC citizens.
 *
 * Capabilities:
 *   • Create, deploy, and manage AI agents
 *   • Build block-based workflows
 *   • Execute agents with input parameters
 *   • Monitor execution progress and results
 *   • Access marketplace agents
 *
 * ZERO-CONFIG: First run auto-clones repo + probes API server.
 */

import {
  initBridge,
  listAgents,
  createAgent,
  runAgent,
  getExecutionStatus,
  cancelExecution,
  getPlatformStatusInfo,
  listWorkflows,
  isReady,
} from "./adapter/hoc-bridge.ts";

// ─── Plugin Interface ───────────────────────────────────────────

export interface PluginContext {
  dataDir: string;
  log: { info: (msg: string) => void; warn: (msg: string) => void; debug?: (msg: string) => void };
  registerTool: (
    name: string,
    description: string,
    schema: unknown,
    handler: (args: Record<string, unknown>) => unknown,
  ) => void;
  registerGateway: (method: string, handler: (params: unknown) => unknown) => void;
}

// ─── Registration ───────────────────────────────────────────────

export default async function register(ctx: PluginContext): Promise<void> {
  const { dataDir, log, registerTool, registerGateway } = ctx;

  // ─── Bootstrap ──────────────────────────────────────────────
  const status = await initBridge(dataDir, log);
  log.info(`[AutoGPT] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  // ─── Tools ──────────────────────────────────────────────────

  registerTool(
    "autogpt_create_agent",
    "Create a new AI agent on the AutoGPT platform. Returns the created agent details.",
    {
      type: "object",
      properties: {
        name: { type: "string", description: "Agent name" },
        description: { type: "string", description: "What this agent does" },
      },
      required: ["name", "description"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "AutoGPT platform not available" };
      }
      return createAgent(args.name as string, args.description as string);
    },
  );

  registerTool(
    "autogpt_run_agent",
    "Execute an AI agent with optional input parameters. Returns an execution ID for tracking.",
    {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "ID of the agent to run" },
        agent_name: { type: "string", description: "Name of the agent (for logging)" },
        input: { type: "object", description: "Input parameters for the agent" },
      },
      required: ["agent_id"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "AutoGPT platform not available" };
      }
      return runAgent({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        agentId: args.agent_id as string,
        agentName: (args.agent_name as string) ?? "Agent",
        input: args.input as Record<string, unknown> | undefined,
      });
    },
  );

  registerTool(
    "autogpt_list_agents",
    "List all available AI agents on the AutoGPT platform.",
    { type: "object", properties: {} },
    () => {
      if (!isReady()) {
        return { error: "AutoGPT platform not available" };
      }
      return listAgents();
    },
  );

  registerTool(
    "autogpt_execution_status",
    "Check the status and results of an agent execution.",
    {
      type: "object",
      properties: { execution_id: { type: "string" } },
      required: ["execution_id"],
    },
    (args) => {
      const exec = getExecutionStatus(args.execution_id as string);
      if (!exec) {
        return { error: "Execution not found" };
      }
      return {
        id: exec.id,
        agentName: exec.agentName,
        status: exec.status,
        output: exec.output,
        error: exec.error,
        startedAt: exec.startedAt,
        completedAt: exec.completedAt,
        stepsCompleted: exec.steps.filter((s) => s.status === "completed").length,
        totalSteps: exec.steps.length,
      };
    },
  );

  registerTool(
    "autogpt_cancel_execution",
    "Cancel a queued or running agent execution.",
    {
      type: "object",
      properties: { execution_id: { type: "string" } },
      required: ["execution_id"],
    },
    (args) => cancelExecution(args.execution_id as string),
  );

  registerTool(
    "autogpt_platform_status",
    "View AutoGPT platform health, active agents, and execution statistics.",
    { type: "object", properties: {} },
    () => getPlatformStatusInfo(),
  );

  // ─── Gateway RPCs ───────────────────────────────────────────

  registerGateway("autogpt.create-agent", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return createAgent((p.name as string) ?? "Untitled Agent", (p.description as string) ?? "");
  });

  registerGateway("autogpt.run-agent", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return runAgent({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      agentId: (p.agentId as string) ?? "",
      agentName: (p.agentName as string) ?? "Agent",
      input: p.input as Record<string, unknown> | undefined,
    });
  });

  registerGateway("autogpt.list-agents", () => listAgents());

  registerGateway("autogpt.execution-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getExecutionStatus(p.executionId as string);
  });

  registerGateway("autogpt.list-workflows", () => listWorkflows());

  registerGateway("autogpt.platform-status", () => getPlatformStatusInfo());

  log.info("[AutoGPT] Plugin registered: 6 tools, 6 gateway RPCs");
}
