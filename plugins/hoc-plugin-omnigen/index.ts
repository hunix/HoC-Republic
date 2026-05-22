/**
 * OmniGen Plugin — Entry Point
 *
 * Registers 5 tools and 5 gateway RPC methods to expose
 * unified image generation capabilities to HoC citizens.
 *
 * Capabilities:
 *   • Text → Image generation
 *   • Multi-modal conditioned generation (subject-driven, identity-preserving)
 *   • Image editing with text instructions
 *   • Multi-subject composition
 *
 * ZERO-CONFIG: First run auto-clones repo, installs deps, downloads model.
 */

import type { OmniGenMode } from "./domain/types.ts";
import {
  initBridge,
  submitGeneration,
  getJobStatus,
  cancelJob,
  getQueueStatusInfo,
  getOmniGenPromptInjection,
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
  log.info(`[OmniGen] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  // ─── Tools ──────────────────────────────────────────────────

  registerTool(
    "omnigen_generate",
    "Generate an image from a text description using OmniGen. Returns a job ID for async tracking.",
    {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Text description of the desired image" },
        width: { type: "number", description: "Image width (default: 1024)" },
        height: { type: "number", description: "Image height (default: 1024)" },
        seed: { type: "number", description: "Random seed for reproducibility" },
        guidance_scale: { type: "number", description: "Guidance scale (default: 2.5)" },
      },
      required: ["prompt"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "OmniGen not available" };
      }
      const job = submitGeneration({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        mode: "text2image",
        prompt: args.prompt as string,
        width: args.width as number | undefined,
        height: args.height as number | undefined,
        seed: args.seed as number | undefined,
        guidanceScale: args.guidance_scale as number | undefined,
      });
      return job ? { jobId: job.id, status: job.status } : { error: "Failed to submit job" };
    },
  );

  registerTool(
    "omnigen_generate_conditioned",
    "Generate an image conditioned on reference images using OmniGen. Supports subject-driven, identity-preserving, and multi-subject composition. Use <img><|image_N|></img> in prompt to reference input images.",
    {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Text prompt with <img><|image_N|></img> references",
        },
        input_images: {
          type: "array",
          items: { type: "string" },
          description: "Paths to reference images (indexed from 1 in prompt)",
        },
        width: { type: "number", description: "Output width (default: 1024)" },
        height: { type: "number", description: "Output height (default: 1024)" },
        seed: { type: "number" },
        guidance_scale: { type: "number", description: "Text guidance (default: 2.5)" },
        img_guidance_scale: { type: "number", description: "Image guidance (default: 1.6)" },
      },
      required: ["prompt", "input_images"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "OmniGen not available" };
      }
      const job = submitGeneration({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        mode: "conditioned",
        prompt: args.prompt as string,
        inputImages: args.input_images as string[],
        width: args.width as number | undefined,
        height: args.height as number | undefined,
        seed: args.seed as number | undefined,
        guidanceScale: args.guidance_scale as number | undefined,
        imgGuidanceScale: args.img_guidance_scale as number | undefined,
      });
      return job ? { jobId: job.id, status: job.status } : { error: "Failed to submit job" };
    },
  );

  registerTool(
    "omnigen_job_status",
    "Check the status of an OmniGen generation job.",
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
    "omnigen_cancel_job",
    "Cancel a queued or running OmniGen generation job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "omnigen_queue_status",
    "View the OmniGen generation queue status.",
    { type: "object", properties: {} },
    () => getQueueStatusInfo(),
  );

  // ─── Gateway RPCs ───────────────────────────────────────────

  registerGateway("omnigen.generate", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return submitGeneration({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      mode: (p.mode as OmniGenMode) ?? "text2image",
      prompt: p.prompt as string,
      inputImages: p.inputImages as string[] | undefined,
      width: p.width as number | undefined,
      height: p.height as number | undefined,
      seed: p.seed as number | undefined,
      guidanceScale: p.guidanceScale as number | undefined,
      imgGuidanceScale: p.imgGuidanceScale as number | undefined,
      offloadModel: p.offloadModel as boolean | undefined,
    });
  });

  registerGateway("omnigen.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });

  registerGateway("omnigen.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return { cancelled: cancelJob(p.jobId as string) };
  });

  registerGateway("omnigen.queue-status", () => getQueueStatusInfo());

  registerGateway("omnigen.prompt-injection", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return { prompt: getOmniGenPromptInjection(p.specialization as string | undefined) };
  });

  log.info("[OmniGen] Plugin registered: 5 tools, 5 gateway RPCs");
}
