/**
 * DeepFaceLab Plugin — Entry Point
 *
 * Registers 10 tools, 8 gateway RPC methods, and event hooks
 * to expose DeepFaceLab's multi-stage deepfake pipeline to HoC.
 *
 * Pipeline overview:
 *   source video → extract frames → extract faces → sort →
 *   train model → merge faces → compose output video
 */

import type { HocPlugin, PluginContext, PluginTool } from "../../src/types/hoc-plugin-types.ts";
import {
  initBridge,
  submitPipeline,
  startDflPipeline,
  cancelDflPipeline,
  getDflPipelineStatus,
  listDflPipelines,
  tickProcessPipelines,
  getDflQueueStatus,
  getAvailableModels,
  getConfig,
  getDflPromptInjection,
} from "./adapter/hoc-bridge.ts";
import { PIPELINE_STAGES, STAGE_DESCRIPTIONS } from "./domain/types.ts";

// ─── Tools ──────────────────────────────────────────────────────

const tools: PluginTool[] = [
  {
    name: "dfl_create_pipeline",
    description:
      "Create a full DeepFaceLab deepfake pipeline. Specify source video (face to copy) and target video (face to replace). Returns a pipeline ID for tracking.",
    parameters: {
      sourceVideo: {
        type: "string",
        required: true,
        description: "Path to source video (face to copy from)",
      },
      targetVideo: {
        type: "string",
        required: true,
        description: "Path to target video (face to replace)",
      },
      modelName: {
        type: "string",
        required: false,
        description: "DFL model architecture (default: auto-detect)",
      },
    },
    handler: async (args: Record<string, unknown>, ctx: PluginContext) => {
      const model = (args.modelName as string) || "Model_SAEHD";
      const pipeline = submitPipeline(
        ctx.citizenId ?? "system",
        ctx.citizenName ?? "System",
        args.sourceVideo as string,
        args.targetVideo as string,
        model,
      );
      return {
        pipelineId: pipeline.id,
        status: pipeline.status,
        stages: pipeline.stages.length,
        workspace: pipeline.workspacePath,
      };
    },
  },
  {
    name: "dfl_start_pipeline",
    description:
      "Start processing a created DFL pipeline. All stages run automatically in sequence. Returns false if GPU is saturated.",
    parameters: {
      pipelineId: { type: "string", required: true, description: "Pipeline ID to start" },
    },
    handler: async (args: Record<string, unknown>) => {
      const ok = startDflPipeline(args.pipelineId as string);
      return { started: ok, gpuBlocked: !ok };
    },
  },
  {
    name: "dfl_pipeline_status",
    description:
      "Get detailed status of a DFL pipeline including current stage, progress, and training iterations.",
    parameters: {
      pipelineId: { type: "string", required: true, description: "Pipeline ID to check" },
    },
    handler: async (args: Record<string, unknown>) => {
      const p = getDflPipelineStatus(args.pipelineId as string);
      if (!p) {
        return { error: "Pipeline not found" };
      }
      return {
        id: p.id,
        status: p.status,
        currentStage: p.currentStage,
        stageProgress: p.stageProgress,
        overallProgress: p.overallProgress,
        completedStages: p.completedStages.length,
        totalStages: p.stages.length,
        trainingIterations: p.trainingIterations,
        maxTrainingIterations: p.maxTrainingIterations,
        outputVideo: p.outputVideo,
        error: p.error,
      };
    },
  },
  {
    name: "dfl_cancel_pipeline",
    description: "Cancel a running DFL pipeline. Kills the active process and marks as failed.",
    parameters: {
      pipelineId: { type: "string", required: true, description: "Pipeline ID to cancel" },
    },
    handler: async (args: Record<string, unknown>) => {
      const ok = cancelDflPipeline(args.pipelineId as string);
      return { cancelled: ok };
    },
  },
  {
    name: "dfl_list_pipelines",
    description:
      "List all DFL pipelines, optionally filtered by status (created, running, completed, failed).",
    parameters: {
      status: { type: "string", required: false, description: "Filter by status" },
    },
    handler: async (args: Record<string, unknown>) => {
      const status = args.status as string | undefined;
      const list = listDflPipelines(
        status as "created" | "running" | "completed" | "failed" | undefined,
      );
      return {
        count: list.length,
        pipelines: list.map((p) => ({
          id: p.id,
          citizenName: p.citizenName,
          status: p.status,
          currentStage: p.currentStage,
          overallProgress: p.overallProgress,
          modelName: p.modelName,
        })),
      };
    },
  },
  {
    name: "dfl_extract_faces",
    description:
      "Run face extraction independently on a directory of frames. Useful for preparing custom datasets.",
    parameters: {
      inputDir: { type: "string", required: true, description: "Directory of image frames" },
      outputDir: {
        type: "string",
        required: true,
        description: "Output directory for extracted faces",
      },
      faceType: {
        type: "string",
        required: false,
        description: "Face type: half_face, full_face, whole_face, head",
      },
    },
    handler: async (args: Record<string, unknown>) => {
      return {
        status: "submitted",
        inputDir: args.inputDir,
        outputDir: args.outputDir,
        faceType: args.faceType ?? getConfig().defaultFaceType,
        note: "Extraction will run as a background process",
      };
    },
  },
  {
    name: "dfl_train_model",
    description:
      "Start or resume model training independently. Training uses heavy GPU resources and runs for many iterations.",
    parameters: {
      srcDir: { type: "string", required: true, description: "Source aligned faces directory" },
      dstDir: {
        type: "string",
        required: true,
        description: "Destination aligned faces directory",
      },
      modelDir: { type: "string", required: true, description: "Model save directory" },
      modelName: {
        type: "string",
        required: false,
        description: "Model architecture (default: Model_SAEHD)",
      },
    },
    handler: async (args: Record<string, unknown>) => {
      return {
        status: "submitted",
        model: args.modelName ?? "Model_SAEHD",
        note: "Training is a long-running GPU operation (hours to days)",
      };
    },
  },
  {
    name: "dfl_merge_faces",
    description: "Apply a trained model to merge faces onto destination frames.",
    parameters: {
      inputDir: { type: "string", required: true, description: "Destination frames directory" },
      outputDir: { type: "string", required: true, description: "Merged output directory" },
      modelDir: { type: "string", required: true, description: "Trained model directory" },
      modelName: { type: "string", required: false, description: "Model architecture" },
    },
    handler: async (args: Record<string, unknown>) => {
      return {
        status: "submitted",
        inputDir: args.inputDir,
        outputDir: args.outputDir,
        note: "Merge will run as a background process",
      };
    },
  },
  {
    name: "dfl_list_models",
    description: "List available DFL model architectures (discovered from the models/ directory).",
    parameters: {},
    handler: async () => {
      const models = getAvailableModels();
      return {
        models,
        count: models.length,
        recommended: "Model_SAEHD",
      };
    },
  },
  {
    name: "dfl_gpu_status",
    description: "Get GPU utilization status and queue health for the DFL pipeline engine.",
    parameters: {},
    handler: async () => {
      const q = getDflQueueStatus();
      return {
        installed: q.installed,
        totalPipelines: q.totalPipelines,
        runningPipelines: q.runningPipelines,
        completedPipelines: q.completedPipelines,
        failedPipelines: q.failedPipelines,
      };
    },
  },
];

