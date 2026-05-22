/**
 * HunyuanVideo 1.5 Plugin — Entry Point
 *
 * 4 tools + 5 gateway RPCs for 13B cinematic video generation.
 */
import { initBridge, generateVideo, imageToVideo, getJobStatus, cancelJob, getQueueStatus, isReady } from "./adapter/hoc-bridge.ts";

export interface PluginContext {
  dataDir: string;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
  registerTool: (name: string, description: string, schema: unknown, handler: (args: Record<string, unknown>) => unknown) => void;
  registerGateway: (method: string, handler: (params: unknown) => unknown) => void;
}

export default function register(ctx: PluginContext): void {
  const { dataDir, log, registerTool, registerGateway } = ctx;
  const status = initBridge(dataDir, log);
  log.info(`[HunyuanVideo] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool("hunyuan_generate_video",
    "Generate cinematic video using HunyuanVideo 1.5 (13B). State-of-the-art quality with physical realism and artistic shots. Use fp8 precision for 24GB GPUs.",
    { type: "object", properties: {
      prompt: { type: "string", description: "Text prompt for cinematic video" },
      negative_prompt: { type: "string" },
      resolution: { type: "string", enum: ["540p", "720p", "1080p"] },
      duration_sec: { type: "number", description: "Duration 1-15 seconds" },
      fps: { type: "number" },
      precision: { type: "string", enum: ["fp16", "fp8", "bf16"], description: "Model precision" },
      seed: { type: "number" },
    }, required: ["prompt"] },
    (args) => {
      if (!isReady()) {return { error: "HunyuanVideo not available" };}
      return generateVideo({ citizenId: (args.citizen_id as string) ?? "system", citizenName: (args.citizen_name as string) ?? "System",
        prompt: args.prompt as string, negativePrompt: args.negative_prompt as string | undefined,
        resolution: args.resolution as string | undefined, durationSec: args.duration_sec as number | undefined,
        fps: args.fps as number | undefined, precision: args.precision as string | undefined, seed: args.seed as number | undefined });
    });

  registerTool("hunyuan_image_to_video",
    "Animate a still image into cinematic video using HunyuanVideo 1.5.",
    { type: "object", properties: { image_path: { type: "string" }, prompt: { type: "string" }, duration_sec: { type: "number" } }, required: ["image_path"] },
    (args) => {
      if (!isReady()) {return { error: "HunyuanVideo not available" };}
      return imageToVideo({ citizenId: (args.citizen_id as string) ?? "system", citizenName: (args.citizen_name as string) ?? "System",
        imagePath: args.image_path as string, prompt: args.prompt as string | undefined, durationSec: args.duration_sec as number | undefined });
    });

  registerTool("hunyuan_job_status", "Check HunyuanVideo job progress.",
    { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] },
    (args) => { const job = getJobStatus(args.job_id as string); if (!job) {return { error: "Job not found" };} return { id: job.id, status: job.status, progress: job.progress, videoPath: job.outputVideoPath, error: job.error }; });

  registerTool("hunyuan_queue_status", "View HunyuanVideo queue.", { type: "object", properties: {} }, () => getQueueStatus());

  registerGateway("hunyuan.generate", (params: unknown) => { const p = params as Record<string, unknown>; return generateVideo({ citizenId: (p.citizenId as string) ?? "gateway", citizenName: (p.citizenName as string) ?? "Gateway", prompt: (p.prompt as string) ?? "", resolution: p.resolution as string | undefined, precision: p.precision as string | undefined }); });
  registerGateway("hunyuan.image-to-video", (params: unknown) => { const p = params as Record<string, unknown>; return imageToVideo({ citizenId: (p.citizenId as string) ?? "gateway", citizenName: (p.citizenName as string) ?? "Gateway", imagePath: (p.imagePath as string) ?? "", prompt: p.prompt as string | undefined }); });
  registerGateway("hunyuan.job-status", (params: unknown) => { const p = params as Record<string, unknown>; return getJobStatus(p.jobId as string); });
  registerGateway("hunyuan.cancel", (params: unknown) => { const p = params as Record<string, unknown>; return cancelJob(p.jobId as string); });
  registerGateway("hunyuan.queue-status", () => getQueueStatus());

  log.info("[HunyuanVideo] Plugin registered: 4 tools, 5 gateway RPCs");
}
