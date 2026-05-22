/**
 * CogVideoX Plugin — Entry Point
 *
 * 3 tools + 4 gateway RPCs for consumer-GPU video generation.
 */
import { initBridge, generateVideo, getJobStatus, cancelJob, getQueueStatus, isReady } from "./adapter/hoc-bridge.ts";

export interface PluginContext {
  dataDir: string;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
  registerTool: (name: string, description: string, schema: unknown, handler: (args: Record<string, unknown>) => unknown) => void;
  registerGateway: (method: string, handler: (params: unknown) => unknown) => void;
}

export default function register(ctx: PluginContext): void {
  const { dataDir, log, registerTool, registerGateway } = ctx;
  const status = initBridge(dataDir, log);
  log.info(`[CogVideoX] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool("cogvideo_generate",
    "Generate video from text using CogVideoX. Runs on 8GB GPUs with INT8 quantization. 2B model for low VRAM, 5B for higher quality.",
    { type: "object", properties: {
      prompt: { type: "string", description: "Text prompt for video" },
      model: { type: "string", enum: ["2B", "5B"] },
      num_frames: { type: "number" }, width: { type: "number" }, height: { type: "number" },
      fps: { type: "number" }, guidance_scale: { type: "number" },
      quantize: { type: "string", enum: ["none", "int8", "int4"] },
      seed: { type: "number" },
    }, required: ["prompt"] },
    (args) => {
      if (!isReady()) {return { error: "CogVideoX not available" };}
      return generateVideo({ citizenId: (args.citizen_id as string) ?? "system", citizenName: (args.citizen_name as string) ?? "System",
        prompt: args.prompt as string, model: args.model as string | undefined,
        numFrames: args.num_frames as number | undefined, width: args.width as number | undefined,
        height: args.height as number | undefined, fps: args.fps as number | undefined,
        guidanceScale: args.guidance_scale as number | undefined, quantize: args.quantize as string | undefined,
        seed: args.seed as number | undefined });
    });

  registerTool("cogvideo_job_status", "Check CogVideoX job progress.",
    { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] },
    (args) => { const job = getJobStatus(args.job_id as string); if (!job) {return { error: "Job not found" };} return { id: job.id, status: job.status, progress: job.progress, videoPath: job.outputVideoPath, error: job.error }; });

  registerTool("cogvideo_queue_status", "View CogVideoX queue.", { type: "object", properties: {} }, () => getQueueStatus());

  registerGateway("cogvideo.generate", (params: unknown) => { const p = params as Record<string, unknown>; return generateVideo({ citizenId: (p.citizenId as string) ?? "gateway", citizenName: (p.citizenName as string) ?? "Gateway", prompt: (p.prompt as string) ?? "", model: p.model as string | undefined, quantize: p.quantize as string | undefined }); });
  registerGateway("cogvideo.job-status", (params: unknown) => { const p = params as Record<string, unknown>; return getJobStatus(p.jobId as string); });
  registerGateway("cogvideo.cancel", (params: unknown) => { const p = params as Record<string, unknown>; return cancelJob(p.jobId as string); });
  registerGateway("cogvideo.queue-status", () => getQueueStatus());

  log.info("[CogVideoX] Plugin registered: 3 tools, 4 gateway RPCs");
}
