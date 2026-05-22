/**
 * EasyVolcap Plugin — Entry Point
 *
 * 4 tools + 4 gateway RPCs for neural volumetric video.
 */

import {
  initBridge,
  runVolcap,
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
  log.info(`[EasyVolcap] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool(
    "volcap_run",
    "Train or render a neural volumetric video scene using ENeRFi, Instant-NGP+T, or 3DGS+T.",
    {
      type: "object",
      properties: {
        method: {
          type: "string",
          enum: ["enerfi", "instant-ngp-t", "3dgs-t"],
          description: "Rendering method",
        },
        task_type: {
          type: "string",
          enum: ["train", "render", "export"],
          description: "Task type",
        },
        data_root: { type: "string", description: "Path to multi-view video dataset" },
        exp_name: { type: "string", description: "Experiment name" },
        epochs: { type: "number", description: "Training epochs (default: 400)" },
      },
      required: ["data_root", "exp_name"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "EasyVolcap not available" };
      }
      return runVolcap({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        method: args.method as string | undefined,
        taskType: args.task_type as string | undefined,
        dataRoot: args.data_root as string,
        expName: args.exp_name as string,
        epochs: args.epochs as number | undefined,
      });
    },
  );

  registerTool(
    "volcap_job_status",
    "Check volumetric video training/rendering progress.",
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
        epoch: job.currentEpoch,
        psnr: job.psnr,
        outputDir: job.outputDir,
        error: job.error,
      };
    },
  );

  registerTool(
    "volcap_cancel",
    "Cancel a queued volumetric video job.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "volcap_queue_status",
    "View volumetric video queue statistics.",
    {
      type: "object",
      properties: {},
    },
    () => getQueueStatus(),
  );

  registerGateway("volcap.run", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return runVolcap({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      dataRoot: (p.dataRoot as string) ?? "",
      expName: (p.expName as string) ?? "default",
    });
  });
  registerGateway("volcap.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });
  registerGateway("volcap.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return cancelJob(p.jobId as string);
  });
  registerGateway("volcap.queue-status", () => getQueueStatus());

  log.info("[EasyVolcap] Plugin registered: 4 tools, 4 gateway RPCs");
}
