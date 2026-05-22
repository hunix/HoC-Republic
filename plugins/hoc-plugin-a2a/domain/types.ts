/**
 * Domain Types — Agent2Agent (A2A) Protocol
 *
 * Pure value objects for agent-to-agent communication.
 */

// ─── Agent Card ─────────────────────────────────────────────────

export interface AgentCard {
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly capabilities: string[];
  readonly authentication?: AuthScheme;
  readonly version: string;
  readonly provider?: string;
}

export type AuthScheme = "none" | "api_key" | "oauth2" | "bearer";

// ─── Message Types ──────────────────────────────────────────────

export type MessageRole = "user" | "agent";

export interface A2AMessage {
  readonly role: MessageRole;
  readonly parts: MessagePart[];
}

export type MessagePart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "file"; readonly mimeType: string; readonly data: string }
  | { readonly type: "data"; readonly data: Record<string, unknown> };

// ─── Task Types ─────────────────────────────────────────────────

export type TaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "failed"
  | "canceled";

export interface A2ATask {
  readonly id: string;
  status: TaskState;
  readonly messages: A2AMessage[];
  readonly artifacts: TaskArtifact[];
  error?: string;
  readonly createdAt: number;
  completedAt?: number;
}

export interface TaskArtifact {
  readonly name: string;
  readonly mimeType: string;
  readonly data: string;
}

// ─── Configuration ──────────────────────────────────────────────

export interface A2AConfig {
  readonly serverPort: number;
  readonly basePath: string;
  readonly selfCard: AgentCard;
}

export const DEFAULT_CONFIG: A2AConfig = {
  serverPort: 41000,
  basePath: "/a2a",
  selfCard: {
    name: "HoC Republic",
    description: "A simulated republic of AI citizens with creative and engineering capabilities",
    url: "http://localhost:41000/a2a",
    capabilities: ["text-generation", "code-generation", "creative-writing", "research"],
    authentication: "none",
    version: "1.0.0",
    provider: "HoC",
  },
};

// ─── Queue Status ───────────────────────────────────────────────

export interface QueueStatus {
  readonly total: number;
  readonly queued: number;
  readonly running: number;
  readonly completed: number;
  readonly failed: number;
}
