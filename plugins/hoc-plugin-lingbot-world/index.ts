/**
 * LingBot-World Plugin — Entry Point
 *
 * Registers 6 tools and 5 gateway RPC methods to expose
 * AI world simulation capabilities to HoC citizens.
 *
 * Capabilities:
 *   • Image → Video generation (14B parameter DiT model)
 *   • Camera path control for first-person navigation
 *   • 480p/720p output, up to 60 seconds at 16fps
 *   • Auto-bootstrap: clone, deps, model download
 */

import type { HocPlugin, PluginContext, PluginTool } from "../../src/types/hoc-plugin-types.ts";
import {
  initBridge,
  submitWorldJob,
  cancelWorldJob,
  getWorldJobStatus,
  listWorldJobs,
  tickProcessQueue,
  getWorldQueueStatus,
  getAvailableResolutions,
  getConfig,
  getWorldPromptInjection,
} from "./adapter/hoc-bridge.ts";

// ─── Tools ──────────────────────────────────────────────────────

const tools: PluginTool[] = [
  {
    name: "world_generate",
    description:
      "Generate a world simulation video from an input image and text prompt. Describe the scene cinematically. Returns a job ID — the MP4 is generated asynchronously.",
    parameters: {
      prompt: {
        type: "string",
        required: true,
        description: "Cinematic text prompt describing the scene, camera movement, and atmosphere",
      },
      imagePath: {
        type: "string",
        required: true,
        description: "Path to the input image (the starting frame of the video)",
      },
      resolution: {
        type: "string",
        required: false,
        description: "Output resolution: '480*832' (fast, default) or '720*1280' (HD)",
      },
      frameNum: {
        type: "number",
        required: false,
        description: "Number of frames (4n+1). Default: 161 (~10s). Max: 961 (~60s at 16fps)",
      },
      seed: {
        type: "number",
        required: false,
        description: "Random seed for reproducible generation",
      },
    },
    handler: async (args: Record<string, unknown>, ctx: PluginContext) => {
      const job = submitWorldJob(
        ctx.citizenId ?? "system",
        args.prompt as string,
        args.imagePath as string,
        {
          resolution: args.resolution as string | undefined as "480*832" | "720*1280" | undefined,
          frameNum: args.frameNum as number | undefined,
          seed: args.seed as number | undefined,
        },
      );
      return {
        jobId: job.id,
        status: job.status,
        resolution: job.resolution,
        frameNum: job.frameNum,
        seed: job.seed,
      };
    },
  },
  {
    name: "world_generate_camera",
    description:
      "Generate a world simulation video with camera path control. Provide intrinsics.npy and poses.npy in a directory for first-person navigation.",
    parameters: {
      prompt: {
        type: "string",
        required: true,
        description: "Cinematic text prompt",
      },
      imagePath: {
        type: "string",
        required: true,
        description: "Path to the input image",
      },
      actionPath: {
        type: "string",
        required: true,
        description: "Directory containing intrinsics.npy and poses.npy camera control files",
      },
      resolution: {
        type: "string",
        required: false,
        description: "Output resolution: '480*832' or '720*1280'",
      },
      frameNum: { type: "number", required: false, description: "Frame count (4n+1)" },
      seed: { type: "number", required: false, description: "Random seed" },
    },
    handler: async (args: Record<string, unknown>, ctx: PluginContext) => {
      const job = submitWorldJob(
        ctx.citizenId ?? "system",
        args.prompt as string,
        args.imagePath as string,
        {
          resolution: args.resolution as string | undefined as "480*832" | "720*1280" | undefined,
          frameNum: args.frameNum as number | undefined,
          seed: args.seed as number | undefined,
          cameraAction: { actionPath: args.actionPath as string },
        },
      );
      return {
        jobId: job.id,
        status: job.status,
        resolution: job.resolution,
        frameNum: job.frameNum,
        cameraControl: true,
      };
    },
  },
  {
    name: "world_list_resolutions",
    description: "List all supported output resolutions for world generation.",
    parameters: {},
    handler: async () => {
      return { resolutions: getAvailableResolutions() };
    },
  },
  {
    name: "world_job_status",
    description:
      "Get the status of a world generation job. Once completed, includes the output MP4 file path.",
    parameters: {
      jobId: { type: "string", required: true, description: "World generation job ID" },
    },
    handler: async (args: Record<string, unknown>) => {
      const job = getWorldJobStatus(args.jobId as string);
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
  },
  {
    name: "world_queue_status",
    description: "Get overall world generation queue health.",
    parameters: {},
    handler: async () => {
      return getWorldQueueStatus();
    },
  },
  {
    name: "world_cancel_job",
    description: "Cancel a queued or running world generation job.",
    parameters: {
      jobId: { type: "string", required: true, description: "Job ID to cancel" },
    },
    handler: async (args: Record<string, unknown>) => {
      const ok = cancelWorldJob(args.jobId as string);
      return { cancelled: ok };
    },
  },
];

// ─── Plugin Definition ──────────────────────────────────────────

const plugin: HocPlugin = {
  id: "hoc-plugin-lingbot-world",
  name: "LingBot-World — AI World Simulation & Video Generation",

  init: async (ctx: PluginContext) => {
    const status = initBridge(ctx.dataDir);
    if (status.installed) {
      const parts: string[] = [];
      if (status.autoCloned) {
        parts.push("auto-cloned");
      }
      if (status.autoInstalledDeps) {
        parts.push("auto-installed deps");
      }
      if (status.autoDownloadedModel) {
        parts.push("auto-downloaded model");
      }
      const bootstrapMsg = parts.length > 0 ? ` (${parts.join(", ")})` : "";
      ctx.log(
        `LingBot-World ready${bootstrapMsg} — ${status.gpuCount} GPU(s), Python: ${status.detectedPython}`,
      );
    } else {
      ctx.log(`LingBot-World not available: ${status.errors.join("; ")}`);
    }
  },

  shutdown: async () => {
    const running = listWorldJobs("running");
    for (const j of running) {
      cancelWorldJob(j.id);
    }
  },

  healthCheck: async () => {
    const q = getWorldQueueStatus();
    return {
      healthy: q.installed,
      details: `${q.runningJobs} running, ${q.completedJobs} completed`,
    };
  },

  tools,

  gateway: {
    "lingbot.generate": async (params: Record<string, unknown>, ctx: PluginContext) => {
      return submitWorldJob(
        ctx.citizenId ?? "system",
        params.prompt as string,
        params.imagePath as string,
        {
          resolution: params.resolution as string | undefined as "480*832" | "720*1280" | undefined,
          frameNum: params.frameNum as number | undefined,
          seed: params.seed as number | undefined,
          cameraAction: params.actionPath ? { actionPath: params.actionPath as string } : undefined,
        },
      );
    },

    "lingbot.status": async (params: Record<string, unknown>) => {
      return getWorldJobStatus(params.jobId as string) ?? { error: "not found" };
    },

    "lingbot.queue": async () => {
      return getWorldQueueStatus();
    },

    "lingbot.cancel": async (params: Record<string, unknown>) => {
      return { cancelled: cancelWorldJob(params.jobId as string) };
    },

    "lingbot.config": async () => {
      const c = getConfig();
      return {
        modelDir: c.modelDir,
        gpuCount: c.gpuCount,
        useQuantized: c.useQuantized,
        useFsdp: c.useFsdp,
        useT5Cpu: c.useT5Cpu,
      };
    },
  },

  events: {
    "tick:before": async () => {
      tickProcessQueue();
    },

    "citizen:task_assigned": async (_payload: unknown, ctx: PluginContext) => {
      const injection = getWorldPromptInjection(ctx.specialization);
      if (injection) {
        ctx.log(`[World] Injected world simulation tools for citizen ${ctx.citizenId}`);
      }
    },
  },
};

export default plugin;
