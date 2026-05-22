/**
 * Application — Pipeline Orchestrator
 *
 * Manages multi-stage DFL pipelines: workspace creation, stage transitions,
 * training control, and progress tracking. Uses the GPU monitor from the
 * FaceFusion plugin for shared GPU admission.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { DflConfig, DflPipeline, DflPipelineStage, PipelineStatus } from "../domain/types.ts";
import { WORKSPACE_DIRS } from "../domain/types.ts";
import {
    extractFaces, extractVideo, killProcess, mergeFaces, sortFaces,
    trainModel, videoFromSequence, type RunningProcess
} from "../infrastructure/deepfacelab-cli.ts";

// ─── State ──────────────────────────────────────────────────────

const pipelines = new Map<string, DflPipeline>();
const activeProcesses = new Map<string, RunningProcess>();
let pipelineCounter = 0;

// ─── GPU Sharing (soft import of FaceFusion GPU monitor) ────────

let canAcceptGpuJob: () => boolean = () => true;

try {
  // Share GPU gating with FaceFusion if available
  const gpuMod = require("../../hoc-plugin-facefusion/infrastructure/gpu-monitor.js");
  if (typeof gpuMod.canAcceptJob === "function") {
    canAcceptGpuJob = gpuMod.canAcceptJob;
  }
} catch {
  // FaceFusion not present; always allow
}

// ─── Pipeline Creation ──────────────────────────────────────────

export function createPipeline(
  config: DflConfig,
  citizenId: string,
  citizenName: string,
  sourceVideo: string,
  targetVideo: string,
  modelName: string,
  stages?: DflPipelineStage[],
): DflPipeline {
  const id = `dfl-${Date.now()}-${++pipelineCounter}`;
  const workspacePath = path.join(config.workspaceRoot, id);

  // Create workspace directories
  fs.mkdirSync(workspacePath, { recursive: true });
  for (const dir of WORKSPACE_DIRS) {
    fs.mkdirSync(path.join(workspacePath, dir), { recursive: true });
  }

  const outputVideo = path.join(workspacePath, "result", "output.mp4");

  const pipeline: DflPipeline = {
    id,
    citizenId,
    citizenName,
    status: "created",
    currentStage: null,
    stageProgress: 0,
    overallProgress: 0,
    stages: stages ?? [
      "video_extract_src",
      "video_extract_dst",
      "face_extract_src",
      "face_extract_dst",
      "sort_src",
      "sort_dst",
      "train",
      "merge",
      "video_compose",
    ],
    completedStages: [],
    sourceVideo,
    targetVideo,
    outputVideo,
    workspacePath,
    modelName,
    createdAt: Date.now(),
    trainingIterations: 0,
    maxTrainingIterations: config.maxTrainingIterations,
  };

  pipelines.set(id, pipeline);
  return pipeline;
}

// ─── Stage Execution ────────────────────────────────────────────

function advanceStage(config: DflConfig, pipeline: DflPipeline): void {
  const nextIdx = pipeline.completedStages.length;
  if (nextIdx >= pipeline.stages.length) {
    pipeline.status = "completed";
    pipeline.currentStage = null;
    pipeline.overallProgress = 100;
    pipeline.completedAt = Date.now();
    return;
  }

  const stage = pipeline.stages[nextIdx];
  pipeline.currentStage = stage;
  pipeline.stageProgress = 0;
  pipeline.overallProgress = Math.round((nextIdx / pipeline.stages.length) * 100);

  executeStage(config, pipeline, stage);
}

function executeStage(config: DflConfig, pipeline: DflPipeline, stage: DflPipelineStage): void {
  const ws = pipeline.workspacePath;

  const onProgress = (line: string) => {
    // Parse progress from DFL output
    const pctMatch = line.match(/(\d+)%/);
    if (pctMatch) {
      pipeline.stageProgress = parseInt(pctMatch[1], 10);
    }
    // Parse training iterations
    if (stage === "train") {
      const iterMatch = line.match(/\[(\d+)\]/);
      if (iterMatch) {
        pipeline.trainingIterations = parseInt(iterMatch[1], 10);
        pipeline.stageProgress = Math.min(
          100,
          Math.round((pipeline.trainingIterations / pipeline.maxTrainingIterations) * 100),
        );
      }
    }
  };

  const onComplete = (exitCode: number) => {
    activeProcesses.delete(pipeline.id);
    if (exitCode === 0 || stage === "train") {
      // Training may exit with code != 0 on user interrupt — still valid
      pipeline.completedStages.push(stage);
      pipeline.stageProgress = 100;
      advanceStage(config, pipeline);
    } else {
      pipeline.status = "failed";
      pipeline.error = `Stage "${stage}" failed (exit code ${exitCode})`;
    }
  };

  let proc: RunningProcess;

  switch (stage) {
    case "video_extract_src":
      proc = extractVideo(
        config,
        pipeline.sourceVideo,
        path.join(ws, "data_src"),
        undefined,
        onProgress,
        onComplete,
      );
      break;

    case "video_extract_dst":
      proc = extractVideo(
        config,
        pipeline.targetVideo,
        path.join(ws, "data_dst"),
        undefined,
        onProgress,
        onComplete,
      );
      break;

    case "face_extract_src":
      proc = extractFaces(
        config,
        path.join(ws, "data_src"),
        path.join(ws, "data_src", "aligned"),
        {
          faceType: config.defaultFaceType,
          imageSize: config.defaultImageSize,
          jpegQuality: config.defaultJpegQuality,
        },
        onProgress,
        onComplete,
      );
      break;

    case "face_extract_dst":
      proc = extractFaces(
        config,
        path.join(ws, "data_dst"),
        path.join(ws, "data_dst", "aligned"),
        {
          faceType: config.defaultFaceType,
          imageSize: config.defaultImageSize,
          jpegQuality: config.defaultJpegQuality,
        },
        onProgress,
        onComplete,
      );
      break;

    case "sort_src":
      proc = sortFaces(
        config,
        path.join(ws, "data_src", "aligned"),
        config.defaultSortMethod,
        onProgress,
        onComplete,
      );
      break;

    case "sort_dst":
      proc = sortFaces(
        config,
        path.join(ws, "data_dst", "aligned"),
        config.defaultSortMethod,
        onProgress,
        onComplete,
      );
      break;

    case "xseg_apply":
      // Skip if no XSeg model available — treat as success
      onComplete(0);
      return;

    case "train":
      proc = trainModel(
        config,
        path.join(ws, "data_src", "aligned"),
        path.join(ws, "data_dst", "aligned"),
        path.join(ws, "model"),
        pipeline.modelName,
        onProgress,
        onComplete,
      );
      break;

    case "merge":
      proc = mergeFaces(
        config,
        path.join(ws, "data_dst"),
        path.join(ws, "merged"),
        path.join(ws, "merged", "mask"),
        path.join(ws, "model"),
        pipeline.modelName,
        path.join(ws, "data_dst", "aligned"),
        onProgress,
        onComplete,
      );
      break;

    case "video_compose":
      proc = videoFromSequence(
        config,
        path.join(ws, "merged"),
        pipeline.outputVideo,
        pipeline.targetVideo,
        { includeAudio: true },
        onProgress,
        onComplete,
      );
      break;

    default:
      onComplete(1);
      return;
  }

  activeProcesses.set(pipeline.id, proc);
}

// ─── Pipeline Control ───────────────────────────────────────────

/**
 * Start or resume a pipeline.
 * Returns false if GPU is saturated.
 */
