/**
 * GLM-Image Plugin — Entry Point
 *
 * Registers 5 tools and 5 gateway RPC methods to expose
 * AI image generation capabilities to HoC citizens.
 *
 * Capabilities:
 *   • Text → Image generation (9B AR + 7B DiT)
 *   • Image → Image editing, style transfer, identity-preserving
 *   • Accurate text rendering in generated images
 *   • Multi-subject consistency
 *
 * ZERO-CONFIG: First run auto-installs Python deps and downloads model.
 */

import type { GenerationMode } from "./domain/types.ts";
import {
  initBridge,
  submitGeneration,
  getJobStatus,
  cancelJob,
  getQueueStatusInfo,
  getGlmPromptInjection,
  isReady,
} from "./adapter/hoc-bridge.ts";

// ─── Plugin Interface ───────────────────────────────────────────

export interface PluginContext {
  dataDir: string;
  log: { info: (msg: string) => void; warn: (msg: string) => void; debug?: (msg: string) => void };
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

  // ─── Bootstrap ──────────────────────────────────────────────
  const status = initBridge(dataDir, log);
  log.info(`[GLM-Image] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  // ─── Tools ──────────────────────────────────────────────────

  registerTool(
    "glm_generate_image",
    "Generate an image from a text description using GLM-Image (9B+7B parameter model). Returns a job ID for async tracking.",
    {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Detailed text description of the desired image. Enclose text to render in quotation marks.",
        },
        width: {
          type: "number",
          description: "Image width (must be divisible by 32). Default: 1024",
        },
        height: {
          type: "number",
          description: "Image height (must be divisible by 32). Default: 1024",
        },
        seed: { type: "number", description: "Random seed for reproducibility" },
        steps: {
          type: "number",
          description: "Inference steps (default: 50, higher = better quality but slower)",
        },
        guidance_scale: { type: "number", description: "Guidance scale (default: 1.5)" },
      },
      required: ["prompt"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "GLM-Image not available" };
      }
      const job = submitGeneration({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        mode: "text2image",
        prompt: args.prompt as string,
        width: args.width as number | undefined,
        height: args.height as number | undefined,
        seed: args.seed as number | undefined,
        steps: args.steps as number | undefined,
        guidanceScale: args.guidance_scale as number | undefined,
      });
      return job ? { jobId: job.id, status: job.status } : { error: "Failed to submit job" };
    },
  );

  registerTool(
    "glm_edit_image",
    "Edit or transform an existing image using GLM-Image. Supports style transfer, identity-preserving generation, and multi-subject composition.",
    {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Description of desired edit or transformation" },
        input_images: {
          type: "array",
          items: { type: "string" },
          description: "Paths to input image(s) for conditioning",
        },
        width: { type: "number", description: "Output width (must be divisible by 32)" },
        height: { type: "number", description: "Output height (must be divisible by 32)" },
        seed: { type: "number" },
        steps: { type: "number" },
        guidance_scale: { type: "number" },
      },
      required: ["prompt", "input_images"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "GLM-Image not available" };
      }
      const job = submitGeneration({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        mode: "image2image",
        prompt: args.prompt as string,
        inputImages: args.input_images as string[],
        width: args.width as number | undefined,
        height: args.height as number | undefined,
        seed: args.seed as number | undefined,
        steps: args.steps as number | undefined,
        guidanceScale: args.guidance_scale as number | undefined,
      });
      return job ? { jobId: job.id, status: job.status } : { error: "Failed to submit job" };
    },
  );

  registerTool(
    "glm_job_status",
    "Check the status of a GLM-Image generation job.",
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
        mode: job.mode,
        outputPath: job.status === "completed" ? job.outputPath : undefined,
        error: job.error,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      };
    },
  );

  registerTool(
    "glm_cancel_job",
    "Cancel a queued or running GLM-Image generation job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "glm_queue_status",
    "View the GLM-Image generation queue status.",
    { type: "object", properties: {} },
    () => getQueueStatusInfo(),
  );

  // ─── Gateway RPCs ───────────────────────────────────────────

  registerGateway("glm-image.generate", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return submitGeneration({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      mode: (p.mode as GenerationMode) ?? "text2image",
      prompt: p.prompt as string,
      inputImages: p.inputImages as string[] | undefined,
      width: p.width as number | undefined,
      height: p.height as number | undefined,
      seed: p.seed as number | undefined,
      steps: p.steps as number | undefined,
      guidanceScale: p.guidanceScale as number | undefined,
    });
  });

  registerGateway("glm-image.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });

  registerGateway("glm-image.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return { cancelled: cancelJob(p.jobId as string) };
  });

  registerGateway("glm-image.queue-status", () => getQueueStatusInfo());

  registerGateway("glm-image.prompt-injection", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return { prompt: getGlmPromptInjection(p.specialization as string | undefined) };
  });

  log.info("[GLM-Image] Plugin registered: 5 tools, 5 gateway RPCs");
}
