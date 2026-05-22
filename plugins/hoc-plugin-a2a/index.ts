/**
 * A2A Plugin — Entry Point
 *
 * 4 tools + 4 gateway RPCs for Agent2Agent communication.
 */

import {
  initBridge,
  discoverAgent,
  listAgents,
  sendTask,
  getTaskStatus,
  _cancelTask,
  _getQueueStatus,
  isReady,
} from "./adapter/hoc-bridge.ts";

export interface PluginContext {
  dataDir: string;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
  registerTool: (
    name: string,
    description: string,
    schema: unknown,
    handler: (args: Record<string, unknown>) => unknown,
  ) => void;
  registerGateway: (method: string, handler: (params: unknown) => unknown) => void;
}

export default function register(ctx: PluginContext): void {
  const { dataDir, log, registerTool, registerGateway } = ctx;
  const status = initBridge(dataDir, log);
  log.info(`[A2A] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool(
    "a2a_discover",
    "Discover an A2A-compliant agent by URL and retrieve its Agent Card.",
    {
      type: "object",
      properties: {
        url: { type: "string", description: "Base URL of the A2A agent" },
      },
      required: ["url"],
    },
    (args) => discoverAgent(args.url as string),
  );

  registerTool(
    "a2a_send_task",
    "Send a task to a remote A2A agent via JSON-RPC 2.0.",
    {
      type: "object",
      properties: {
        target_url: { type: "string", description: "A2A endpoint URL" },
        message: { type: "string", description: "Task message to send" },
      },
      required: ["target_url", "message"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "A2A not available" };
      }
      return sendTask({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        targetUrl: args.target_url as string,
        message: args.message as string,
      });
    },
  );

  registerTool(
    "a2a_task_status",
    "Check A2A task progress and results.",
    {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
    (args) => {
      const task = getTaskStatus(args.task_id as string);
      if (!task) {
        return { error: "Task not found" };
      }
      return {
        id: task.id,
        status: task.status,
        messages: task.messages.length,
        artifacts: task.artifacts.length,
        error: task.error,
      };
    },
  );

  registerTool(
    "a2a_list_agents",
    "List all discovered A2A agents.",
    {
      type: "object",
      properties: {},
    },
    () => ({ agents: listAgents() }),
  );

  registerGateway("a2a.discover", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return discoverAgent((p.url as string) ?? "");
  });
  registerGateway("a2a.send-task", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return sendTask({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      targetUrl: (p.targetUrl as string) ?? "",
      message: (p.message as string) ?? "",
    });
  });
  registerGateway("a2a.task-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getTaskStatus(p.taskId as string);
  });
  registerGateway("a2a.list-agents", () => ({ agents: listAgents() }));

  log.info("[A2A] Plugin registered: 4 tools, 4 gateway RPCs");
}
