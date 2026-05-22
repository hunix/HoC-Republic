/**
 * Domain Types — HunyuanVideo 1.5
 */
export type VideoResolution = "540p" | "720p" | "1080p";
export type ModelPrecision = "fp16" | "fp8" | "bf16";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface VideoRequest {
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly resolution: VideoResolution;
  readonly durationSec: number;
  readonly fps: number;
  readonly precision: ModelPrecision;
  readonly seed: number;
}

export interface I2VRequest {
  readonly imagePath: string;
  readonly prompt?: string;
  readonly durationSec: number;
}

export interface VideoJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly request: VideoRequest | I2VRequest;
  readonly mode: "t2v" | "i2v";
  status: JobStatus;
  progress: number;
  outputVideoPath?: string;
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

export const DEFAULT_VIDEO_PARAMS: Omit<VideoRequest, "prompt"> = {
  resolution: "720p",
  durationSec: 5,
  fps: 24,
  precision: "fp8",
  seed: -1,
};

export interface HunyuanConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: HunyuanConfig = {
  repoDir: "", outputDir: "", pythonPath: "python", timeoutMs: 20 * 60 * 1000,
};

export interface QueueStatus {
  readonly total: number; readonly queued: number; readonly running: number; readonly completed: number; readonly failed: number;
}
