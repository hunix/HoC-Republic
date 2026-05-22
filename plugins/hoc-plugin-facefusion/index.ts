/**
 * HoC FaceFusion Plugin — Entry Point
 *
 * Integrates facefusion/facefusion face manipulation platform
 * into the Republic citizen intelligence layer.
 *
 * On init:
 * 1. Detects FaceFusion installation (Python, ffmpeg, facefusion.py)
 * 2. Initializes job scheduler with GPU-aware concurrency control
 * 3. Registers tools & gateway methods for citizen/agent access
 * 4. Subscribes to tick events for queue processing
 *
 * All processing runs on local GPU hardware to avoid overwhelming
 * cloud servers. Default: 1 concurrent job, strict VRAM management.
 *
 * DDD Structure:
 *   domain/         — Pure types (jobs, processors, GPU config)
 *   application/    — Job scheduler & prompt composer
 *   infrastructure/ — CLI wrapper & GPU monitor
 *   adapter/        — HoC integration bridge
 */

import type {
  HoCPluginContext,
  HoCPluginModule,
  HoCHealthStatus,
} from "../../src/republic/hoc-plugin-types.ts";
import type { FaceProcessor, JobPriority } from "./domain/types.ts";
import {
  initBridge,
  submitFaceJob,
  tickProcessQueue,
  getJobStatus,
  listAllJobs,
  cancelJob,
  getGpuInfo,
  getQueueStatusInfo,
  getConfig,
} from "./adapter/hoc-bridge.ts";
import { ALL_PROCESSORS, PROCESSOR_DESCRIPTIONS } from "./domain/types.ts";

// ─── Plugin State ───────────────────────────────────────────────

let ctx: HoCPluginContext | null = null;
let pluginInstalled = false;
let initialized = false;

// ─── Lifecycle ──────────────────────────────────────────────────

