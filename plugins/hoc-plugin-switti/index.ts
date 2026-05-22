/**
 * Switti Plugin — Entry Point
 *
 * 4 tools + 4 gateway RPCs for fast text-to-image generation
 * using scale-wise transformers (CVPR 2025).
 */

import {
  initBridge,
  generate,
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
  log.info(`[Switti] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool(
    "switti_generate",
    "Generate an image from a text prompt using Switti (fast scale-wise transformer T2I).",
    {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Text description of the image to generate" },
        model: {
          type: "string",
          enum: ["Switti", "Switti-AR", "Switti-1024", "Switti-1024-AR"],
          description: "Model variant (default: Switti-1024)",
        },
        cfg: { type: "number", description: "Classifier-free guidance (default: 6.0)" },
        top_k: { type: "number", description: "Top-k sampling (default: 400)" },
        top_p: { type: "number", description: "Nucleus sampling (default: 0.95)" },
        seed: { type: "number", description: "Random seed (-1 for random)" },
      },
      required: ["prompt"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "Switti not available" };
      }
      return generate({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        prompt: args.prompt as string,
        model: args.model as string | undefined,
        cfg: args.cfg as number | undefined,
        topK: args.top_k as number | undefined,
        topP: args.top_p as number | undefined,
        seed: args.seed as number | undefined,
      });
    },
  );

  registerTool(
    "switti_job_status",
    "Check image generation job progress.",
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
        outputPath: job.outputPath,
        error: job.error,
      };
    },
  );

  registerTool(
    "switti_cancel",
    "Cancel a queued generation job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "switti_queue_status",
    "View generation queue statistics.",
    {
      type: "object",
      properties: {},
    },
    () => getQueueStatus(),
  );

  registerGateway("switti.generate", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return generate({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      prompt: (p.prompt as string) ?? "",
      model: p.model as string | undefined,
    });
  });
  registerGateway("switti.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });
  registerGateway("switti.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return cancelJob(p.jobId as string);
  });
  registerGateway("switti.queue-status", () => getQueueStatus());

  log.info("[Switti] Plugin registered: 4 tools, 4 gateway RPCs");
}
