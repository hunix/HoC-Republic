/**
 * Agent Providers — Barrel Index
 *
 * Re-exports all provider adapters, shared types, and configuration
 * for clean single-import usage from the main agent loop.
 */

// ─── Types ──────────────────────────────────────────────────────
export type {
  AgentProvider,
  OpenAiCompatConfig,
  AgentBroadcaster,
  ToolEvent,
  LoopIteration,
  AgentLoopResult,
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicResponse,
  OpenAiMessage,
  GeminiPart,
  GeminiContent,
} from "./types.js";

// ─── Config / Selection ─────────────────────────────────────────
export {
  key,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_CLAUDE_MODEL,
  getOpenAiCompatConfig,
  selectAgentProvider,
  nextAgentProvider,
  providerModelId,
  providerLabel,
  PROVIDER_MAP,
  parseProviderModel,
} from "./config.js";

// ─── Provider Loops ─────────────────────────────────────────────
export { runAnthropicLoop, appendAnthropicTurn } from "./anthropic.js";
export { runOpenAiLoop, appendOpenAiTurn, buildOpenAiTools } from "./openai.js";
export { runGeminiLoop, appendGeminiTurn, buildGeminiTools } from "./gemini.js";
