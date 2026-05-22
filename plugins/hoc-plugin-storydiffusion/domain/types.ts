/**
 * Domain Types — StoryDiffusion
 *
 * Pure value objects for character-consistent story image/video generation.
 */

// ─── Model Types ────────────────────────────────────────────────

export type BaseModel = "sd15" | "sdxl";

export type GenerationMode = "story-images" | "image-to-video" | "comic";

// ─── Story Types ────────────────────────────────────────────────

export interface StoryScene {
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly characterRef?: string; // reference image for character consistency
}

export interface StoryRequest {
  readonly scenes: StoryScene[]; // minimum 3 scenes recommended
  readonly mode: GenerationMode;
  readonly baseModel: BaseModel;
  readonly modelPath?: string; // custom SDXL/SD1.5 model path
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly guidanceScale: number;
  readonly numInferenceSteps: number;
  readonly stylePrompt?: string; // global style applied to all scenes
  readonly comicLayout?: "grid" | "strip" | "page";
}

export const DEFAULT_STORY_PARAMS: Omit<StoryRequest, "scenes"> = {
  mode: "story-images",
  baseModel: "sdxl",
  width: 1024,
  height: 1024,
  seed: -1,
  guidanceScale: 7.5,
  numInferenceSteps: 30,
  comicLayout: "grid",
};

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface StoryJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly request: StoryRequest;
  status: JobStatus;
  progress: number; // 0–100
  outputPaths: string[]; // one per scene/frame
  videoPath?: string; // for image-to-video mode
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

// ─── Configuration ──────────────────────────────────────────────

export interface StoryDiffusionConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: StoryDiffusionConfig = {
  repoDir: "",
  outputDir: "",
  pythonPath: "python",
  timeoutMs: 15 * 60 * 1000, // 15 min for multi-scene generation
};

// ─── Queue Status ───────────────────────────────────────────────

export interface QueueStatus {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
}
