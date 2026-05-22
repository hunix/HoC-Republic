/**
 * Domain Types — Bark (Suno AI)
 *
 * Pure value objects for text-prompted generative audio.
 */

// ─── Audio Types ────────────────────────────────────────────────

export type AudioMode = "speech" | "music" | "sound-effect" | "mixed";

export const SAMPLE_RATE = 24_000;

// ─── Voice Presets ──────────────────────────────────────────────

export type VoiceLanguage =
  | "en"
  | "de"
  | "es"
  | "fr"
  | "hi"
  | "it"
  | "ja"
  | "ko"
  | "pl"
  | "pt"
  | "ru"
  | "tr"
  | "zh";

export interface VoicePreset {
  readonly id: string; // e.g., "v2/en_speaker_1"
  readonly language: VoiceLanguage;
  readonly speaker: number;
}

// ─── Generation Request ─────────────────────────────────────────

export interface AudioRequest {
  readonly text: string;
  readonly voicePreset?: string; // e.g., "v2/en_speaker_1"
  readonly mode: AudioMode;
  readonly outputFormat: "wav" | "mp3";
  readonly textTemp: number; // text generation temperature
  readonly waveformTemp: number; // waveform generation temperature
  readonly seed: number; // -1 for random
}

export const DEFAULT_AUDIO_PARAMS: Omit<AudioRequest, "text"> = {
  mode: "speech",
  outputFormat: "wav",
  textTemp: 0.7,
  waveformTemp: 0.7,
  seed: -1,
};

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AudioJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly request: AudioRequest;
  status: JobStatus;
  progress: number;
  outputPath?: string;
  durationMs?: number;
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

// ─── Configuration ──────────────────────────────────────────────

export interface BarkConfig {
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: BarkConfig = {
  outputDir: "",
  pythonPath: "python",
  timeoutMs: 5 * 60 * 1000,
};

// ─── Queue Status ───────────────────────────────────────────────

export interface QueueStatus {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
}
