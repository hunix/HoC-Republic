/**
 * Domain Types — OmniGen Unified Image Generation
 *
 * Pure value objects with no external dependencies.
 * Models the OmniGen generation pipeline.
 *
 * OmniGen is unique in that it can process multi-modal prompts
 * with inline image references using <img><|image_N|></img> syntax.
 */

// ─── Generation Modes ───────────────────────────────────────────

export type OmniGenMode = "text2image" | "conditioned"; // multi-modal: text + reference images

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface OmniGenJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly mode: OmniGenMode;
  readonly prompt: string;
  readonly inputImages: string[]; // Reference images for conditioned generation
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly guidanceScale: number;
  readonly imgGuidanceScale: number;
  readonly offloadModel: boolean;
  status: JobStatus;
  readonly outputPath: string;
  readonly createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

// ─── Configuration ──────────────────────────────────────────────

export interface OmniGenConfig {
  readonly pythonPath: string;
  readonly installPath: string; // Cloned repo path
  readonly modelId: string;
  readonly modelCacheDir: string;
  readonly outputDir: string;
  readonly defaultWidth: number;
  readonly defaultHeight: number;
  readonly defaultGuidanceScale: number;
  readonly defaultImgGuidanceScale: number;
  readonly offloadModel: boolean;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: OmniGenConfig = {
  pythonPath: "python",
  installPath: "", // set from dataDir
  modelId: "Shitao/OmniGen-v1",
  modelCacheDir: "", // set from dataDir
  outputDir: "", // set from dataDir
  defaultWidth: 1024,
  defaultHeight: 1024,
  defaultGuidanceScale: 2.5,
  defaultImgGuidanceScale: 1.6,
  offloadModel: true, // Enable by default to reduce VRAM requirements
  timeoutMs: 10 * 60 * 1000, // 10 minutes
};

// ─── Queue Status ───────────────────────────────────────────────

export interface OmniGenQueueStatus {
  readonly totalJobs: number;
  readonly queuedJobs: number;
  readonly runningJobs: number;
  readonly completedJobs: number;
  readonly failedJobs: number;
  readonly installed: boolean;
}
