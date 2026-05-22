/**
 * MMAudio Plugin — Entry Point
 *
 * 4 tools + 4 gateway RPCs for video-to-audio and text-to-audio synthesis
 * using multimodal joint training (CVPR 2025).
 */

import {
  initBridge,
  synthesizeAudio,
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
  log.info(`[MMAudio] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool(
    "mmaudio_synthesize",
    "Generate synchronized audio from video and/or text. Auto-detects mode based on provided inputs.",
    {
      type: "object",
      properties: {
        video_path: { type: "string", description: "Path to input video" },
        prompt: { type: "string", description: "Text description of desired audio" },
        duration: { type: "number", description: "Output duration in seconds (default: 8)" },
        seed: { type: "number", description: "Random seed (-1 for random)" },
      },
    },
    (args) => {
      if (!isReady()) {
        return { error: "MMAudio not available" };
      }
      return synthesizeAudio({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        videoPath: args.video_path as string | undefined,
        prompt: args.prompt as string | undefined,
        duration: args.duration as number | undefined,
        seed: args.seed as number | undefined,
      });
    },
  );

  registerTool(
    "mmaudio_job_status",
    "Check audio synthesis job progress.",
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
        audioPath: job.outputAudioPath,
        videoPath: job.outputVideoPath,
        error: job.error,
      };
    },
  );

  registerTool(
    "mmaudio_cancel",
    "Cancel a queued synthesis job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "mmaudio_queue_status",
    "View synthesis queue statistics.",
    {
      type: "object",
      properties: {},
    },
    () => getQueueStatus(),
  );

  registerGateway("mmaudio.synthesize", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return synthesizeAudio({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      videoPath: p.videoPath as string | undefined,
      prompt: p.prompt as string | undefined,
      duration: p.duration as number | undefined,
    });
  });
  registerGateway("mmaudio.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });
  registerGateway("mmaudio.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return cancelJob(p.jobId as string);
  });
  registerGateway("mmaudio.queue-status", () => getQueueStatus());

  log.info("[MMAudio] Plugin registered: 4 tools, 4 gateway RPCs");
}
