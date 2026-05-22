/**
 * Magentic-One Plugin — Entry Point
 *
 * 4 tools + 4 gateway RPCs for multi-agent task solving
 * using Microsoft AutoGen's MagenticOneGroupChat.
 */

import {
  initBridge,
  runTask,
  getJobStatus,
  cancelJob,
  getQueueStatus,
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
  log.info(`[Magentic-One] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool(
    "magentic_run_task",
    "Submit a complex task to Magentic-One multi-agent team (WebSurfer + FileSurfer + Coder + Orchestrator).",
    {
      type: "object",
      properties: {
        task: { type: "string", description: "Natural language task description" },
        agents: {
          type: "array",
          items: { type: "string", enum: ["orchestrator", "web-surfer", "file-surfer", "coder"] },
          description: "Which agents to include",
        },
        model: { type: "string", description: "LLM model for agents (default: gpt-4o)" },
        max_rounds: { type: "number", description: "Max orchestration rounds (default: 30)" },
      },
      required: ["task"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "Magentic-One not available" };
      }
      return runTask({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        task: args.task as string,
        agents: args.agents as string[] | undefined,
        model: args.model as string | undefined,
        maxRounds: args.max_rounds as number | undefined,
      });
    },
  );

  registerTool(
    "magentic_job_status",
    "Check task progress and agent activity.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => {
      const job = getJobStatus(args.job_id as string);
      if (!job) {
        return { error: "Job not found" };
      }
      return job;
    },
  );

  registerTool(
    "magentic_cancel",
    "Cancel a queued multi-agent task.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "magentic_queue_status",
    "View task queue statistics.",
    {
      type: "object",
      properties: {},
    },
    () => getQueueStatus(),
  );

  registerGateway("magentic.run-task", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return runTask({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      task: (p.task as string) ?? "",
    });
  });
  registerGateway("magentic.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });
  registerGateway("magentic.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return cancelJob(p.jobId as string);
  });
  registerGateway("magentic.queue-status", () => getQueueStatus());

  log.info("[Magentic-One] Plugin registered: 4 tools, 4 gateway RPCs");
}