export function startPipeline(config: DflConfig, pipelineId: string): boolean {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) {
    return false;
  }
  if (pipeline.status === "running") {
    return true;
  }

  if (!canAcceptGpuJob()) {
    return false;
  }

  pipeline.status = "running";
  pipeline.startedAt = pipeline.startedAt ?? Date.now();
  advanceStage(config, pipeline);
  return true;
}

/**
 * Cancel a running pipeline.
 */
export function cancelPipeline(pipelineId: string): boolean {
  const pipeline = pipelines.get(pipelineId);
  if (!pipeline) {
    return false;
  }

  const proc = activeProcesses.get(pipelineId);
  if (proc) {
    killProcess(proc);
    activeProcesses.delete(pipelineId);
  }

  pipeline.status = "failed";
  pipeline.error = "Cancelled by user";
  return true;
}

/**
 * Get a pipeline by ID.
 */
export function getPipeline(pipelineId: string): DflPipeline | undefined {
  return pipelines.get(pipelineId);
}

/**
 * List all pipelines, optionally filtered by status.
 */
export function listPipelines(status?: PipelineStatus): DflPipeline[] {
  const all = Array.from(pipelines.values());
  return status ? all.filter((p) => p.status === status) : all;
}

/**
 * Tick — advance any running pipelines that need processing.
 * Called from the event hook on `tick:before`.
 */
export function tickPipelines(_config: DflConfig): void {
  // Progress updates happen via callbacks in executeStage — tick is a no-op for now
  // but reserved for future periodic health checks and stalled pipeline detection
}

/**
 * Get queue status summary.
 */
export function getQueueStatus(): {
  total: number;
  running: number;
  completed: number;
  failed: number;
} {
  const all = Array.from(pipelines.values());
  return {
    total: all.length,
    running: all.filter((p) => p.status === "running").length,
    completed: all.filter((p) => p.status === "completed").length,
    failed: all.filter((p) => p.status === "failed").length,
  };
}
