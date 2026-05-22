/**
 * Open Lovable Plugin — Entry Point
 *
 * 4 tools + 4 gateway RPCs for AI-powered website cloning
 * and React app generation using Firecrawl.
 */

import {
  initBridge,
  cloneSite,
  getJobStatus,
  cancelJob,
  getQueueStatus,
  listJobs,
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
  log.info(`[Open Lovable] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool(
    "lovable_clone",
    "Clone any website URL and recreate it as a modern React app using Firecrawl + AI.",
    {
      type: "object",
      properties: {
        url: { type: "string", description: "Website URL to clone" },
        provider: {
          type: "string",
          enum: ["gemini", "anthropic", "openai", "groq"],
          description: "AI provider (default: gemini)",
        },
        sandbox: {
          type: "string",
          enum: ["vercel", "e2b"],
          description: "Sandbox provider (default: vercel)",
        },
        instructions: { type: "string", description: "Custom instructions for generation" },
      },
      required: ["url"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "Open Lovable not available" };
      }
      return cloneSite({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        url: args.url as string,
        provider: args.provider as string | undefined,
        sandbox: args.sandbox as string | undefined,
        instructions: args.instructions as string | undefined,
      });
    },
  );

  registerTool(
    "lovable_job_status",
    "Check website cloning/generation progress.",
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
        progress: job.progress,
        deployUrl: job.deployUrl,
        error: job.error,
      };
    },
  );

  registerTool(
    "lovable_cancel",
    "Cancel a queued cloning job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "lovable_queue_status",
    "View cloning/generation queue statistics.",
    {
      type: "object",
      properties: {},
    },
    () => getQueueStatus(),
  );

  registerGateway("lovable.clone", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return cloneSite({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      url: (p.url as string) ?? "",
      instructions: p.instructions as string | undefined,
    });
  });
  registerGateway("lovable.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });
  registerGateway("lovable.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return cancelJob(p.jobId as string);
  });
  registerGateway("lovable.queue-status", () => getQueueStatus());
  registerGateway("lovable.list-jobs", () => ({ jobs: listJobs() }));

  log.info("[Open Lovable] Plugin registered: 4 tools, 6 gateway RPCs");
}
