/**
 * Chat Feature — Types
 *
 * All TypeScript interfaces and types used across the chat feature.
 * Co-located with the feature to eliminate cross-module coupling.
 */

export interface Session {
  key: string;
  kind?: string;
  displayName?: string;
  derivedTitle?: string;
  lastMessagePreview?: string;
  channel?: string;
  label?: string;
  chatType?: string;
  updatedAt?: number | null;
  totalTokens?: number;
  model?: string;
  modelProvider?: string;
  sessionId?: string;
}

export interface SessionsListResult {
  sessions: Session[];
  count: number;
}

export interface AgentsListResult {
  agents: { id: string; name?: string }[];
  mainKey?: string;
  defaultId?: string;
  scope?: string;
}

export interface Citizen {
  id: string;
  name: string;
  specialization: string;
  activity?: string;
  mood?: string;
  generation?: number;
}

export interface CitizensListResult {
  ok: boolean;
  citizens: Citizen[];
  total: number;
}

export interface MemoryRecallResult {
  text: string;
  memoriesUsed: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  ts: number;
  streaming?: boolean;
  error?: boolean;
  tokens?: number;
}

export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  base64: string;
  preview?: string; // data URL for image preview
}

export interface SessionFile {
  name: string;
  path: string;
  size?: string;
  timestamp?: number;
  downloadUrl?: string;
}

export interface ContentBlock {
  type?: string;
  text?: string;
}

export interface TranscriptMsg {
  role?: string;
  content?: ContentBlock[] | string;
  timestamp?: number;
}

export type RightTab = "context" | "files" | "preview" | "memory";

export interface ContextLogEntry {
  id: string;
  text: string;
  ts: number;
  type: "status" | "tool" | "text" | "info";
}

/** Structured tool-call event from the gateway for Manus-style step tracking */
export interface ToolEvent {
  toolName: string;
  status: "start" | "done" | "error";
  description: string;
  stepIndex: number;
  totalSteps: number;
  durationMs?: number;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  modelId: string;
  icon: string;
  /** Context window / max tokens (e.g., "1M", "128K") — shown as badge in dropdown */
  maxTokens?: string;
}
