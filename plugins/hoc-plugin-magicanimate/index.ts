/**
 * MagicAnimate Plugin — Entry Point
 *
 * Registers 4 tools and 4 gateway RPCs for human image animation
 * using DensePose motion transfer and diffusion models.
 *
 * ZERO-CONFIG: First run auto-clones repo + downloads models.
 */

import {
  initBridge,
  animate,
  getJobStatus,
  cancelJob,
  getQueueStatus,
  isReady,
} from "./adapter/hoc-bridge.ts";

// ─── Plugin Interface ───────────────────────────────────────────

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

// ─── Registration ───────────────────────────────────────────────

export default function register(ctx: PluginContext): void {
  const { dataDir, log, registerTool, registerGateway } = ctx;

  const status = initBridge(dataDir, log);
  log.info(`[MagicAnimate] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  // ─── Tools ──────────────────────────────────────────────────

  registerTool(
    "magicanimate_animate",
    "Animate a reference human image using a motion source (DensePose sequence). Produces a video.",
    {
      type: "object",
      properties: {
        reference_image: { type: "string", description: "Path to reference human image" },
        motion_source: {
          type: "string",
          description: "Path to DensePose video or motion sequence",
        },
        motion_type: {
          type: "string",
          enum: ["densepose", "video", "sequence"],
          description: "Type of motion source",
        },
        num_frames: { type: "number", description: "Number of frames to generate (default: 16)" },
        fps: { type: "number", description: "Frames per second (default: 8)" },
        seed: { type: "number", description: "Random seed (-1 for random)" },
        guidance_scale: { type: "number", description: "CFG scale (default: 7.5)" },
        num_inference_steps: { type: "number", description: "Denoising steps (default: 25)" },
      },
      required: ["reference_image", "motion_source"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "MagicAnimate not available" };
      }
      return animate({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        referenceImagePath: args.reference_image as string,
        motionSource: args.motion_source as string,
        motionType: args.motion_type as string | undefined,
        numFrames: args.num_frames as number | undefined,
        fps: args.fps as number | undefined,
        seed: args.seed as number | undefined,
        guidanceScale: args.guidance_scale as number | undefined,
        numInferenceSteps: args.num_inference_steps as number | undefined,
      });
    },
  );

  registerTool(
    "magicanimate_job_status",
    "Check the status and progress of an animation job.",
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
    "magicanimate_cancel",
    "Cancel a queued animation job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "magicanimate_queue_status",
    "View animation queue statistics.",
    { type: "object", properties: {} },
    () => getQueueStatus(),
  );

  // ─── Gateway RPCs ───────────────────────────────────────────

  registerGateway("magicanimate.animate", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return animate({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      referenceImagePath: (p.referenceImage as string) ?? "",
      motionSource: (p.motionSource as string) ?? "",
      motionType: p.motionType as string | undefined,
    });
  });

  registerGateway("magicanimate.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });

  registerGateway("magicanimate.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return cancelJob(p.jobId as string);
  });

  registerGateway("magicanimate.queue-status", () => getQueueStatus());

  log.info("[MagicAnimate] Plugin registered: 4 tools, 4 gateway RPCs");
}
