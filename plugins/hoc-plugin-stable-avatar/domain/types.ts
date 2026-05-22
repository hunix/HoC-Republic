/**
 * Domain Types — StableAvatar
 *
 * Pure value objects for audio-driven avatar video synthesis.
 */

// ─── Generation Modes ───────────────────────────────────────────

export type GenerationMode = "base" | "finetuned" | "lora";

// ─── Avatar Request ─────────────────────────────────────────────

export interface AvatarRequest {
  readonly referenceImagePath: string; // face reference image
  readonly audioPath: string; // driving audio
  readonly mode: GenerationMode;
  readonly loraPath?: string; // for lora mode
  readonly outputDuration?: number; // auto-detect from audio if not set
  readonly guidanceScale: number; // audio native guidance
  readonly seed: number;
  readonly fps: number;
}

export const DEFAULT_AVATAR_PARAMS: Omit<AvatarRequest, "referenceImagePath" | "audioPath"> = {
  mode: "base",
  guidanceScale: 3.5,
  seed: -1,
  fps: 25,
};

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AvatarJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly request: AvatarRequest;
  status: JobStatus;
  progress: number;
  outputVideoPath?: string;
  durationSeconds?: number;
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

// ─── Configuration ──────────────────────────────────────────────

export interface StableAvatarConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly timeoutMs: number;
  readonly checkpointPath: string;
}

export const DEFAULT_CONFIG: StableAvatarConfig = {
  repoDir: "",
  outputDir: "",
  pythonPath: "python",
  timeoutMs: 30 * 60 * 1000, // 30 min — long video generation
  checkpointPath: "",
};

// ─── Queue Status ───────────────────────────────────────────────

export interface QueueStatus {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
}
