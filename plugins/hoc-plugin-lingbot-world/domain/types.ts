/**
 * Domain Types — LingBot-World AI World Simulation
 *
 * Pure value objects for world simulation video generation,
 * camera control, resolution, and job lifecycle.
 */

// ─── Resolution ─────────────────────────────────────────────────

export type WorldResolution = "480*832" | "720*1280";

export const SUPPORTED_RESOLUTIONS: readonly WorldResolution[] = ["480*832", "720*1280"] as const;

export const RESOLUTION_LABELS: Record<WorldResolution, string> = {
  "480*832": "480p (832×480)",
  "720*1280": "720p (1280×720)",
};

// ─── Frame Count ────────────────────────────────────────────────

/**
 * Frame count must be 4n+1: 5, 9, 13, ..., 161, ..., 961
 * Default: 161 frames (~10 sec at 16fps)
 * Max: 961 frames (~60 sec at 16fps)
 */
export const DEFAULT_FRAME_NUM = 161;
export const MAX_FRAME_NUM = 961;
export const FPS = 16;

export function validateFrameCount(n: number): number {
  const clamped = Math.max(5, Math.min(MAX_FRAME_NUM, n));
  // Round to nearest 4n+1
  return Math.round((clamped - 1) / 4) * 4 + 1;
}

// ─── Task Type ──────────────────────────────────────────────────

export type WorldTask = "i2v-A14B";

export const SUPPORTED_TASKS: readonly WorldTask[] = ["i2v-A14B"] as const;

// ─── Solver ─────────────────────────────────────────────────────

export type SampleSolver = "unipc" | "dpm++";

// ─── Camera Control ─────────────────────────────────────────────

/**
 * Camera action path: directory containing
 * - intrinsics.npy: Shape [num_frames, 4] — [fx, fy, cx, cy]
 * - poses.npy: Shape [num_frames, 4, 4] — transformation matrix (OpenCV coords)
 */
export interface CameraAction {
  readonly actionPath: string;
}

// ─── Job Types ──────────────────────────────────────────────────

export type WorldJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface WorldJob {
  readonly id: string;
  readonly citizenId: string;
  readonly prompt: string;
  readonly imagePath: string;
  readonly resolution: WorldResolution;
  readonly frameNum: number;
  readonly cameraAction?: CameraAction;
  readonly seed: number;
  readonly solver: SampleSolver;
  status: WorldJobStatus;
  progress?: string;
  outputPath?: string;
  readonly createdAt: number;
  completedAt?: number;
  error?: string;
}

// ─── Configuration ──────────────────────────────────────────────

export interface WorldConfig {
  readonly installPath: string;
  readonly pythonPath: string;
  readonly generateScriptPath: string;
  readonly modelDir: string;
  readonly outputDir: string;
  readonly gpuCount: number;
  readonly useQuantized: boolean;
  readonly useFsdp: boolean;
  readonly useT5Cpu: boolean;
  readonly jobTimeoutMs: number;
}

export const DEFAULT_CONFIG: WorldConfig = {
  installPath: process.env.LINGBOT_WORLD_PATH ?? "",
  pythonPath: process.env.PYTHON_PATH ?? "python",
  generateScriptPath: "", // set in init
  modelDir: "", // set in init
  outputDir: "", // set in init
  gpuCount: 1, // auto-detected
  useQuantized: false, // auto-detected based on VRAM
  useFsdp: false, // true when gpuCount > 1
  useT5Cpu: false, // true when VRAM < 24GB
  jobTimeoutMs: 600_000, // 10 minutes (video gen is slow)
};

// ─── Queue Status ───────────────────────────────────────────────

export interface WorldQueueStatus {
  readonly totalJobs: number;
  readonly runningJobs: number;
  readonly completedJobs: number;
  readonly failedJobs: number;
  readonly installed: boolean;
}