export async function init(pluginCtx: HoCPluginContext): Promise<void> {
  ctx = pluginCtx;
  ctx.logger.info("FaceFusion plugin initializing...");

  // Step 1: Detect installation and init bridge
  const result = initBridge(pluginCtx.dataDir, ctx.logger);
  pluginInstalled = result.installed;

  if (!pluginInstalled) {
    ctx.logger.warn("FaceFusion not installed — plugin in degraded mode");
    for (const err of result.errors) {
      ctx.logger.warn(`  → ${err}`);
    }
  }

  // Step 2: Register tools
  ctx.registerTools([
    {
      name: "ff_swap_face",
      description:
        "Swap a source face onto a target image/video using local GPU. Requires source (face reference) and target (image/video to modify) files.",
      parameters: {
        sourceFile: { type: "string", description: "Path to the source face image" },
        targetFile: {
          type: "string",
          description: "Path to the target image or video to face-swap",
        },
        outputFile: { type: "string", description: "Path for the output file" },
        priority: {
          type: "string",
          description: "Job priority: critical|high|normal|low (default: normal)",
        },
      },
      handler: async (params) => {
        if (!pluginInstalled) {
          return {
            error: "FaceFusion is not installed. Set FACEFUSION_PATH environment variable.",
          };
        }
        const job = submitFaceJob({
          citizenId: "tool-user",
          citizenName: "Tool User",
          processor: "face_swapper",
          sourceFile: params.sourceFile as string,
          outputFile: params.outputFile as string,
          targetFile: params.targetFile as string,
          priority: (params.priority as JobPriority) || "normal",
        });
        return job ? { jobId: job.id, status: job.status } : { error: "Failed to create job" };
      },
    },
    {
      name: "ff_enhance_face",
      description:
        "Enhance and restore face quality in an image/video (upscale, deblur, sharpen) using local GPU",
      parameters: {
        sourceFile: {
          type: "string",
          description: "Path to the source image/video with face(s) to enhance",
        },
        outputFile: { type: "string", description: "Path for the enhanced output file" },
        priority: {
          type: "string",
          description: "Job priority: critical|high|normal|low (default: normal)",
        },
      },
      handler: async (params) => {
        if (!pluginInstalled) {
          return { error: "FaceFusion is not installed" };
        }
        const job = submitFaceJob({
          citizenId: "tool-user",
          citizenName: "Tool User",
          processor: "face_enhancer",
          sourceFile: params.sourceFile as string,
          outputFile: params.outputFile as string,
          priority: (params.priority as JobPriority) || "normal",
        });
        return job ? { jobId: job.id, status: job.status } : { error: "Failed to create job" };
      },
    },
    {
      name: "ff_enhance_video",
      description:
        "Upscale and enhance entire video frames using local GPU (frame_enhancer processor)",
      parameters: {
        sourceFile: { type: "string", description: "Path to the source video to enhance" },
        outputFile: { type: "string", description: "Path for the enhanced output video" },
        priority: {
          type: "string",
          description: "Job priority: critical|high|normal|low (default: normal)",
        },
      },
      handler: async (params) => {
        if (!pluginInstalled) {
          return { error: "FaceFusion is not installed" };
        }
        const job = submitFaceJob({
          citizenId: "tool-user",
          citizenName: "Tool User",
          processor: "frame_enhancer",
          sourceFile: params.sourceFile as string,
          outputFile: params.outputFile as string,
          priority: (params.priority as JobPriority) || "normal",
        });
        return job ? { jobId: job.id, status: job.status } : { error: "Failed to create job" };
      },
    },
    {
      name: "ff_submit_job",
      description: "Submit a custom FaceFusion job with any processor and options",
      parameters: {
        processor: { type: "string", description: `Processor: ${ALL_PROCESSORS.join(", ")}` },
        sourceFile: { type: "string", description: "Path to source file" },
        outputFile: { type: "string", description: "Path for output file" },
        targetFile: { type: "string", description: "Optional target file (for face_swapper)" },
        priority: {
          type: "string",
          description: "Job priority: critical|high|normal|low (default: normal)",
        },
        options: { type: "string", description: "Optional JSON string of extra CLI options" },
      },
      handler: async (params) => {
        if (!pluginInstalled) {
          return { error: "FaceFusion is not installed" };
        }
        const processor = params.processor as FaceProcessor;
        if (!ALL_PROCESSORS.includes(processor)) {
          return {
            error: `Unknown processor: ${processor}. Available: ${ALL_PROCESSORS.join(", ")}`,
          };
        }
        let extraOptions: Record<string, unknown> = {};
        if (params.options) {
          try {
            extraOptions = JSON.parse(params.options as string);
          } catch {
            return { error: "Invalid options JSON" };
          }
        }
        const job = submitFaceJob({
          citizenId: "tool-user",
          citizenName: "Tool User",
          processor,
          sourceFile: params.sourceFile as string,
          outputFile: params.outputFile as string,
          targetFile: params.targetFile as string | undefined,
          priority: (params.priority as JobPriority) || "normal",
          options: extraOptions,
        });
        return job
          ? { jobId: job.id, status: job.status, processor }
          : { error: "Failed to create job" };
      },
    },
    {
      name: "ff_job_status",
      description: "Check the status and progress of a FaceFusion job",
      parameters: {
        jobId: { type: "string", description: "Job ID to check" },
      },
      handler: async (params) => {
        const job = getJobStatus(params.jobId as string);
        if (!job) {
          return { error: `Job not found: ${String(params.jobId)}` };
        }
        return {
          id: job.id,
          status: job.status,
          progress: job.progress,
          processor: job.steps.map((s) => s.processor).join(", "),
          citizen: String(job.citizenName),
          sourceFile: job.sourceFile,
          outputFile: job.outputFile,
          error: job.error,
          createdAt: job.createdAt,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
        };
      },
    },
    {
      name: "ff_queue_status",
      description: "Get FaceFusion job queue and GPU status overview",
      handler: async () => {
        const qs = getQueueStatusInfo();
        const gpu = getGpuInfo();
        return {
          installed: qs.installed,
          queue: {
            total: qs.totalJobs,
            queued: qs.queuedJobs,
            processing: qs.processingJobs,
            completed: qs.completedJobs,
            failed: qs.failedJobs,
            maxConcurrent: qs.maxConcurrent,
          },
          gpu: {
            available: gpu.available,
            utilization: `${gpu.utilizationPercent}%`,
            vram: gpu.available ? `${gpu.vramUsedMB}/${gpu.vramTotalMB}MB` : "N/A",
            temperature: gpu.temperature ? `${gpu.temperature}°C` : "N/A",
          },
        };
      },
    },
    {
      name: "ff_cancel_job",
      description: "Cancel a queued or processing FaceFusion job",
      parameters: {
        jobId: { type: "string", description: "Job ID to cancel" },
      },
      handler: async (params) => {
        const cancelled = cancelJob(params.jobId as string);
        return { cancelled, jobId: params.jobId };
      },
    },
    {
      name: "ff_list_processors",
      description: "List all available FaceFusion processors with descriptions",
      handler: async () => {
        return ALL_PROCESSORS.map((p) => ({
          name: p,
          description: PROCESSOR_DESCRIPTIONS[p],
        }));
      },
    },
  ]);

  // Step 3: Register gateway RPC methods
  const registerGw = ctx.registerGateway as (method: string, handler: unknown) => void;

  registerGw("facefusion.submit", async () => {
    return { message: "Use ff_submit_job tool or gateway with proper params" };
  });

  registerGw("facefusion.status", async () => {
    const jobs = listAllJobs();
    return {
      jobs: jobs.slice(0, 50).map((j) => ({
        id: j.id,
        status: j.status,
        progress: j.progress,
        processor: j.steps.map((s) => s.processor).join(","),
        citizen: j.citizenName,
      })),
    };
  });

  registerGw("facefusion.queue", async () => {
    const qs = getQueueStatusInfo();
    return {
      installed: qs.installed,
      total: qs.totalJobs,
      queued: qs.queuedJobs,
      processing: qs.processingJobs,
      completed: qs.completedJobs,
      failed: qs.failedJobs,
      maxConcurrent: qs.maxConcurrent,
    };
  });

  registerGw("facefusion.cancel", async () => {
    return { message: "Use ff_cancel_job tool with jobId parameter" };
  });

  registerGw("facefusion.processors", async () => {
    return ALL_PROCESSORS.map((p) => ({
      name: p,
      description: PROCESSOR_DESCRIPTIONS[p],
    }));
  });

  registerGw("facefusion.gpuStatus", async () => {
    const gpu = getGpuInfo();
    return {
      available: gpu.available,
      utilization: gpu.utilizationPercent,
      vramUsed: gpu.vramUsedMB,
      vramTotal: gpu.vramTotalMB,
      vramFree: gpu.vramFreeMB,
      temperature: gpu.temperature,
    };
  });

  registerGw("facefusion.config", async () => {
    const cfg = getConfig();
    return {
      installPath: cfg.installPath,
      executionProvider: cfg.executionProvider,
      threads: cfg.executionThreads,
      memoryLimit: cfg.systemMemoryLimit,
      videoMemoryStrategy: cfg.videoMemoryStrategy,
      maxConcurrentJobs: cfg.maxConcurrentJobs,
      timeoutMs: cfg.jobTimeoutMs,
    };
  });

  // Step 4: Subscribe to events
  ctx.on("tick:before", () => {
    tickProcessQueue();
  });

  ctx.on("citizen:task_assigned", (data) => {
    const d = data as { citizenName?: string; task?: string };
    if (d.citizenName && d.task) {
      ctx?.logger.debug?.(`[FaceFusion] Task assigned to ${d.citizenName}: ${d.task}`);
    }
  });

  initialized = true;
  ctx.logger.info(
    `FaceFusion plugin ready! Installed: ${pluginInstalled}, ` +
      `Provider: ${getConfig().executionProvider}, ` +
      `Max concurrent: ${getConfig().maxConcurrentJobs}`,
  );
}

export async function shutdown(): Promise<void> {
  ctx?.logger.info("FaceFusion plugin shutting down.");
  initialized = false;
  ctx = null;
}

export async function healthCheck(): Promise<HoCHealthStatus> {
  const gpu = getGpuInfo();
  const qs = getQueueStatusInfo();

  return {
    healthy: initialized,
    message: initialized
      ? pluginInstalled
        ? `FaceFusion active: ${qs.processingJobs} processing, ${qs.queuedJobs} queued. GPU: ${gpu.available ? `${gpu.utilizationPercent}%` : "N/A"}`
        : "FaceFusion not installed — degraded mode"
      : "Not initialized",
    details: {
      installed: pluginInstalled,
      gpuAvailable: gpu.available,
      gpuUtilization: gpu.utilizationPercent,
      queuedJobs: qs.queuedJobs,
      processingJobs: qs.processingJobs,
    },
  };
}

const facefusionPlugin: HoCPluginModule = { init, shutdown, healthCheck };
export default facefusionPlugin;
