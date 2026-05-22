/**
 * Domain Types — Chatterbox TTS (Resemble AI)
 *
 * Pure value objects with no external dependencies.
 * Models the three Chatterbox TTS variants.
 */

// ─── Model Variants ─────────────────────────────────────────────

/**
 * Turbo: 350M params, low-latency, paralinguistic tags ([laugh], [cough], [chuckle])
 * Standard: English-only, high-quality
 * Multilingual: 23 languages with language_id
 */
export type ChatterboxModel = "turbo" | "standard" | "multilingual";

/**
 * Supported language IDs for the Multilingual model.
 */
export type LanguageId =
  | "ar"
  | "da"
  | "de"
  | "el"
  | "en"
  | "es"
  | "fi"
  | "fr"
  | "he"
  | "hi"
  | "it"
  | "ja"
  | "ko"
  | "ms"
  | "nl"
  | "no"
  | "pl"
  | "pt"
  | "ru"
  | "sv"
  | "sw"
  | "tr"
  | "zh";

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface TTSJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly model: ChatterboxModel;
  readonly text: string;
  readonly audioPromptPath?: string; // Voice cloning reference clip
  readonly languageId?: LanguageId; // For multilingual model
  readonly exaggeration: number; // 0–1, default 0.5
  readonly cfgWeight: number; // 0–1, default 0.5
  status: JobStatus;
  readonly outputPath: string;
  readonly createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

// ─── Configuration ──────────────────────────────────────────────

export interface ChatterboxConfig {
  readonly pythonPath: string;
  readonly device: string; // "cuda" or "cpu"
  readonly defaultModel: ChatterboxModel;
  readonly defaultExaggeration: number;
  readonly defaultCfgWeight: number;
  readonly defaultLanguageId: LanguageId;
  readonly outputDir: string;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: ChatterboxConfig = {
  pythonPath: "python",
  device: "cuda",
  defaultModel: "turbo",
  defaultExaggeration: 0.5,
  defaultCfgWeight: 0.5,
  defaultLanguageId: "en",
  outputDir: "", // set from dataDir
  timeoutMs: 5 * 60 * 1000, // 5 min
};

// ─── Queue Status ───────────────────────────────────────────────

export interface TTSQueueStatus {
  readonly totalJobs: number;
  readonly queuedJobs: number;
  readonly runningJobs: number;
  readonly completedJobs: number;
  readonly failedJobs: number;
  readonly installed: boolean;
}
