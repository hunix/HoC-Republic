/**
 * DGM Plugin — Entry Point
 *
 * 4 tools + 4 gateway RPCs for self-improving coding agents.
 */

import {
  initBridge,
  startEvolution,
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
  log.info(`[DGM] Bootstrap: ready=${status.ready}, errors=${status.errors.length}`);

  registerTool(
    "dgm_evolve",
    "Start a Darwin Gödel Machine evolution run to create self-improving coding agents.",
    {
      type: "object",
      properties: {
        benchmark: {
          type: "string",
          enum: ["swe-bench", "polyglot", "custom"],
          description: "Benchmark for evaluation",
        },
        generations: {
          type: "number",
          description: "Number of evolution generations (default: 10)",
        },
        population_size: { type: "number", description: "Agents per generation (default: 5)" },
        model: { type: "string", description: "LLM model for code modification" },
      },
      required: ["benchmark"],
    },
    (args) => {
      if (!isReady()) {
        return { error: "DGM not available" };
      }
      return startEvolution({
        citizenId: (args.citizen_id as string) ?? "system",
        citizenName: (args.citizen_name as string) ?? "System",
        benchmark: args.benchmark as string,
        generations: args.generations as number | undefined,
        populationSize: args.population_size as number | undefined,
        model: args.model as string | undefined,
      });
    },
  );

  registerTool(
    "dgm_job_status",
    "Check evolution progress, current generation, and best score.",
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
        phase: job.phase,
        progress: job.progress,
        generation: job.currentGeneration,
        bestScore: job.bestScore,
        improvements: job.improvements,
        error: job.error,
      };
    },
  );

  registerTool(
    "dgm_cancel",
    "Cancel a queued evolution run.",
    {
      type: "object",
      properties: { job_id: { type: "string" } },
      required: ["job_id"],
    },
    (args) => ({ cancelled: cancelJob(args.job_id as string) }),
  );

  registerTool(
    "dgm_queue_status",
    "View evolution queue statistics.",
    {
      type: "object",
      properties: {},
    },
    () => getQueueStatus(),
  );

  registerGateway("dgm.evolve", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return startEvolution({
      citizenId: (p.citizenId as string) ?? "gateway",
      citizenName: (p.citizenName as string) ?? "Gateway",
      benchmark: (p.benchmark as string) ?? "swe-bench",
    });
  });
  registerGateway("dgm.job-status", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return getJobStatus(p.jobId as string);
  });
  registerGateway("dgm.cancel", (params: unknown) => {
    const p = params as Record<string, unknown>;
    return cancelJob(p.jobId as string);
  });
  registerGateway("dgm.queue-status", () => getQueueStatus());

  log.info("[DGM] Plugin registered: 4 tools, 4 gateway RPCs");
}
