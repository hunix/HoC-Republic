/**
 * Domain Types — FaceFusion Face Manipulation Platform
 *
 * Pure value objects with no external dependencies.
 * Models the FaceFusion job queue, processor types, and GPU config.
 */

// ─── Processor Types ────────────────────────────────────────────

export type FaceProcessor =
  | "face_swapper"
  | "face_enhancer"
  | "face_debugger"
  | "frame_colorizer"
  | "frame_enhancer"
  | "lip_syncer"
  | "age_modifier"
  | "expression_restorer"
  | "style_changer";

export const ALL_PROCESSORS: readonly FaceProcessor[] = [
  "face_swapper",
  "face_enhancer",
  "face_debugger",
  "frame_colorizer",
  "frame_enhancer",
  "lip_syncer",
  "age_modifier",
  "expression_restorer",
  "style_changer",
] as const;

export const PROCESSOR_DESCRIPTIONS: Record<FaceProcessor, string> = {
  face_swapper: "Swap a source face onto a target image or video",
  face_enhancer: "Enhance and restore face quality (upscale, deblur)",
  face_debugger: "Visualize face detection landmarks and bounding boxes",
  frame_colorizer: "Colorize black-and-white video frames",
  frame_enhancer: "Upscale and enhance entire video frames",
  lip_syncer: "Synchronize lip movement with audio",
  age_modifier: "Modify apparent age of detected faces",
  expression_restorer: "Restore or transfer facial expressions",
  style_changer: "Apply artistic style transfer to faces",
};

// ─── Execution Providers ────────────────────────────────────────

export type ExecutionProvider =
  | "cuda"
  | "tensorrt"
  | "directml"
  | "rocm"
  | "openvino"
  | "coreml"
  | "cpu";

export type VideoMemoryStrategy = "strict" | "moderate" | "tolerant";

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus = "drafted" | "queued" | "processing" | "completed" | "failed";

export type JobPriority = "critical" | "high" | "normal" | "low";

export interface FaceJobStep {
  readonly processor: FaceProcessor;
  readonly args: Record<string, unknown>;
}

export interface FaceJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  status: JobStatus;
  readonly steps: FaceJobStep[];
  readonly sourceFile: string;
  readonly targetFile?: string; // For face swapping — the reference face
  readonly outputFile: string;
  readonly priority: JobPriority;
  readonly createdAt: number; // epoch ms
  startedAt?: number;
  completedAt?: number;
  progress: number; // 0..100
  error?: string;
  readonly ffJobId?: string; // FaceFusion's internal job ID
}

// ─── Configuration ──────────────────────────────────────────────

export interface FaceFusionConfig {
  readonly installPath: string;
  readonly pythonPath: string;
  readonly executionProvider: ExecutionProvider;
  readonly executionThreads: number;
  readonly systemMemoryLimit: number; // GB, 0 = unlimited
  readonly videoMemoryStrategy: VideoMemoryStrategy;
  readonly maxConcurrentJobs: number;
  readonly jobTimeoutMs: number;
  readonly outputDir: string;
  readonly jobsDir: string;
}

export const DEFAULT_CONFIG: FaceFusionConfig = {
  installPath: process.env.FACEFUSION_PATH ?? "C:\\facefusion",
  pythonPath: process.env.PYTHON_PATH ?? "python",
  executionProvider: "cuda",
  executionThreads: 4,
  systemMemoryLimit: 0,
  videoMemoryStrategy: "strict",
  maxConcurrentJobs: 1,
  jobTimeoutMs: 30 * 60 * 1000, // 30 minutes
  outputDir: "", // set in init from pluginCtx.dataDir
  jobsDir: "", // set in init from pluginCtx.dataDir
};

// ─── GPU Status ─────────────────────────────────────────────────

export interface GpuStatus {
  readonly available: boolean;
  readonly utilizationPercent: number;
  readonly vramUsedMB: number;
  readonly vramTotalMB: number;
  readonly vramFreeMB: number;
  readonly temperature?: number;
}

// ─── Queue Status ───────────────────────────────────────────────

export interface QueueStatus {
  readonly totalJobs: number;
  readonly queuedJobs: number;
  readonly processingJobs: number;
  readonly completedJobs: number;
  readonly failedJobs: number;
  readonly gpuStatus: GpuStatus;
  readonly maxConcurrent: number;
  readonly installed: boolean;
}
