/**
 * Domain Types — Deforum Stable Diffusion
 *
 * Pure value objects for animated image synthesis.
 */

// ─── Animation Modes ────────────────────────────────────────────

export type AnimationMode = "2d" | "3d" | "interpolation" | "ransac";

// ─── Animation Request ──────────────────────────────────────────

export interface AnimationRequest {
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly animationMode: AnimationMode;
  readonly maxFrames: number;
  readonly width: number;
  readonly height: number;
  readonly steps: number;
  readonly cfgScale: number;
  readonly seed: number;
  readonly fps: number;
  readonly angleSchedule?: string; // 2D/3D rotation schedule
  readonly zoomSchedule?: string; // zoom keyframes
  readonly translateX?: string; // X translation keyframes
  readonly translateY?: string; // Y translation keyframes
  readonly clipGuidance: boolean;
}

export const DEFAULT_ANIMATION_PARAMS: Omit<AnimationRequest, "prompt"> = {
  animationMode: "2d",
  maxFrames: 120,
  width: 512,
  height: 512,
  steps: 25,
  cfgScale: 7.0,
  seed: -1,
  fps: 15,
  clipGuidance: false,
};

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AnimationJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly request: AnimationRequest;
  status: JobStatus;
  progress: number;
  currentFrame: number;
  outputVideoPath?: string;
  outputFramesDir?: string;
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

// ─── Configuration ──────────────────────────────────────────────

export interface DeforumConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: DeforumConfig = {
  repoDir: "",
  outputDir: "",
  pythonPath: "python",
  timeoutMs: 20 * 60 * 1000,
};

// ─── Queue Status ───────────────────────────────────────────────

export interface QueueStatus {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
}
