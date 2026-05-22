/**
 * StableAvatar Plugin — Entry Point
 *
 * 4 tools + 4 gateway RPCs for audio-driven avatar video synthesis.
 */

import {
  initBridge,
  generateAvatarVideo,
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
  log.info(`[StableAvatar] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool(
    "avatar_generate",
    "Generate infinite-length audio-driven avatar videos from a reference face image and audio input.",
    {
      type: "object",
      properties: {
        reference_image: { type: "string", description: "Path to reference face image" },
        audio: { type: "string", description: "Path to driving audio file" },
        mode: {
          type: "string",
          enum: ["base", "finetuned", "lora"],
          description: "Generation mode",
        },
        lora_path: { type: "string", description: "Path to LoRA weights (for lora mode)" },
        guidance_scale: { type: "number", description: "Audio guidance scale (default: 3.5)" },
        seed: { type: "number", description: "Random seed (-1 for random)" },
        fps: { type: "number", description: "Frames per second (default: 25)" },
      },
      required: ["reference_image", "audio"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "StableAvatar not available" };
      }
      return generateAvatarVideo({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        referenceImagePath: args.reference_image as string,
        audioPath: args.audio as string,
        mode: args.mode as string | undefined,
        loraPath: args.lora_path as string | undefined,
        guidanceScale: args.guidance_scale as number | undefined,
        seed: args.seed as number | undefined,
        fps: args.fps as number | undefined,
      });
    },
  );

  registerTool(
    "avatar_job_status",
    "Check avatar video generation progress.",
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
        videoPath: job.outputVideoPath,
        duration: job.durationSeconds,
        error: job.error,
      };
    },
  );

  registerTool(
    "avatar_cancel",
    "Cancel a queued avatar generation job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "avatar_queue_status",
    "View avatar generation queue statistics.",
    {
      type: "object",
      properties: {},
    },
    () => getQueueStatus(),
  );

  registerGateway("avatar.generate", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return generateAvatarVideo({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      referenceImagePath: (p.referenceImagePath as string) ?? "",
      audioPath: (p.audioPath as string) ?? "",
    });
  });
  registerGateway("avatar.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });
  registerGateway("avatar.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return cancelJob(p.jobId as string);
  });
  registerGateway("avatar.queue-status", () => getQueueStatus());

  log.info("[StableAvatar] Plugin registered: 4 tools, 4 gateway RPCs");
}
