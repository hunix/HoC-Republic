/**
 * AI Scientist Plugin — Entry Point
 *
 * 4 tools + 4 gateway RPCs for fully automated scientific discovery.
 */

import {
  initBridge,
  launchResearch,
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
  log.info(`[AI Scientist] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool(
    "scientist_research",
    "Launch a full AI Scientist research pipeline: idea generation → experiments → paper writing → review.",
    {
      type: "object",
      properties: {
        template: {
          type: "string",
          enum: ["nanoGPT", "2d_diffusion", "grokking", "custom"],
          description: "Research template",
        },
        topic: { type: "string", description: "Custom research topic/direction" },
        model: {
          type: "string",
          description: "LLM model for generation (default: claude-3-5-sonnet)",
        },
        num_ideas: { type: "number", description: "Number of ideas to generate (default: 5)" },
      },
      required: ["template"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "AI Scientist not available" };
      }
      return launchResearch({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        template: args.template as string,
        topic: args.topic as string | undefined,
        model: args.model as string | undefined,
        numIdeas: args.num_ideas as number | undefined,
      });
    },
  );

  registerTool(
    "scientist_job_status",
    "Check research pipeline progress and current phase.",
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
      return {
        id: job.id,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
        paperPath: job.paperPath,
        reviewScore: job.reviewScore,
        error: job.error,
      };
    },
  );

  registerTool(
    "scientist_cancel",
    "Cancel a queued research job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "scientist_queue_status",
    "View research queue statistics.",
    {
      type: "object",
      properties: {},
    },
    () => getQueueStatus(),
  );

  registerGateway("scientist.research", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return launchResearch({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      template: (p.template as string) ?? "nanoGPT",
      topic: p.topic as string | undefined,
    });
  });
  registerGateway("scientist.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });
  registerGateway("scientist.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return cancelJob(p.jobId as string);
  });
  registerGateway("scientist.queue-status", () => getQueueStatus());

  log.info("[AI Scientist] Plugin registered: 4 tools, 4 gateway RPCs");
}
