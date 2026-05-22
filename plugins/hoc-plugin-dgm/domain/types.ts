/**
 * Domain Types — Darwin Gödel Machine
 *
 * Pure value objects for self-improving coding agents.
 */

// ─── Benchmark Types ────────────────────────────────────────────

export type BenchmarkType = "swe-bench" | "polyglot" | "custom";

// ─── Evolution Phases ───────────────────────────────────────────

export type EvolutionPhase =
  | "initializing"
  | "self-analysis"
  | "code-modification"
  | "benchmark-evaluation"
  | "selection"
  | "completed";

// ─── Evolution Request ──────────────────────────────────────────

export interface EvolutionRequest {
  readonly benchmark: BenchmarkType;
  readonly generations: number; // number of evolution generations
  readonly populationSize: number; // candidate agents per generation
  readonly model: string; // LLM for code modification
  readonly customBenchmarkPath?: string;
}

export const DEFAULT_EVOLUTION_PARAMS: Omit<EvolutionRequest, "benchmark"> = {
  generations: 10,
  populationSize: 5,
  model: "claude-3-5-sonnet-20241022",
};

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface EvolutionJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly request: EvolutionRequest;
  status: JobStatus;
  phase: EvolutionPhase;
  progress: number;
  currentGeneration: number;
  bestScore: number;
  improvements: string[];
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

// ─── Configuration ──────────────────────────────────────────────

export interface DGMConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: DGMConfig = {
  repoDir: "",
  outputDir: "",
  pythonPath: "python",
  timeoutMs: 60 * 60 * 1000, // 1 hour — evolution takes time
};

// ─── Queue Status ───────────────────────────────────────────────

export interface QueueStatus {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
}
