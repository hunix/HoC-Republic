/**
 * Domain Types — SkyReels V2
 */
export type ShotType = "wide" | "medium" | "close-up" | "extreme-close-up" | "over-shoulder" | "aerial" | "pov";
export type CameraAngle = "eye-level" | "low-angle" | "high-angle" | "bird-eye" | "dutch-angle";
export type CameraMovement = "static" | "pan" | "tilt" | "dolly" | "tracking" | "crane" | "handheld" | "steadicam";
export type TransitionType = "seamless" | "fade" | "cut";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface SceneRequest {
  readonly prompt: string;
  readonly durationSec: number;
  readonly resolution: "480p" | "720p" | "1080p";
  readonly shotType: ShotType;
  readonly cameraAngle: CameraAngle;
  readonly cameraMovement: CameraMovement;
  readonly seed: number;
}

export interface ContinuousRequest {
  readonly scenes: string[];
  readonly sceneDurationSec: number;
  readonly transitionType: TransitionType;
}

export interface ExtendRequest {
  readonly videoPath: string;
  readonly prompt?: string;
  readonly extendSec: number;
}

export interface VideoJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly request: SceneRequest | ContinuousRequest | ExtendRequest;
  readonly mode: "scene" | "continuous" | "extend";
  status: JobStatus;
  progress: number;
  currentScene?: number;
  totalScenes?: number;
  outputVideoPath?: string;
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

export const DEFAULT_SCENE_PARAMS: Omit<SceneRequest, "prompt"> = {
  durationSec: 10, resolution: "720p", shotType: "medium",
  cameraAngle: "eye-level", cameraMovement: "static", seed: -1,
};

export interface SkyReelsConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly modelVariant: "5B" | "14B";
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: SkyReelsConfig = {
  repoDir: "", outputDir: "", pythonPath: "python", modelVariant: "14B", timeoutMs: 30 * 60 * 1000,
};

export interface QueueStatus {
  readonly total: number; readonly queued: number; readonly running: number; readonly completed: number; readonly failed: number;
}
