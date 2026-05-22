/**
 * Domain Types — Magentic-One
 *
 * Pure value objects for Microsoft's generalist multi-agent system.
 */

// ─── Agent Types ────────────────────────────────────────────────

export type AgentRole =
  | "web-surfer" // MultimodalWebSurfer — browses the web
  | "file-surfer" // FileSurfer — navigates local files
  | "coder" // MagenticOneCoderAgent — writes & executes code
  | "orchestrator"; // MagenticOneGroupChat — coordinates agents

export interface AgentConfig {
  readonly role: AgentRole;
  readonly model: string; // e.g., "gpt-4o", "gpt-4o-mini"
  readonly enabled: boolean;
}

export const DEFAULT_AGENTS: AgentConfig[] = [
  { role: "orchestrator", model: "gpt-4o", enabled: true },
  { role: "web-surfer", model: "gpt-4o", enabled: true },
  { role: "file-surfer", model: "gpt-4o", enabled: true },
  { role: "coder", model: "gpt-4o", enabled: true },
];

// ─── Task Request ───────────────────────────────────────────────

export interface TaskRequest {
  readonly task: string; // natural language task description
  readonly agents: AgentRole[]; // which agents to include
  readonly model: string; // LLM model for agents
  readonly maxRounds: number; // max orchestration rounds
  readonly maxStalls: number; // max stalled rounds before abort
  readonly haltOnReply: boolean; // stop after first reply
}

export const DEFAULT_TASK_PARAMS: Omit<TaskRequest, "task"> = {
  agents: ["orchestrator", "web-surfer", "file-surfer", "coder"],
  model: "gpt-4o",
  maxRounds: 30,
  maxStalls: 3,
  haltOnReply: false,
};

// ─── Job Types ──────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface TaskJob {
  readonly id: string;
  readonly citizenId: string;
  readonly citizenName: string;
  readonly request: TaskRequest;
  status: JobStatus;
  currentRound: number;
  activeAgent: string;
  messages: string[];
  finalAnswer?: string;
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

// ─── Configuration ──────────────────────────────────────────────

export interface MagenticConfig {
  readonly repoDir: string;
  readonly outputDir: string;
  readonly pythonPath: string;
  readonly timeoutMs: number;
}

export const DEFAULT_CONFIG: MagenticConfig = {
  repoDir: "",
  outputDir: "",
  pythonPath: "python",
  timeoutMs: 10 * 60 * 1000, // 10 min — complex tasks
};

// ─── Queue Status ───────────────────────────────────────────────

export interface QueueStatus {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
}
