/**
 * Domain Types — MagicAnimate
 *
 * Pure value objects for human image animation via DensePose motion transfer.
 */

// ─── Animation Types ────────────────────────────────────────────

export type MotionSourceType = "densepose" | "video" | "sequence";

export interface AnimationRequest {
  readonly referenceImagePath: string;
  readonly motionSource: string; // path to DensePose video / motion sequence
  readonly motionType: MotionSourceType;
  readonly numFrames: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly guidanceScale: number;
  readonly numInferenceSteps: number;
}

export const DEFAULT_ANIMATION_PARAMS: Omit<
  AnimationRequest,
  "referenceImagePath" | "motionSource"
> = {
  motionType: "densepose",
  numFrames: 16,
  fps: 8,
  width: 512,
  height: 768,
  seed: -1,
  guidanceScale: 7.5,
  numInferenceSteps: 25,
};

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AnimationJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly request: AnimationRequest;
  status: JobStatus;
  progress: number; // 0–100
  outputPath?: string;
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

// ─── Configuration ──────────────────────────────────────────────

export interface MagicAnimateConfig {
  readonly repoDir: string;
  readonly modelsDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: MagicAnimateConfig = {
  repoDir: "",
  modelsDir: "",
  outputDir: "",
  pythonPath: "python",
  timeoutMs: 10 * 60 * 1000, // 10 min
};

// ─── Queue Status ───────────────────────────────────────────────

export interface QueueStatus {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
}
