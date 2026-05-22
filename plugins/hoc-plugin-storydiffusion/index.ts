/**
 * StoryDiffusion Plugin — Entry Point
 *
 * Registers 4 tools and 4 gateway RPCs for character-consistent
 * story image/video generation using consistent self-attention.
 *
 * ZERO-CONFIG: First run auto-clones repo + installs deps.
 */

import type { StoryScene } from "./domain/types.ts";
import {
  initBridge,
  generateStory,
  getJobStatus,
  cancelJob,
  getQueueStatus,
  isReady,
} from "./adapter/hoc-bridge.ts";

// ─── Plugin Interface ───────────────────────────────────────────

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

// ─── Registration ───────────────────────────────────────────────

export default function register(ctx: PluginContext): void {
  const { dataDir, log, registerTool, registerGateway } = ctx;

  const status = initBridge(dataDir, log);
  log.info(`[StoryDiffusion] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  // ─── Tools ──────────────────────────────────────────────────

  registerTool(
    "storydiffusion_generate",
    "Generate a character-consistent story image sequence. Provide at least 3 scene prompts describing the same character(s) in different settings.",
    {
      type: "object",
      properties: {
        scenes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              prompt: { type: "string", description: "Scene description" },
              negative_prompt: { type: "string", description: "What to avoid" },
            },
            required: ["prompt"],
          },
          description: "Array of scene prompts (minimum 3, recommended 5-6)",
        },
        mode: {
          type: "string",
          enum: ["story-images", "image-to-video", "comic"],
          description: "Generation mode",
        },
        base_model: {
          type: "string",
          enum: ["sd15", "sdxl"],
          description: "Base model (default: sdxl)",
        },
        style_prompt: { type: "string", description: "Global style applied to all scenes" },
        comic_layout: {
          type: "string",
          enum: ["grid", "strip", "page"],
          description: "Comic layout style",
        },
        seed: { type: "number", description: "Random seed (-1 for random)" },
        guidance_scale: { type: "number", description: "CFG scale (default: 7.5)" },
      },
      required: ["scenes"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "StoryDiffusion not available" };
      }
      const rawScenes = args.scenes as Array<Record<string, string>>;
      const scenes: StoryScene[] = rawScenes.map((s) => ({
        prompt: s.prompt ?? "",
        negativePrompt: s.negative_prompt,
      }));
      return generateStory({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        scenes,
        mode: args.mode as string | undefined,
        baseModel: args.base_model as string | undefined,
        stylePrompt: args.style_prompt as string | undefined,
        comicLayout: args.comic_layout as string | undefined,
        seed: args.seed as number | undefined,
        guidanceScale: args.guidance_scale as number | undefined,
      });
    },
  );

  registerTool(
    "storydiffusion_job_status",
    "Check the status and progress of a story generation job.",
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
        outputPaths: job.outputPaths,
        videoPath: job.videoPath,
        scenesCount: job.request.scenes.length,
        error: job.error,
      };
    },
  );

  registerTool(
    "storydiffusion_cancel",
    "Cancel a queued story generation job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "storydiffusion_queue_status",
    "View story generation queue statistics.",
    { type: "object", properties: {} },
    () => getQueueStatus(),
  );

  // ─── Gateway RPCs ───────────────────────────────────────────

  registerGateway("storydiffusion.generate", (params: unknown) => {
    const p = params as Record<string, unknown>;
    const rawScenes = (p.scenes as Array<Record<string, string>>) ?? [];
    const scenes: StoryScene[] = rawScenes.map((s) => ({
      prompt: s.prompt ?? "",
      negativePrompt: s.negative_prompt ?? s.negativePrompt,
    }));
    return generateStory({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      scenes,
      mode: p.mode as string | undefined,
      stylePrompt: p.stylePrompt as string | undefined,
    });
  });

  registerGateway("storydiffusion.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });

  registerGateway("storydiffusion.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return cancelJob(p.jobId as string);
  });

  registerGateway("storydiffusion.queue-status", () => getQueueStatus());

  log.info("[StoryDiffusion] Plugin registered: 4 tools, 4 gateway RPCs");
}
