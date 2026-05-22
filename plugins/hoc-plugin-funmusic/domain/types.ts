/**
 * Domain Types — FunMusic (InspireMusic) AI Music Generation
 *
 * Pure value objects with no external dependencies.
 * Models the InspireMusic generation pipeline.
 */

// ─── Generation Tasks ───────────────────────────────────────────

export type MusicTask = "text-to-music" | "continuation";

/**
 * Chorus/structure hints for music generation.
 * InspireMusic uses these to control the song structure.
 */
export type ChorusMode = "intro" | "verse" | "chorus" | "outro";

export type OutputFormat = "wav" | "mp3" | "flac";

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface MusicJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly task: MusicTask;
  readonly prompt: string;
  readonly audioPromptPath?: string; // For continuation task
  readonly chorusMode: ChorusMode;
  readonly startTime: number; // seconds — generation window start
  readonly endTime: number; // seconds — generation window end
  readonly fast: boolean; // skip flow-matching for faster generation
  readonly outputFormat: OutputFormat;
  status: JobStatus;
  readonly outputPath: string;
  readonly createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

// ─── Configuration ──────────────────────────────────────────────

export interface InspireMusicConfig {
  readonly pythonPath: string;
  readonly installPath: string;
  readonly modelName: string;
  readonly modelDir: string;
  readonly outputDir: string;
  readonly defaultChorusMode: ChorusMode;
  readonly defaultStartTime: number;
  readonly defaultEndTime: number;
  readonly defaultFast: boolean;
  readonly defaultOutputFormat: OutputFormat;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: InspireMusicConfig = {
  pythonPath: "python",
  installPath: "", // set from dataDir
  modelName: "InspireMusic-1.5B-Long",
  modelDir: "", // set from dataDir
  outputDir: "", // set from dataDir
  defaultChorusMode: "verse",
  defaultStartTime: 0.0,
  defaultEndTime: 30.0,
  defaultFast: false,
  defaultOutputFormat: "wav",
  timeoutMs: 15 * 60 * 1000, // 15 min — long-form music can take time
};

// ─── Queue Status ───────────────────────────────────────────────

export interface MusicQueueStatus {
  readonly totalJobs: number;
  readonly queuedJobs: number;
  readonly runningJobs: number;
  readonly completedJobs: number;
  readonly failedJobs: number;
  readonly installed: boolean;
}
