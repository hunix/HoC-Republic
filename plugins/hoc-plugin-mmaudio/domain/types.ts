/**
 * Domain Types — MMAudio
 *
 * Pure value objects for multimodal video-to-audio and text-to-audio synthesis.
 */

// ─── Synthesis Modes ────────────────────────────────────────────

export type SynthesisMode = "video-to-audio" | "text-to-audio" | "video-text-to-audio";

// ─── Synthesis Request ──────────────────────────────────────────

export interface SynthesisRequest {
  readonly mode: SynthesisMode;
  readonly videoPath?: string; // required for video-to-audio
  readonly prompt?: string; // text description of desired audio
  readonly duration: number; // output duration in seconds (default: 8)
  readonly seed: number; // -1 for random
  readonly numSteps: number; // diffusion steps
  readonly cfgStrength: number; // classifier-free guidance strength
}

export const DEFAULT_SYNTHESIS_PARAMS: Omit<SynthesisRequest, "mode"> = {
  duration: 8,
  seed: -1,
  numSteps: 25,
  cfgStrength: 4.5,
};

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface SynthesisJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly request: SynthesisRequest;
  status: JobStatus;
  progress: number;
  outputAudioPath?: string;
  outputVideoPath?: string; // video with generated audio muxed in
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

// ─── Configuration ──────────────────────────────────────────────

export interface MMAudioConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: MMAudioConfig = {
  repoDir: "",
  outputDir: "",
  pythonPath: "python",
  timeoutMs: 10 * 60 * 1000,
};

// ─── Queue Status ───────────────────────────────────────────────

export interface QueueStatus {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
}
