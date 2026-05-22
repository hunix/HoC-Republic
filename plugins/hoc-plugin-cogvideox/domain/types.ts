/**
 * Domain Types — CogVideoX
 */
export type ModelVariant = "2B" | "5B";
export type QuantizationMode = "none" | "int8" | "int4";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface VideoRequest {
  readonly prompt: string;
  readonly model: ModelVariant;
  readonly numFrames: number;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly guidanceScale: number;
  readonly quantize: QuantizationMode;
  readonly seed: number;
}

export interface VideoJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly request: VideoRequest;
  status: JobStatus;
  progress: number;
  outputVideoPath?: string;
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

export const DEFAULT_VIDEO_PARAMS: Omit<VideoRequest, "prompt"> = {
  model: "5B", numFrames: 48, width: 720, height: 480, fps: 8,
  guidanceScale: 6.0, quantize: "int8", seed: -1,
};

export interface CogVideoConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: CogVideoConfig = {
  repoDir: "", outputDir: "", pythonPath: "python", timeoutMs: 10 * 60 * 1000,
};

export interface QueueStatus {
  readonly total: number; readonly queued: number; readonly running: number; readonly completed: number; readonly failed: number;
}
