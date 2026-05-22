/**
 * Domain Types — Switti
 *
 * Pure value objects for scale-wise transformer text-to-image generation.
 */

// ─── Model Variants ─────────────────────────────────────────────

export type SwittiModel =
  | "Switti" // 512×512 scale-wise
  | "Switti-AR" // 512×512 autoregressive
  | "Switti-1024" // 1024×1024 scale-wise
  | "Switti-1024-AR"; // 1024×1024 autoregressive

export const MODEL_HF_PATHS: Record<SwittiModel, string> = {
  Switti: "yresearch/Switti",
  "Switti-AR": "yresearch/Switti-AR",
  "Switti-1024": "yresearch/Switti-1024",
  "Switti-1024-AR": "yresearch/Switti-1024-AR",
};

export const MODEL_RESOLUTIONS: Record<SwittiModel, { width: number; height: number }> = {
  Switti: { width: 512, height: 512 },
  "Switti-AR": { width: 512, height: 512 },
  "Switti-1024": { width: 1024, height: 1024 },
  "Switti-1024-AR": { width: 1024, height: 1024 },
};

// ─── Generation Request ─────────────────────────────────────────

export interface GenerationRequest {
  readonly prompt: string;
  readonly model: SwittiModel;
  readonly cfg: number; // classifier-free guidance
  readonly topK: number; // top-k sampling
  readonly topP: number; // top-p (nucleus) sampling
  readonly moreSmooth: boolean; // smoother generation
  readonly seed: number; // -1 for random
  readonly smoothStartSi: number; // scale index to start smoothing
  readonly turnOnCfgStartSi: number;
  readonly turnOffCfgStartSi: number;
  readonly lastScaleTemp: number; // temperature for last scale
}

export const DEFAULT_GENERATION_PARAMS: Omit<GenerationRequest, "prompt"> = {
  model: "Switti-1024",
  cfg: 6.0,
  topK: 400,
  topP: 0.95,
  moreSmooth: true,
  seed: -1,
  smoothStartSi: 2,
  turnOnCfgStartSi: 0,
  turnOffCfgStartSi: 11,
  lastScaleTemp: 0.1,
};

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface GenerationJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly request: GenerationRequest;
  status: JobStatus;
  progress: number;
  outputPath?: string;
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

// ─── Configuration ──────────────────────────────────────────────

export interface SwittiConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: SwittiConfig = {
  repoDir: "",
  outputDir: "",
  pythonPath: "python",
  timeoutMs: 5 * 60 * 1000, // 5 min — Switti is fast
};

// ─── Queue Status ───────────────────────────────────────────────

export interface QueueStatus {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
}
