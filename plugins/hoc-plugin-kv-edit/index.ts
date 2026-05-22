/**
 * KV-Edit Plugin — Entry Point
 *
 * 4 tools + 4 gateway RPCs for training-free image editing
 * with precise background preservation (ICCV 2025).
 */

import {
  initBridge,
  editImage,
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
  log.info(`[KV-Edit] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool(
    "kvedit_edit",
    "Edit an image with precise background preservation. Supports object addition, removal, and replacement using FLUX + KV Cache.",
    {
      type: "object",
      properties: {
        image_path: { type: "string", description: "Path to the source image" },
        mask_path: { type: "string", description: "Optional mask image for edit region" },
        source_prompt: { type: "string", description: "Description of the original image" },
        target_prompt: { type: "string", description: "Description of the desired edit" },
        operation: {
          type: "string",
          enum: ["add", "remove", "replace"],
          description: "Edit operation",
        },
        skip_steps: {
          type: "number",
          description: "Inversion skip steps (higher = more change, default: 3)",
        },
        attn_scale: {
          type: "number",
          description: "Attention scale for bg continuity (default: 1.0)",
        },
        re_init: { type: "boolean", description: "Use image blending instead of inversion" },
        seed: { type: "number", description: "Random seed (-1 for random)" },
      },
      required: ["image_path", "source_prompt", "target_prompt"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "KV-Edit not available" };
      }
      return editImage({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        imagePath: args.image_path as string,
        maskPath: args.mask_path as string | undefined,
        sourcePrompt: args.source_prompt as string,
        targetPrompt: args.target_prompt as string,
        operation: args.operation as string | undefined,
        skipSteps: args.skip_steps as number | undefined,
        attnScale: args.attn_scale as number | undefined,
        reInit: args.re_init as boolean | undefined,
        seed: args.seed as number | undefined,
      });
    },
  );

  registerTool(
    "kvedit_job_status",
    "Check image editing job progress.",
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
    "kvedit_cancel",
    "Cancel a queued editing job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "kvedit_queue_status",
    "View editing queue statistics.",
    {
      type: "object",
      properties: {},
    },
    () => getQueueStatus(),
  );

  registerGateway("kvedit.edit", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return editImage({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      imagePath: (p.imagePath as string) ?? "",
      sourcePrompt: (p.sourcePrompt as string) ?? "",
      targetPrompt: (p.targetPrompt as string) ?? "",
    });
  });
  registerGateway("kvedit.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });
  registerGateway("kvedit.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return cancelJob(p.jobId as string);
  });
  registerGateway("kvedit.queue-status", () => getQueueStatus());

  log.info("[KV-Edit] Plugin registered: 4 tools, 4 gateway RPCs");
}