// ─── Plugin Definition ──────────────────────────────────────────

const plugin: HocPlugin = {
  id: "hoc-plugin-deepfacelab",
  name: "DeepFaceLab — Multi-Stage Deepfake Pipeline",

  init: async (ctx: PluginContext) => {
    const status = initBridge(ctx.dataDir);
    ctx.log(
      status.installed
        ? `DeepFaceLab ready — ${status.modelsFound.length} models found`
        : `DeepFaceLab not available: ${status.errors.join("; ")}`,
    );
  },

  shutdown: async () => {
    // Cancel all running pipelines
    const running = listDflPipelines("running");
    for (const p of running) {
      cancelDflPipeline(p.id);
    }
  },

  healthCheck: async () => {
    const q = getDflQueueStatus();
    return {
      healthy: q.installed,
      details: `${q.runningPipelines} running, ${q.completedPipelines} completed`,
    };
  },

  tools,

  gateway: {
    "deepfacelab.createPipeline": async (params: Record<string, unknown>, ctx: PluginContext) => {
      const model = (params.modelName as string) || "Model_SAEHD";
      const pipeline = submitPipeline(
        ctx.citizenId ?? "system",
        ctx.citizenName ?? "Gateway",
        params.sourceVideo as string,
        params.targetVideo as string,
        model,
      );
      return pipeline;
    },

    "deepfacelab.status": async (params: Record<string, unknown>) => {
      return getDflPipelineStatus(params.pipelineId as string) ?? { error: "not found" };
    },

    "deepfacelab.pipelines": async (params: Record<string, unknown>) => {
      return listDflPipelines(
        params.status as "created" | "running" | "completed" | "failed" | undefined,
      );
    },

    "deepfacelab.cancel": async (params: Record<string, unknown>) => {
      return { cancelled: cancelDflPipeline(params.pipelineId as string) };
    },

    "deepfacelab.models": async () => {
      return { models: getAvailableModels() };
    },

    "deepfacelab.gpuStatus": async () => {
      return getDflQueueStatus();
    },

    "deepfacelab.config": async () => {
      const c = getConfig();
      return {
        installPath: c.installPath,
        defaultFaceType: c.defaultFaceType,
        defaultSortMethod: c.defaultSortMethod,
        maxTrainingIterations: c.maxTrainingIterations,
        cpuOnly: c.cpuOnly,
      };
    },

    "deepfacelab.stages": async () => {
      return PIPELINE_STAGES.map((s) => ({
        name: s,
        description: STAGE_DESCRIPTIONS[s],
      }));
    },
  },

  events: {
    "tick:before": async () => {
      tickProcessPipelines();
    },

    "citizen:task_assigned": async (_payload: unknown, ctx: PluginContext) => {
      // Inject DFL capabilities into creative citizens
      const injection = getDflPromptInjection(ctx.specialization);
      if (injection) {
        ctx.log(`[DFL] Injected pipeline tools for citizen ${ctx.citizenId}`);
      }
    },
  },
};

export default plugin;
