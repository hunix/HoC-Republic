/**
 * Domain Types — DeepFaceLab Multi-Stage Deepfake Pipeline
 *
 * Pure value objects with no external dependencies.
 * Models the DFL pipeline stages, workspace layout, and training config.
 */

// ─── Pipeline Stages ────────────────────────────────────────────

export type DflPipelineStage =
  | "video_extract_src"
  | "video_extract_dst"
  | "face_extract_src"
  | "face_extract_dst"
  | "sort_src"
  | "sort_dst"
  | "xseg_apply"
  | "train"
  | "merge"
  | "video_compose";

export const PIPELINE_STAGES: readonly DflPipelineStage[] = [
  "video_extract_src",
  "video_extract_dst",
  "face_extract_src",
  "face_extract_dst",
  "sort_src",
  "sort_dst",
  "train",
  "merge",
  "video_compose",
] as const;

export const STAGE_DESCRIPTIONS: Record<DflPipelineStage, string> = {
  video_extract_src: "Extract frames from source video",
  video_extract_dst: "Extract frames from destination video",
  face_extract_src: "Detect and extract faces from source frames",
  face_extract_dst: "Detect and extract faces from destination frames",
  sort_src: "Sort and filter source faces by quality",
  sort_dst: "Sort and filter destination faces by quality",
  xseg_apply: "Apply XSeg segmentation mask to faces",
  train: "Train the deepfake model (long-running GPU operation)",
  merge: "Apply trained model to merge faces onto destination frames",
  video_compose: "Compose merged frames back into output video",
};

// ─── Face & Sort Types ──────────────────────────────────────────

export type FaceType = "half_face" | "full_face" | "whole_face" | "head" | "mark_only";

export type DetectorType = "s3fd" | "manual";

export type SortMethod =
  | "blur"
  | "motion-blur"
  | "face-yaw"
  | "face-pitch"
  | "face-source-rect-size"
  | "hist"
  | "hist-dissim"
  | "brightness"
  | "hue"
  | "black"
  | "origname"
  | "oneface"
  | "final-by-blur"
  | "final-by-size"
  | "absdiff";

export const SORT_METHODS: readonly SortMethod[] = [
  "blur",
  "motion-blur",
  "face-yaw",
  "face-pitch",
  "face-source-rect-size",
  "hist",
  "hist-dissim",
  "brightness",
  "hue",
  "black",
  "origname",
  "oneface",
  "final-by-blur",
  "final-by-size",
  "absdiff",
] as const;

// ─── Pipeline Types ─────────────────────────────────────────────

export type PipelineStatus = "created" | "running" | "paused" | "completed" | "failed";

export interface DflPipeline {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  status: PipelineStatus;
  currentStage: DflPipelineStage | null;
  stageProgress: number; // 0..100 for current stage
  overallProgress: number; // 0..100 across all stages
  readonly stages: DflPipelineStage[];
  completedStages: DflPipelineStage[];
  readonly sourceVideo: string;
  readonly targetVideo: string;
  readonly outputVideo: string;
  readonly workspacePath: string;
  readonly modelName: string;
  readonly createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  trainingIterations: number;
  maxTrainingIterations: number;
}

// ─── Configuration ──────────────────────────────────────────────

export interface DflConfig {
  readonly installPath: string;
  readonly pythonPath: string;
  readonly forceGpuIdxs: string | null;
  readonly cpuOnly: boolean;
  readonly defaultFaceType: FaceType;
  readonly defaultSortMethod: SortMethod;
  readonly defaultImageSize: number;
  readonly defaultJpegQuality: number;
  readonly maxTrainingIterations: number;
  readonly trainingNoPreview: boolean;
  readonly silentStart: boolean;
  readonly workspaceRoot: string;
  readonly stageTimeoutMs: number;
  readonly trainTimeoutMs: number;
}

export const DEFAULT_CONFIG: DflConfig = {
  installPath: process.env.DEEPFACELAB_PATH ?? "C:\\DeepFaceLab",
  pythonPath: process.env.PYTHON_PATH ?? "python",
  forceGpuIdxs: null,
  cpuOnly: false,
  defaultFaceType: "whole_face",
  defaultSortMethod: "hist",
  defaultImageSize: 512,
  defaultJpegQuality: 90,
  maxTrainingIterations: 100000,
  trainingNoPreview: true,
  silentStart: true,
  workspaceRoot: "", // set in init from pluginCtx.dataDir
  stageTimeoutMs: 60 * 60 * 1000, // 1 hour for non-training stages
  trainTimeoutMs: 72 * 60 * 60 * 1000, // 72 hours for training
};

// ─── Workspace Layout ───────────────────────────────────────────

/**
 * DFL workspace directory structure for a single pipeline:
 *
 * workspace/<pipeline-id>/
 * ├── data_src/                  ← Source video frames
 * │   └── aligned/               ← Extracted source faces
 * ├── data_dst/                  ← Destination video frames
 * │   └── aligned/               ← Extracted destination faces
 * ├── model/                     ← Trained model files
 * ├── merged/                    ← Merged output frames
 * │   └── mask/                  ← Merge masks
 * └── result/                    ← Final output video
 */
export const WORKSPACE_DIRS = [
  "data_src",
  "data_src/aligned",
  "data_dst",
  "data_dst/aligned",
  "model",
  "merged",
  "merged/mask",
  "result",
] as const;

// ─── Pipeline Status Summary ────────────────────────────────────

export interface DflQueueStatus {
  readonly totalPipelines: number;
  readonly runningPipelines: number;
  readonly completedPipelines: number;
  readonly failedPipelines: number;
  readonly installed: boolean;
}
