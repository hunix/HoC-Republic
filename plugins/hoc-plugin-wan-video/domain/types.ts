/**
 * Domain Types — Wan 2.2 Video Generation
 */

export type VideoResolution = "480p" | "720p";
export type VideoStyle = "cinematic" | "photorealistic" | "anime" | "artistic";
export type CameraMotion = "static" | "pan-left" | "pan-right" | "zoom-in" | "zoom-out" | "orbit" | "dolly" | "tracking";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface VideoRequest {
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly resolution: VideoResolution;
  readonly durationSec: number;
  readonly fps: number;
  readonly style: VideoStyle;
  readonly cameraMotion: CameraMotion;
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
  style: "cinematic",
  cameraMotion: "static",
  seed: -1,
};

export interface WanConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly modelVariant: "1.3B" | "5B" | "14B";
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: WanConfig = {
  repoDir: "",
  outputDir: "",
  pythonPath: "python",
  modelVariant: "5B",
  timeoutMs: 15 * 60 * 1000,
};

export interface QueueStatus {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
}
