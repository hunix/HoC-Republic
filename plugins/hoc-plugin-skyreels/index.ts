/**
 * SkyReels V2 Plugin — Entry Point
 *
 * 5 tools + 6 gateway RPCs for infinite-length film generation.
 */
import { initBridge, generateScene, generateContinuous, extendVideo, getJobStatus, cancelJob, getQueueStatus, isReady } from "./adapter/hoc-bridge.ts";

export interface PluginContext {
  dataDir: string;
  log: { info: (msg: string) => void; warn: (msg: string) => void };
  registerTool: (name: string, description: string, schema: unknown, handler: (args: Record<string, unknown>) => unknown) => void;
  registerGateway: (method: string, handler: (params: unknown) => unknown) => void;
}

export default function register(ctx: PluginContext): void {
  const { dataDir, log, registerTool, registerGateway } = ctx;
  const status = initBridge(dataDir, log);
  log.info(`[SkyReels V2] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool("skyreels_generate_scene",
    "Generate a cinematic scene (up to 30s) with camera director control — shot type, camera angle, camera movement.",
    { type: "object", properties: {
      prompt: { type: "string", description: "Scene description with cinematographic details" },
      duration_sec: { type: "number" },
      resolution: { type: "string", enum: ["480p", "720p", "1080p"] },
      shot_type: { type: "string", enum: ["wide", "medium", "close-up", "extreme-close-up", "over-shoulder", "aerial", "pov"] },
      camera_angle: { type: "string", enum: ["eye-level", "low-angle", "high-angle", "bird-eye", "dutch-angle"] },
      camera_movement: { type: "string", enum: ["static", "pan", "tilt", "dolly", "tracking", "crane", "handheld", "steadicam"] },
      seed: { type: "number" },
    }, required: ["prompt"] },
    (args) => {
      if (!isReady()) {return { error: "SkyReels V2 not available" };}
      return generateScene({ citizenId: (args.citizen_id as string) ?? "system", citizenName: (args.citizen_name as string) ?? "System",
        prompt: args.prompt as string, durationSec: args.duration_sec as number | undefined,
        resolution: args.resolution as string | undefined, shotType: args.shot_type as string | undefined,
        cameraAngle: args.camera_angle as string | undefined, cameraMovement: args.camera_movement as string | undefined,
        seed: args.seed as number | undefined });
    });

  registerTool("skyreels_generate_continuous",
    "Generate a continuous long-form film by chaining multiple scenes with visual continuity. Unlimited length via autoregressive diffusion.",
    { type: "object", properties: {
      scenes: { type: "array", items: { type: "string" }, description: "Array of scene prompts" },
      scene_duration_sec: { type: "number" },
      transition_type: { type: "string", enum: ["seamless", "fade", "cut"] },
    }, required: ["scenes"] },
    (args) => {
      if (!isReady()) {return { error: "SkyReels V2 not available" };}
      return generateContinuous({ citizenId: (args.citizen_id as string) ?? "system", citizenName: (args.citizen_name as string) ?? "System",
        scenes: args.scenes as string[], sceneDurationSec: args.scene_duration_sec as number | undefined,
        transitionType: args.transition_type as string | undefined });
    });

  registerTool("skyreels_extend_video",
    "Extend an existing video by generating continuation frames with visual continuity.",
    { type: "object", properties: {
      video_path: { type: "string" }, prompt: { type: "string" }, extend_sec: { type: "number" },
    }, required: ["video_path"] },
    (args) => {
      if (!isReady()) {return { error: "SkyReels V2 not available" };}
      return extendVideo({ citizenId: (args.citizen_id as string) ?? "system", citizenName: (args.citizen_name as string) ?? "System",
        videoPath: args.video_path as string, prompt: args.prompt as string | undefined,
        extendSec: args.extend_sec as number | undefined });
    });

  registerTool("skyreels_job_status", "Check SkyReels V2 job progress (includes scene count for continuous jobs).",
    { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] },
    (args) => {
      const job = getJobStatus(args.job_id as string); if (!job) {return { error: "Job not found" };}
      return { id: job.id, status: job.status, progress: job.progress, currentScene: job.currentScene, totalScenes: job.totalScenes, videoPath: job.outputVideoPath, error: job.error };
    });

  registerTool("skyreels_queue_status", "View SkyReels V2 queue.", { type: "object", properties: {} }, () => getQueueStatus());

  // Gateway RPCs
  registerGateway("skyreels.generate-scene", (params: unknown) => { const p = params as Record<string, unknown>; return generateScene({ citizenId: (p.citizenId as string) ?? "gateway", citizenName: (p.citizenName as string) ?? "Gateway", prompt: (p.prompt as string) ?? "", shotType: p.shotType as string | undefined, cameraMovement: p.cameraMovement as string | undefined }); });
  registerGateway("skyreels.generate-continuous", (params: unknown) => { const p = params as Record<string, unknown>; return generateContinuous({ citizenId: (p.citizenId as string) ?? "gateway", citizenName: (p.citizenName as string) ?? "Gateway", scenes: (p.scenes as string[]) ?? [], transitionType: p.transitionType as string | undefined }); });
  registerGateway("skyreels.extend-video", (params: unknown) => { const p = params as Record<string, unknown>; return extendVideo({ citizenId: (p.citizenId as string) ?? "gateway", citizenName: (p.citizenName as string) ?? "Gateway", videoPath: (p.videoPath as string) ?? "", prompt: p.prompt as string | undefined }); });
  registerGateway("skyreels.job-status", (params: unknown) => { const p = params as Record<string, unknown>; return getJobStatus(p.jobId as string); });
  registerGateway("skyreels.cancel", (params: unknown) => { const p = params as Record<string, unknown>; return cancelJob(p.jobId as string); });
  registerGateway("skyreels.queue-status", () => getQueueStatus());

  log.info("[SkyReels V2] Plugin registered: 5 tools, 6 gateway RPCs");
}
