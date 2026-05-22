/**
 * Domain Types — Open Lovable
 *
 * Pure value objects for AI-powered website cloning and React app generation.
 */

// ─── AI Providers ───────────────────────────────────────────────

export type AIProvider = "gemini" | "anthropic" | "openai" | "groq";

export type SandboxProvider = "vercel" | "e2b";

// ─── Generation Modes ───────────────────────────────────────────

export type GenerationMode =
  | "clone" // scrape URL → generate React clone
  | "chat" // chat-based code generation
  | "edit"; // modify existing generated app

// ─── Clone Request ──────────────────────────────────────────────

export interface CloneRequest {
  readonly url: string; // URL to clone
  readonly provider: AIProvider; // which AI model to use
  readonly sandbox: SandboxProvider;
  readonly instructions?: string; // custom instructions for generation
}

export interface ChatRequest {
  readonly message: string; // user chat message
  readonly provider: AIProvider;
  readonly sandbox: SandboxProvider;
  readonly projectId?: string; // existing project to edit
}

export const DEFAULT_CLONE_PARAMS = {
  provider: "gemini" as AIProvider,
  sandbox: "vercel" as SandboxProvider,
};

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus =
  | "queued"
  | "scraping"
  | "generating"
  | "deploying"
  | "completed"
  | "failed"
  | "cancelled";

export interface GenerationJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly mode: GenerationMode;
  readonly sourceUrl?: string;
  status: JobStatus;
  progress: number;
  scrapedContent?: string;
  generatedCode?: string;
  deployUrl?: string;
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

// ─── Configuration ──────────────────────────────────────────────

export interface LovableConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly firecrawlApiKey?: string;
  readonly geminiApiKey?: string;
  readonly anthropicApiKey?: string;
  readonly openaiApiKey?: string;
  readonly groqApiKey?: string;
  readonly sandboxProvider: SandboxProvider;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: LovableConfig = {
  repoDir: "",
  outputDir: "",
  sandboxProvider: "vercel",
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
