/**
 * Sparc3D Plugin — Entry Point
 *
 * 4 tools + 4 gateway RPCs for high-resolution 3D shape generation
 * using sparse representations (Sparcubes + Sparconv-VAE).
 */

import {
  initBridge,
  generate3D,
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
  log.info(`[Sparc3D] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool(
    "sparc3d_generate",
    "Generate high-resolution 3D meshes from images or reconstruct existing meshes at 1024³ resolution.",
    {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["image-to-3d", "reconstruction"],
          description: "Generation mode",
        },
        image_path: { type: "string", description: "Input image path (for image-to-3d)" },
        mesh_path: { type: "string", description: "Input mesh path (for reconstruction)" },
        resolution: { type: "number", description: "Voxel resolution (default: 1024)" },
        output_format: {
          type: "string",
          enum: ["obj", "glb", "ply", "stl"],
          description: "Output format",
        },
      },
      required: ["mode"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "Sparc3D not available" };
      }
      return generate3D({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        mode: args.mode as string,
        imagePath: args.image_path as string | undefined,
        meshPath: args.mesh_path as string | undefined,
        resolution: args.resolution as number | undefined,
        outputFormat: args.output_format as string | undefined,
      });
    },
  );

  registerTool(
    "sparc3d_job_status",
    "Check 3D generation job progress.",
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
        outputPath: job.outputPath,
        error: job.error,
      };
    },
  );

  registerTool(
    "sparc3d_cancel",
    "Cancel a queued 3D generation job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "sparc3d_queue_status",
    "View 3D generation queue statistics.",
    {
      type: "object",
      properties: {},
    },
    () => getQueueStatus(),
  );

  registerGateway("sparc3d.generate", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return generate3D({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      mode: (p.mode as string) ?? "image-to-3d",
      imagePath: p.imagePath as string | undefined,
    });
  });
  registerGateway("sparc3d.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });
  registerGateway("sparc3d.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return cancelJob(p.jobId as string);
  });
  registerGateway("sparc3d.queue-status", () => getQueueStatus());

  log.info("[Sparc3D] Plugin registered: 4 tools, 4 gateway RPCs");
}
