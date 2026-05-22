/**
 * Agent Provider Types — Shared interfaces for all LLM provider adapters.
 *
 * This module defines the common types used across the Anthropic, OpenAI, and
 * Gemini provider loops, plus the AgentProvider union and loop result types.
 */

// ─── Provider Union ─────────────────────────────────────────────

export type AgentProvider =
  | "anthropic"
  | "openai"
  | "gemini"
  | "deepseek"
  | "groq"
  | "nvidia-nim"
  | "openrouter"
  | "lmstudio"
  | "ollama";

// ─── OpenAI-Compatible Provider Config ──────────────────────────

/** Configuration for OpenAI-compatible providers */
export interface OpenAiCompatConfig {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  label: string;
  extraHeaders?: Record<string, string>;
  /** Max completion tokens — smaller for budget models */
  maxTokens?: number;
}

// ─── Anthropic Types ────────────────────────────────────────────

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: AnthropicContentBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";
  usage: { input_tokens: number; output_tokens: number };
}

// ─── OpenAI Types ───────────────────────────────────────────────

export type OpenAiMessage = {
  role: string;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: object[];
};

// ─── Gemini Types ───────────────────────────────────────────────

export type GeminiPart = {
  text?: string;
  thought_signature?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: { content: string } };
};

export type GeminiContent = { role: string; parts: GeminiPart[] };

// ─── Shared Loop Types ──────────────────────────────────────────

/** Broadcast helper for streaming text to the WebSocket session */
export interface AgentBroadcaster {
  /** Send a WS message to the session */
  send: (text: string) => void;
  /** Emit a structured tool-call event (start/done/error) for Manus-style step tracking */
  toolEvent?: (event: ToolEvent) => void;
}

/** Structured tool-call event emitted per tool execution for real-time UI tracking */
export interface ToolEvent {
  toolName: string;
  status: "start" | "done" | "error";
  description: string;
  stepIndex: number;
  totalSteps?: number;
  durationMs?: number;
}

/** Result of a single LLM iteration (one API call) */
export interface LoopIteration {
  textBlocks: string[];
  toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  inputTokens: number;
  outputTokens: number;
  done: boolean;
  /** Raw API response parts (Gemini only). Carries thought_signature on functionCall parts
   *  required when replaying history for thinking-enabled Gemini models. */
  rawModelParts?: unknown[];
}

/** Final result of the full agent loop */
export interface AgentLoopResult {
  success: boolean;
  response: string;
  previewUrl: string | null;
  iterations: number;
  totalTokens: number;
  /** Base64-encoded PNG screenshot of the final preview state */
  snapshotBase64: string | null;
  /** Inferred artifact type: presentation, document, website, video, image, archive */
  artifactType: string;
  /** List of output files with names and sizes */
  artifactFiles: Array<{ name: string; size: string }>;
}
