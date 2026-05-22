/**
 * Deforum Plugin — Entry Point
 *
 * 4 tools + 4 gateway RPCs for animated Stable Diffusion.
 */

import {
  initBridge,
  createAnimation,
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
  log.info(`[Deforum] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool(
    "deforum_animate",
    "Generate AI-powered animations from text prompts using Stable Diffusion with 2D/3D/interpolation modes.",
    {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Text prompt for animation" },
        negative_prompt: { type: "string", description: "Negative prompt" },
        animation_mode: {
          type: "string",
          enum: ["2d", "3d", "interpolation", "ransac"],
          description: "Animation mode",
        },
        max_frames: { type: "number", description: "Total frames (default: 120)" },
        width: { type: "number", description: "Width (default: 512)" },
        height: { type: "number", description: "Height (default: 512)" },
        fps: { type: "number", description: "Frames per second (default: 15)" },
        seed: { type: "number", description: "Random seed (-1 for random)" },
        clip_guidance: { type: "boolean", description: "Enable CLIP guidance" },
      },
      required: ["prompt"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "Deforum not available" };
      }
      return createAnimation({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        prompt: args.prompt as string,
        negativePrompt: args.negative_prompt as string | undefined,
        animationMode: args.animation_mode as string | undefined,
        maxFrames: args.max_frames as number | undefined,
        width: args.width as number | undefined,
        height: args.height as number | undefined,
        fps: args.fps as number | undefined,
        seed: args.seed as number | undefined,
        clipGuidance: args.clip_guidance as boolean | undefined,
      });
    },
  );

  registerTool(
    "deforum_job_status",
    "Check animation generation progress.",
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
        currentFrame: job.currentFrame,
        videoPath: job.outputVideoPath,
        error: job.error,
      };
    },
  );

  registerTool(
    "deforum_cancel",
    "Cancel a queued animation job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "deforum_queue_status",
    "View animation queue statistics.",
    {
      type: "object",
      properties: {},
    },
    () => getQueueStatus(),
  );

  registerGateway("deforum.animate", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return createAnimation({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      prompt: (p.prompt as string) ?? "",
      animationMode: p.animationMode as string | undefined,
    });
  });
  registerGateway("deforum.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });
  registerGateway("deforum.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return cancelJob(p.jobId as string);
  });
  registerGateway("deforum.queue-status", () => getQueueStatus());

  log.info("[Deforum] Plugin registered: 4 tools, 4 gateway RPCs");
}
