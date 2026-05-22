/**
 * Domain Types — Qwen3-TTS AI Voice Synthesis & Cloning
 *
 * Pure value objects with no external dependencies.
 * Models the TTS modes, speakers, languages, and job lifecycle.
 */

// ─── TTS Modes ──────────────────────────────────────────────────

export type TtsMode = "custom_voice" | "voice_design" | "voice_clone";

export const TTS_MODES: readonly TtsMode[] = [
  "custom_voice",
  "voice_design",
  "voice_clone",
] as const;

export const MODE_DESCRIPTIONS: Record<TtsMode, string> = {
  custom_voice: "Use a preset speaker with optional emotional instruct control",
  voice_design: "Design a new voice persona using natural language description",
  voice_clone: "Clone a voice from a reference audio clip and its transcript",
};

// ─── Languages ──────────────────────────────────────────────────

export type TtsLanguage =
  | "Chinese"
  | "English"
  | "Japanese"
  | "Korean"
  | "German"
  | "French"
  | "Russian"
  | "Portuguese"
  | "Spanish"
  | "Italian"
  | "Auto";

export const SUPPORTED_LANGUAGES: readonly TtsLanguage[] = [
  "Chinese",
  "English",
  "Japanese",
  "Korean",
  "German",
  "French",
  "Russian",
  "Portuguese",
  "Spanish",
  "Italian",
  "Auto",
] as const;

// ─── Speakers ───────────────────────────────────────────────────

export interface TtsSpeaker {
  readonly name: string;
  readonly gender: "male" | "female";
  readonly nativeLanguage: TtsLanguage;
  readonly description: string;
}

export const PRESET_SPEAKERS: readonly TtsSpeaker[] = [
  {
    name: "Vivian",
    gender: "female",
    nativeLanguage: "Chinese",
    description: "Warm, expressive Chinese female voice",
  },
  {
    name: "Ryan",
    gender: "male",
    nativeLanguage: "English",
    description: "Clear, confident American male voice",
  },
  {
    name: "Claire",
    gender: "female",
    nativeLanguage: "English",
    description: "Friendly British female voice",
  },
  {
    name: "Ethan",
    gender: "male",
    nativeLanguage: "English",
    description: "Natural, engaging male narrator",
  },
  {
    name: "Aria",
    gender: "female",
    nativeLanguage: "English",
    description: "Soft, articulate female voice",
  },
  {
    name: "Yuki",
    gender: "female",
    nativeLanguage: "Japanese",
    description: "Gentle Japanese female voice",
  },
  {
    name: "Luna",
    gender: "female",
    nativeLanguage: "Chinese",
    description: "Youthful, energetic Chinese female voice",
  },
  {
    name: "Leo",
    gender: "male",
    nativeLanguage: "Chinese",
    description: "Deep, authoritative Chinese male voice",
  },
] as const;

// ─── Job Types ──────────────────────────────────────────────────

export type TtsJobStatus = "queued" | "running" | "completed" | "failed";

export interface TtsJob {
  readonly id: string;
  readonly citizenId: string;
  readonly mode: TtsMode;
  readonly text: string;
  readonly language: TtsLanguage;
  status: TtsJobStatus;
  progress: number;
  // Mode-specific fields
  readonly speaker?: string;
  readonly instruct?: string;
  readonly refAudioPath?: string;
  readonly refText?: string;
  outputPath?: string;
  readonly createdAt: number;
  completedAt?: number;
  error?: string;
}

// ─── Configuration ──────────────────────────────────────────────

export interface TtsConfig {
  readonly installPath: string;
  readonly pythonPath: string;
  readonly customVoiceModel: string;
  readonly voiceDesignModel: string;
  readonly baseModel: string;
  readonly device: string;
  readonly dtype: string;
  readonly useFlashAttn: boolean;
  readonly outputDir: string;
  readonly maxConcurrentJobs: number;
  readonly jobTimeoutMs: number;
}

export const DEFAULT_CONFIG: TtsConfig = {
  installPath: process.env.QWEN3_TTS_PATH ?? "",
  pythonPath: process.env.PYTHON_PATH ?? "python",
  customVoiceModel: "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
  voiceDesignModel: "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
  baseModel: "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
  device: "cuda:0",
  dtype: "bfloat16",
  useFlashAttn: true,
  outputDir: "", // set in init from pluginCtx.dataDir
  maxConcurrentJobs: 1,
  jobTimeoutMs: 5 * 60 * 1000, // 5 minutes per synthesis
};

// ─── Queue Status ───────────────────────────────────────────────

export interface TtsQueueStatus {
  readonly totalJobs: number;
  readonly runningJobs: number;
  readonly completedJobs: number;
  readonly failedJobs: number;
  readonly installed: boolean;
}
