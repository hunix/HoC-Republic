/**
 * Domain Types — EasyVolcap
 *
 * Pure value objects for neural volumetric video.
 */

// ─── Rendering Methods ──────────────────────────────────────────

export type RenderMethod = "enerfi" | "instant-ngp-t" | "3dgs-t";

// ─── Task Types ─────────────────────────────────────────────────

export type TaskType = "train" | "render" | "export";

// ─── Render Request ─────────────────────────────────────────────

export interface RenderRequest {
  readonly method: RenderMethod;
  readonly taskType: TaskType;
  readonly dataRoot: string; // path to multi-view video dataset
  readonly expName: string; // experiment name
  readonly epochs?: number; // training epochs
  readonly renderNovelView: boolean; // render from novel camera angles
  readonly exportMesh: boolean; // export reconstructed mesh
}

export const DEFAULT_RENDER_PARAMS: Omit<RenderRequest, "dataRoot" | "expName"> = {
  method: "3dgs-t",
  taskType: "train",
  epochs: 400,
  renderNovelView: false,
  exportMesh: false,
};

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus =
  | "queued"
  | "training"
  | "rendering"
  | "exporting"
  | "completed"
  | "failed"
  | "cancelled";

export interface RenderJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly request: RenderRequest;
  status: JobStatus;
  progress: number;
  currentEpoch: number;
  psnr?: number; // peak signal-to-noise ratio
  outputDir?: string;
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

// ─── Configuration ──────────────────────────────────────────────

export interface EasyVolcapConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: EasyVolcapConfig = {
  repoDir: "",
  outputDir: "",
  pythonPath: "python",
  timeoutMs: 60 * 60 * 1000, // 1 hour — volumetric training
};

// ─── Queue Status ───────────────────────────────────────────────

export interface QueueStatus {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
}
