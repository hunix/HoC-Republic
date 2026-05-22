/**
 * LTX-2 Video Plugin — Entry Point
 *
 * 4 tools + 5 gateway RPCs for 4K production-ready video with audio.
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
  log.info(`[LTX-2] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool("ltx_generate_video",
    "Generate production-quality video at up to 4K/50fps with optional synchronized audio using LTX-2.",
    { type: "object", properties: {
      prompt: { type: "string", description: "Text prompt for video" },
      negative_prompt: { type: "string" }, resolution: { type: "string", enum: ["720p", "1080p", "4K"] },
      duration_sec: { type: "number" }, fps: { type: "number" },
      with_audio: { type: "boolean", description: "Generate synchronized audio" },
      seed: { type: "number" },
    }, required: ["prompt"] },
    (args) => {
      if (!isReady()) {return { error: "LTX-2 not available" };}
      return generateVideo({ citizenId: (args.citizen_id as string) ?? "system", citizenName: (args.citizen_name as string) ?? "System",
        prompt: args.prompt as string, negativePrompt: args.negative_prompt as string | undefined,
        resolution: args.resolution as string | undefined, durationSec: args.duration_sec as number | undefined,
        fps: args.fps as number | undefined, withAudio: args.with_audio as boolean | undefined, seed: args.seed as number | undefined });
    });

  registerTool("ltx_image_to_video",
    "Animate a still image into a 4K video using LTX-2 I2V mode.",
    { type: "object", properties: { image_path: { type: "string" }, prompt: { type: "string" }, duration_sec: { type: "number" }, resolution: { type: "string", enum: ["720p", "1080p", "4K"] } }, required: ["image_path"] },
    (args) => {
      if (!isReady()) {return { error: "LTX-2 not available" };}
      return imageToVideo({ citizenId: (args.citizen_id as string) ?? "system", citizenName: (args.citizen_name as string) ?? "System",
        imagePath: args.image_path as string, prompt: args.prompt as string | undefined, durationSec: args.duration_sec as number | undefined, resolution: args.resolution as string | undefined });
    });

  registerTool("ltx_job_status", "Check LTX-2 job progress.",
    { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] },
    (args) => { const job = getJobStatus(args.job_id as string); if (!job) {return { error: "Job not found" };} return { id: job.id, status: job.status, progress: job.progress, videoPath: job.outputVideoPath, error: job.error }; });

  registerTool("ltx_queue_status", "View LTX-2 queue.", { type: "object", properties: {} }, () => getQueueStatus());

  registerGateway("ltx.generate", (params: unknown) => { const p = params as Record<string, unknown>; return generateVideo({ citizenId: (p.citizenId as string) ?? "gateway", citizenName: (p.citizenName as string) ?? "Gateway", prompt: (p.prompt as string) ?? "", resolution: p.resolution as string | undefined, withAudio: p.withAudio as boolean | undefined }); });
  registerGateway("ltx.image-to-video", (params: unknown) => { const p = params as Record<string, unknown>; return imageToVideo({ citizenId: (p.citizenId as string) ?? "gateway", citizenName: (p.citizenName as string) ?? "Gateway", imagePath: (p.imagePath as string) ?? "", prompt: p.prompt as string | undefined }); });
  registerGateway("ltx.job-status", (params: unknown) => { const p = params as Record<string, unknown>; return getJobStatus(p.jobId as string); });
  registerGateway("ltx.cancel", (params: unknown) => { const p = params as Record<string, unknown>; return cancelJob(p.jobId as string); });
  registerGateway("ltx.queue-status", () => getQueueStatus());

  log.info("[LTX-2] Plugin registered: 4 tools, 5 gateway RPCs");
}
