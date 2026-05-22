/**
 * Domain Types — Sparc3D
 *
 * Pure value objects for high-resolution 3D shape modeling.
 */

// ─── Generation Modes ───────────────────────────────────────────

export type GenerationMode =
  | "image-to-3d" // single image → 3D mesh
  | "reconstruction"; // mesh → watertight mesh via Sparcubes

export type OutputFormat = "obj" | "glb" | "ply" | "stl";

// ─── Generation Request ─────────────────────────────────────────

export interface GenerationRequest {
  readonly mode: GenerationMode;
  readonly imagePath?: string; // for image-to-3d
  readonly meshPath?: string; // for reconstruction
  readonly resolution: number; // voxel resolution (default: 1024)
  readonly outputFormat: OutputFormat;
  readonly seed: number;
}

export const DEFAULT_GENERATION_PARAMS: Omit<GenerationRequest, "mode"> = {
  resolution: 1024,
  outputFormat: "obj",
  seed: -1,
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
  vertexCount?: number;
  faceCount?: number;
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

// ─── Configuration ──────────────────────────────────────────────

export interface Sparc3DConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: Sparc3DConfig = {
  repoDir: "",
  outputDir: "",
  pythonPath: "python",
  timeoutMs: 15 * 60 * 1000, // 15 min — high-res generation
};

// ─── Queue Status ───────────────────────────────────────────────

export interface QueueStatus {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
}
