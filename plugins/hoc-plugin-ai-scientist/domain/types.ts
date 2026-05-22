/**
 * Domain Types — AI Scientist
 *
 * Pure value objects for automated scientific discovery.
 */

// ─── Research Templates ─────────────────────────────────────────

export type ResearchTemplate = "nanoGPT" | "2d_diffusion" | "grokking" | "custom";

// ─── Research Phases ────────────────────────────────────────────

export type ResearchPhase =
  | "idea-generation"
  | "experiment-design"
  | "experiment-execution"
  | "paper-writing"
  | "peer-review";

// ─── Research Request ───────────────────────────────────────────

export interface ResearchRequest {
  readonly template: ResearchTemplate;
  readonly topic?: string; // custom research topic
  readonly customTemplatePath?: string;
  readonly model: string; // LLM model to use
  readonly numIdeas: number; // how many ideas to generate
  readonly skipWriteup: boolean; // skip paper writing
}

export const DEFAULT_RESEARCH_PARAMS: Omit<ResearchRequest, "template"> = {
  model: "claude-3-5-sonnet-20241022",
  numIdeas: 5,
  skipWriteup: false,
};

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface ResearchJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly request: ResearchRequest;
  status: JobStatus;
  phase: ResearchPhase;
  progress: number;
  ideas?: string[];
  paperPath?: string;
  reviewScore?: number;
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

// ─── Review Request ─────────────────────────────────────────────

export interface ReviewRequest {
  readonly paperPath: string;
  readonly model: string;
}

export interface ReviewResult {
  readonly score: number; // 1-10
  readonly strengths: string[];
  readonly weaknesses: string[];
  readonly questions: string[];
  readonly recommendation: string;
}

// ─── Configuration ──────────────────────────────────────────────

export interface AIScientistConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: AIScientistConfig = {
  repoDir: "",
  outputDir: "",
  pythonPath: "python",
  timeoutMs: 30 * 60 * 1000, // 30 min — experiments take time
};

// ─── Queue Status ───────────────────────────────────────────────

export interface QueueStatus {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
}
