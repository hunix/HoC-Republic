/**
 * Domain Types — AutoGPT Platform Integration
 *
 * Pure value objects for agent lifecycle, workflows, and execution.
 */

// ─── Agent Types ────────────────────────────────────────────────

export type AgentStatus = "draft" | "active" | "paused" | "stopped" | "error";

export interface AutoGPTAgent {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: number;
  status: AgentStatus;
  readonly createdAt: number;
  updatedAt: number;
  readonly workflowId?: string;
  readonly isMarketplace: boolean;
}

// ─── Workflow / Block Types ─────────────────────────────────────

export type BlockCategory =
  | "input"
  | "output"
  | "ai"
  | "data"
  | "control"
  | "integration"
  | "custom";

export interface WorkflowBlock {
  readonly id: string;
  readonly type: string;
  readonly category: BlockCategory;
  readonly name: string;
  readonly config: Record<string, unknown>;
  readonly inputs: string[]; // connected block IDs
  readonly outputs: string[]; // connected block IDs
}

export interface Workflow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly blocks: WorkflowBlock[];
  readonly connections: WorkflowConnection[];
  readonly createdAt: number;
  updatedAt: number;
}

export interface WorkflowConnection {
  readonly sourceBlockId: string;
  readonly sourceOutput: string;
  readonly targetBlockId: string;
  readonly targetInput: string;
}

// ─── Execution Types ────────────────────────────────────────────

export type ExecutionStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AgentExecution {
  readonly id: string;
  readonly agentId: string;
  readonly agentName: string;
  readonly citizenId: string;
  readonly citizenName: string;
  status: ExecutionStatus;
  readonly input: Record<string, unknown>;
  output?: Record<string, unknown>;
  readonly startedAt: number;
  completedAt?: number;
  error?: string;
  readonly steps: ExecutionStep[];
}

export interface ExecutionStep {
  readonly blockId: string;
  readonly blockName: string;
  readonly status: ExecutionStatus;
  readonly startedAt: number;
  completedAt?: number;
  readonly output?: unknown;
  readonly error?: string;
}

// ─── Configuration ──────────────────────────────────────────────

export interface AutoGPTConfig {
  readonly serverUrl: string;
  readonly apiKey: string;
  readonly repoDir: string; // for local clone
  readonly useDocker: boolean;
  readonly timeoutMs: number;
  readonly maxConcurrentExecutions: number;
}

export const DEFAULT_CONFIG: AutoGPTConfig = {
  serverUrl: "http://localhost:8006",
  apiKey: "",
  repoDir: "", // set from dataDir
  useDocker: true,
  timeoutMs: 10 * 60 * 1000, // 10 min
  maxConcurrentExecutions: 3,
};

// ─── Queue Status ───────────────────────────────────────────────

export interface PlatformStatus {
  readonly serverReachable: boolean;
  readonly totalAgents: number;
  readonly activeAgents: number;
  readonly totalExecutions: number;
  readonly runningExecutions: number;
  readonly queuedExecutions: number;
  readonly completedExecutions: number;
  readonly failedExecutions: number;
}
