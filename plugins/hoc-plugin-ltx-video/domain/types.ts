/**
 * Domain Types — LTX-2 Video Generation
 */

export type VideoResolution = "720p" | "1080p" | "4K";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface VideoRequest {
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly resolution: VideoResolution;
  readonly durationSec: number;
  readonly fps: number;
  readonly withAudio: boolean;
  readonly seed: number;
}

export interface I2VRequest {
  readonly imagePath: string;
  readonly prompt?: string;
  readonly durationSec: number;
  readonly resolution: VideoResolution;
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
  outputAudioPath?: string;
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

export const DEFAULT_VIDEO_PARAMS: Omit<VideoRequest, "prompt"> = {
  resolution: "1080p",
  durationSec: 5,
  fps: 24,
  withAudio: false,
  seed: -1,
};

export interface LTXConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly quantization: "none" | "fp8" | "nvfp4";
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: LTXConfig = {
  repoDir: "",
  outputDir: "",
  pythonPath: "python",
  quantization: "fp8",
  timeoutMs: 15 * 60 * 1000,
};

export interface QueueStatus {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
}
