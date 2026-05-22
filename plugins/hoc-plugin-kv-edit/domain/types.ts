/**
 * Domain Types — KV-Edit
 *
 * Pure value objects for training-free image editing with background preservation.
 */

// ─── Edit Operations ────────────────────────────────────────────

export type EditOperation = "add" | "remove" | "replace";

// ─── Edit Request ───────────────────────────────────────────────

export interface EditRequest {
  readonly imagePath: string; // source image
  readonly maskPath?: string; // optional mask image
  readonly sourcePrompt: string; // describes the original image
  readonly targetPrompt: string; // describes the desired edit
  readonly operation: EditOperation;
  readonly skipSteps: number; // inversion skip steps (higher = more change)
  readonly attnScale: number; // attention scale for background continuity
  readonly reInit: boolean; // use image blending instead of inversion
  readonly attnMask: boolean; // use attention mask during inversion
  readonly seed: number;
}

export const DEFAULT_EDIT_PARAMS: Omit<EditRequest, "imagePath" | "sourcePrompt" | "targetPrompt"> =
  {
    operation: "replace",
    skipSteps: 3,
    attnScale: 1.0,
    reInit: false,
    attnMask: false,
    seed: -1,
  };

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus = "queued" | "inverting" | "editing" | "completed" | "failed" | "cancelled";

export interface EditJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly request: EditRequest;
  status: JobStatus;
  progress: number;
  outputPath?: string;
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

// ─── Configuration ──────────────────────────────────────────────

export interface KVEditConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly timeoutMs: number;
  readonly offload: boolean; // --offload flag for limited GPU
}

export const DEFAULT_CONFIG: KVEditConfig = {
  repoDir: "",
  outputDir: "",
  pythonPath: "python",
  timeoutMs: 10 * 60 * 1000,
  offload: false,
};

// ─── Queue Status ───────────────────────────────────────────────

export interface QueueStatus {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
}
