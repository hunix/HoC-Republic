/**
 * Domain Types — GLM-Image AI Image Generation
 *
 * Pure value objects with no external dependencies.
 * Models the GLM-Image generation pipeline.
 */

// ─── Resolution Presets ─────────────────────────────────────────

/**
 * GLM-Image requires dimensions divisible by 32.
 * Common presets in the form [width, height].
 */
export const RESOLUTION_PRESETS = {
  "1024x1024": [1024, 1024],
  "1152x896": [1152, 896],
  "896x1152": [896, 1152],
  "1024x768": [1024, 768],
  "768x1024": [768, 1024],
  "1280x768": [1280, 768],
  "768x1280": [768, 1280],
  "1344x768": [1344, 768],
  "768x1344": [768, 1344],
} as const;

export type ResolutionPreset = keyof typeof RESOLUTION_PRESETS;

export const RESOLUTION_LABELS: Record<ResolutionPreset, string> = {
  "1024x1024": "Square (1024×1024)",
  "1152x896": "Landscape 4:3 (1152×896)",
  "896x1152": "Portrait 3:4 (896×1152)",
  "1024x768": "Landscape 4:3 SD (1024×768)",
  "768x1024": "Portrait 3:4 SD (768×1024)",
  "1280x768": "Wide 5:3 (1280×768)",
  "768x1280": "Tall 3:5 (768×1280)",
  "1344x768": "Ultra-wide 7:4 (1344×768)",
  "768x1344": "Ultra-tall 4:7 (768×1344)",
};

/**
 * Validate that dimensions are divisible by 32.
 */
export function validateDimensions(width: number, height: number): boolean {
  return width > 0 && height > 0 && width % 32 === 0 && height % 32 === 0;
}

// ─── Generation Modes ───────────────────────────────────────────

export type GenerationMode = "text2image" | "image2image";

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface GlmImageJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly mode: GenerationMode;
  readonly prompt: string;
  readonly inputImages: string[]; // For image2image — paths to conditioning images
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly numInferenceSteps: number;
  readonly guidanceScale: number;
  status: JobStatus;
  readonly outputPath: string;
  readonly createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

// ─── Configuration ──────────────────────────────────────────────

export interface GlmImageConfig {
  readonly pythonPath: string;
  readonly modelId: string;
  readonly modelCacheDir: string;
  readonly outputDir: string;
  readonly defaultWidth: number;
  readonly defaultHeight: number;
  readonly defaultSteps: number;
  readonly defaultGuidanceScale: number;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: GlmImageConfig = {
  pythonPath: "python",
  modelId: "zai-org/GLM-Image",
  modelCacheDir: "", // set from dataDir
  outputDir: "", // set from dataDir
  defaultWidth: 1024,
  defaultHeight: 1024,
  defaultSteps: 50,
  defaultGuidanceScale: 1.5,
  timeoutMs: 10 * 60 * 1000, // 10 minutes
};

// ─── Queue Status ───────────────────────────────────────────────

export interface GlmQueueStatus {
  readonly totalJobs: number;
  readonly queuedJobs: number;
  readonly runningJobs: number;
  readonly completedJobs: number;
  readonly failedJobs: number;
  readonly installed: boolean;
}
