/**
 * Wan 2.2 Video Plugin — Entry Point
 *
 * 4 tools + 5 gateway RPCs for cinematic video generation.
 */

import {
  initBridge, generateVideo, imageToVideo,
  getJobStatus, cancelJob, getQueueStatus, isReady,
} from "./adapter/hoc-bridge.ts";

export interface PluginContext {
  dataDir: string;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
  registerTool: (
    name: string, description: string, schema: unknown,
    handler: (args: Record<string, unknown>) => unknown,
  ) => void;
  registerGateway: (method: string, handler: (params: unknown) => unknown) => void;
}

export default function register(ctx: PluginContext): void {
  const { dataDir, log, registerTool, registerGateway } = ctx;
  const status = initBridge(dataDir, log);
  log.info(`[Wan 2.2] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool(
    "wan_generate_video",
    "Generate cinematic video from text using Wan 2.2. Supports cinematic lighting, color grading, camera motion (dolly, pan, orbit, tracking), and film styles.",
    {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Text prompt for video scene" },
        negative_prompt: { type: "string", description: "Negative prompt" },
        resolution: { type: "string", enum: ["480p", "720p"], description: "Output resolution" },
        duration_sec: { type: "number", description: "Duration in seconds (1-10)" },
        fps: { type: "number", description: "Frames per second (default: 24)" },
        style: { type: "string", enum: ["cinematic", "photorealistic", "anime", "artistic"] },
        camera_motion: { type: "string", enum: ["static", "pan-left", "pan-right", "zoom-in", "zoom-out", "orbit", "dolly", "tracking"] },
        seed: { type: "number", description: "Random seed (-1 for random)" },
      },
      required: ["prompt"],
    },
    (args) => {
      if (!isReady()) {return { error: "Wan 2.2 not available" };}
      return generateVideo({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        prompt: args.prompt as string,
        negativePrompt: args.negative_prompt as string | undefined,
        resolution: args.resolution as string | undefined,
        durationSec: args.duration_sec as number | undefined,
        fps: args.fps as number | undefined,
        style: args.style as string | undefined,
        cameraMotion: args.camera_motion as string | undefined,
        seed: args.seed as number | undefined,
      });
    },
  );

  registerTool(
    "wan_image_to_video",
    "Animate a still image into a cinematic video using Wan 2.2 I2V mode.",
    {
      type: "object",
      properties: {
        image_path: { type: "string", description: "Path to input image" },
        prompt: { type: "string", description: "Motion/action prompt" },
        duration_sec: { type: "number", description: "Duration in seconds" },
      },
      required: ["image_path"],
    },
    (args) => {
      if (!isReady()) {return { error: "Wan 2.2 not available" };}
      return imageToVideo({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        imagePath: args.image_path as string,
        prompt: args.prompt as string | undefined,
        durationSec: args.duration_sec as number | undefined,
      });
    },
  );

  registerTool(
    "wan_job_status",
    "Check Wan 2.2 video generation job progress.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => {
      const job = getJobStatus(args.job_id as string);
      if (!job) {return { error: "Job not found" };}
      return { id: job.id, status: job.status, progress: job.progress, videoPath: job.outputVideoPath, error: job.error };
    },
  );

  registerTool(
    "wan_queue_status",
    "View Wan 2.2 video queue statistics.",
    { type: "object", properties: {} },
    () => getQueueStatus(),
  );

  // Gateway RPCs
  registerGateway("wan.generate", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return generateVideo({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      prompt: (p.prompt as string) ?? "",
      resolution: p.resolution as string | undefined,
      style: p.style as string | undefined,
      cameraMotion: p.cameraMotion as string | undefined,
    });
  });
  registerGateway("wan.image-to-video", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return imageToVideo({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      imagePath: (p.imagePath as string) ?? "",
      prompt: p.prompt as string | undefined,
    });
  });
  registerGateway("wan.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });
  registerGateway("wan.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return cancelJob(p.jobId as string);
  });
  registerGateway("wan.queue-status", () => getQueueStatus());

  log.info("[Wan 2.2] Plugin registered: 4 tools, 5 gateway RPCs");
}
