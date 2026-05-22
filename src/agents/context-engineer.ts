/**
 * Context Engineer — 2026 Best Practices Module
 *
 * Implements state-of-the-art context engineering for the three 2026 frontier families:
 *   • GPT-5.2 / GPT-5.4 / o3 (OpenAI)   — reasoning_effort: low/medium/high
 *   • Gemini 3.x (Google)                 — ThinkingConfig levels: minimal/low/medium/high
 *   • Claude 4.6 (Anthropic)              — adaptive thinking + effort: low/medium/high/max
 *
 * Key principles (2026):
 *   - Context engineering > prompt engineering (dynamic assembly, salience ordering)
 *   - Frontier models (Claude 4.6, Gemini 3, GPT-5.2) self-reason — no CoT hints
 *   - Mid models (GPT-4o, Claude 3.5, Gemini Flash 2.0) benefit from brief CoT
 *   - Light local models (Phi-4, Gemma-3) need explicit step-by-step CoT
 *   - Keep system prompt ≤ 30% of context window
 *   - Pre-fetch sovereign memory to avoid round-trip tool calls
 *   - Proactive compaction at 60% to prevent "lost in the middle" degradation
 *
 * References:
 *   - Anthropic Claude 4.6: https://anthropic.com (Feb 2026)
 *   - GPT-5.2 API: https://openai.com (Dec 2025)
 *   - Gemini 3.x ThinkingConfig: https://google.dev (2026)
 */

import {
  findModelCapabilities,
  isFrontierModel,
  isLargeContextModel,
  resolveContextWindowTokens,
  type ModelCapabilities,
  type ThinkingApiType,
} from "./model-registry.js";

// Re-export for consumers that only import from context-engineer
export type { ModelCapabilities, ThinkingApiType };
export { findModelCapabilities, isFrontierModel, isLargeContextModel, resolveContextWindowTokens };

// ── Token estimation ───────────────────────────────────────────────────────────

/** Approximate token count: 1 token ≈ 4 chars (fast heuristic) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Model Tier (simplified, backward-compat) ──────────────────────────────────

/** Simplified tier classification for CoT injection decisions */
export type ModelTier = "frontier" | "mid" | "light" | "unknown";

/**
 * Detect model tier from provider + model ID.
 * Uses the registry first; falls back to heuristic matching.
 */
export function detectModelTier(provider: string, modelId: string): ModelTier {
  const capabilities = findModelCapabilities(modelId);
  if (capabilities) {
    return capabilities.tier;
  }

  // Heuristic fallback for unlisted models
  const m = modelId.trim().toLowerCase();

  // 2026 frontier families
  if (
    m.includes("gpt-5") ||
    m.includes("gpt-4.5") ||
    m.startsWith("o3") ||
    m.startsWith("o1") ||
    m.includes("claude-4") ||
    m.includes("claude-opus-4") ||
    m.includes("claude-sonnet-4") ||
    m.includes("claude-3-7") ||
    m.includes("gemini-3") ||
    m.includes("gemini-2.5")
  ) {
    return "frontier";
  }

  // Mid-tier
  if (
    m.includes("gpt-4o") ||
    m.includes("claude-3-5") ||
    m.includes("claude-3-sonnet") ||
    m.includes("gemini-2.0-flash") ||
    m.includes("gemini-1.5-pro") ||
    m.includes("gemini-flash") ||
    m.includes("llama-3") ||
    m.includes("mistral-large") ||
    m.includes("qwen2.5")
  ) {
    return "mid";
  }

  // Light: smaller local models
  if (
    m.includes("phi-4") ||
    m.includes("gemma-3") ||
    m.includes("mistral-7b") ||
    m.includes("llama-3.2-1b") ||
    m.includes("llama-3.2-3b") ||
    m.includes("smollm") ||
    m.includes("tinyllama")
  ) {
    return "light";
  }

  return "unknown";
}

// ── CoT Injection ─────────────────────────────────────────────────────────────

/**
 * Build a chain-of-thought injection string appropriate for the model tier.
 *
 * 2026 rule:
 *   - frontier: "" — Claude 4.6 adaptive thinking, Gemini 3 thinkingConfig, and GPT-5.2
 *     reasoning_effort all handle reasoning natively. Adding CoT hints degrades quality.
 *   - mid: brief nudge
 *   - light: explicit 4-step think-aloud
 */
export function buildCoTHint(
  tier: ModelTier,
  taskComplexity: "simple" | "complex" = "complex",
): string {
  if (tier === "frontier" || taskComplexity === "simple") {
    return ""; // Frontier models: self-reason via their native thinking APIs
  }
  if (tier === "mid") {
    return "Before answering, briefly consider the key factors and potential failure modes. Then give your best response.";
  }
  return (
    "Think through this step by step:\n" +
    "1. What is being asked?\n" +
    "2. What do I know that's relevant?\n" +
    "3. What could go wrong?\n" +
    "4. What is the best response?\n" +
    "Answer only after completing these steps internally."
  );
}

// ── Per-Provider Thinking Configs ─────────────────────────────────────────────

export type ThinkLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type AnthropicEffort = "low" | "medium" | "high" | "max";
export type GeminiThinkingMode = "minimal" | "low" | "medium" | "high";
export type OpenAIReasoningEffort = "low" | "medium" | "high";

// ── Anthropic ─────────────────────────────────────────────────────────────────

export interface AnthropicThinkingConfig {
  /**
   * "adaptive" — Claude 4.6+: model decides when/how much to think.
   *   Automatically includes interleaved thinking between tool calls.
   * "enabled"  — Claude 3.x legacy: explicit budget_tokens.
   *   budget_tokens deprecated for Claude 4.6.
   * "disabled" — Thinking is off.
   */
  type: "adaptive" | "enabled" | "disabled";
  /** For "adaptive": soft guidance effort level */
  effort?: AnthropicEffort;
  /** For "enabled" (legacy Claude 3.x): explicit token budget */
  budgetTokens?: number;
  /**
   * Whether interleaved thinking (reasoning between tool calls) is active.
   * For "adaptive" + effort medium/high/max: always true.
   * For "enabled": requires the separate beta header.
   */
  interleavedThinking: boolean;
  /** Beta header to include (null if not needed) */
  betaHeader: string | null;
}

/**
 * Build Anthropic thinking config for a given model and ThinkLevel.
 *
 * Claude 4.6 (opus-4-6, sonnet-4-6, haiku-4-6):
 *   → `{ type: "adaptive" }` + `effort` param
 *   → budget_tokens is DEPRECATED and must NOT be used
 *   → interleaved thinking is automatic for effort medium+
 *
 * Claude 3.7 (claude-3-7-sonnet-*):
 *   → `{ type: "enabled", budget_tokens: N }` (legacy path)
 *   → interleaved thinking requires beta header "interleaved-thinking-2025-05-14"
 *
 * Claude 3.5 and below:
 *   → No thinking API; always returns disabled
 */
export function buildAnthropicThinkingConfig(
  thinkLevel: ThinkLevel,
  modelId: string,
): AnthropicThinkingConfig {
  if (thinkLevel === "off") {
    return { type: "disabled", interleavedThinking: false, betaHeader: null };
  }

  const capabilities = findModelCapabilities(modelId);
  const thinkingApiType: ThinkingApiType = capabilities?.thinkingApi ?? "none";

  // Claude 4.6+ — Use new adaptive thinking API
  if (thinkingApiType === "adaptive") {
    const maxEffort = capabilities?.maxEffort ?? "high";
    const effort = mapThinkLevelToEffort(thinkLevel, maxEffort);
    // Interleaved thinking is automatic for medium+ effort
    const interleavedThinking = effort === "medium" || effort === "high" || effort === "max";

    return {
      type: "adaptive",
      effort,
      interleavedThinking,
      // No beta header needed for adaptive thinking in Claude 4.6
      betaHeader: null,
    };
  }

  // Claude 3.7 — Use legacy enabled + budget_tokens
  if (thinkingApiType === "enabled") {
    const budgetMap: Record<ThinkLevel, number> = {
      off: 0,
      minimal: 2_048,
      low: 5_000,
      medium: 12_000,
      high: 32_000,
      xhigh: 64_000,
    };
    const budgetTokens = budgetMap[thinkLevel] ?? 8_000;
    const interleavedThinking = ["medium", "high", "xhigh"].includes(thinkLevel);

    return {
      type: "enabled",
      budgetTokens,
      interleavedThinking,
      betaHeader: interleavedThinking ? "interleaved-thinking-2025-05-14" : null,
    };
  }

  // Claude 3.5 and below — no thinking API
  return { type: "disabled", interleavedThinking: false, betaHeader: null };
}

/** Map our ThinkLevel to an Anthropic effort level, respecting model max */
function mapThinkLevelToEffort(
  thinkLevel: ThinkLevel,
  maxEffort: AnthropicEffort,
): AnthropicEffort {
  const levelOrder: AnthropicEffort[] = ["low", "medium", "high", "max"];
  const maxIdx = levelOrder.indexOf(maxEffort);

  const effortMap: Record<ThinkLevel, AnthropicEffort> = {
    off: "low",
    minimal: "low",
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "max",
  };

  const desired = effortMap[thinkLevel] ?? "medium";
  const desiredIdx = levelOrder.indexOf(desired);

  // Cap at model's max effort
  const idx = Math.min(desiredIdx, maxIdx);
  return levelOrder[idx] ?? "medium";
}

// ── Google Gemini ─────────────────────────────────────────────────────────────

export interface GeminiThinkingConfig {
  /**
   * Whether to include thinking configuration.
   * Set to false when model doesn't support it (Deep Think, older models).
   */
  enabled: boolean;
  /** The thinking mode to pass in generationConfig.thinkingConfig */
  thinkingMode?: GeminiThinkingMode;
}

/**
 * Build Gemini ThinkingConfig for a given model and ThinkLevel.
 *
 * Gemini 3 Pro: supports "low" and "high" only
 * Gemini 3 Flash / 3.1 / 3.2: supports "minimal" | "low" | "medium" | "high"
 * Gemini 3 Deep Think: always-on, no user control → returns disabled (caller handles)
 *
 * Usage in API call:
 *   generationConfig: {
 *     thinkingConfig: { thinkingMode: "medium" }
 *   }
 */
export function buildGeminiThinkingConfig(
  thinkLevel: ThinkLevel,
  modelId: string,
): GeminiThinkingConfig {
  if (thinkLevel === "off") {
    return { enabled: false };
  }

  const capabilities = findModelCapabilities(modelId);

  // Deep Think and models without thinkingConfig control
  if (!capabilities || capabilities.thinkingApi !== "thinkingConfig") {
    return { enabled: false };
  }

  const supportedLevels = capabilities.supportedThinkingLevels ?? ["low", "high"];

  // Map ThinkLevel → Gemini thinkingMode
  const levelMap: Record<ThinkLevel, GeminiThinkingMode> = {
    off: "minimal",
    minimal: "minimal",
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "high", // Gemini max is "high"
  };

  let desiredMode = levelMap[thinkLevel] ?? "medium";

  // Clamp to supported levels if needed
  // e.g., gemini-3-pro only supports "low" and "high"
  if (!supportedLevels.includes(desiredMode)) {
    // Find nearest supported level
    const allLevels: GeminiThinkingMode[] = ["minimal", "low", "medium", "high"];
    const desiredIdx = allLevels.indexOf(desiredMode);
    // Pick the highest supported level that's ≤ desired
    let bestMode = supportedLevels[0] ?? "low";
    for (const level of supportedLevels) {
      if (allLevels.indexOf(level) <= desiredIdx) {
        bestMode = level;
      }
    }
    desiredMode = bestMode;
  }

  return { enabled: true, thinkingMode: desiredMode };
}

// ── OpenAI ────────────────────────────────────────────────────────────────────

export interface OpenAIReasoningConfig {
  /**
   * Whether to include reasoning_effort in the API call.
   * False for non-reasoning GPT models (gpt-4o, etc.).
   */
  enabled: boolean;
  /** The reasoning_effort level to pass */
  reasoningEffort?: OpenAIReasoningEffort;
}

/**
 * Build OpenAI reasoning config for a given model and ThinkLevel.
 *
 * GPT-5.2 / GPT-5.4 / o3 / o3-mini:
 *   → `reasoning_effort: "low" | "medium" | "high"`
 *
 * GPT-4o and older:
 *   → No reasoning_effort API; returns disabled
 *
 * Usage in API call:
 *   reasoning_effort: "high"
 */
export function buildOpenAIReasoningConfig(
  thinkLevel: ThinkLevel,
  modelId: string,
): OpenAIReasoningConfig {
  if (thinkLevel === "off") {
    return { enabled: false };
  }

  const capabilities = findModelCapabilities(modelId);

  // Only GPT-5.x and o-series support reasoning_effort
  if (!capabilities || capabilities.thinkingApi !== "reasoning_effort") {
    // Heuristic fallback for unlisted models
    const m = modelId.toLowerCase();
    const supportsReasoning =
      m.includes("gpt-5") || m.startsWith("o3") || m.startsWith("o1") || m.includes("-thinking");

    if (!supportsReasoning) {
      return { enabled: false };
    }
  } else {
    return { enabled: false };
  }

  const effortMap: Record<ThinkLevel, OpenAIReasoningEffort> = {
    off: "low",
    minimal: "low",
    low: "low",
    medium: "medium",
    high: "high",
    xhigh: "high", // OpenAI max is "high"
  };

  return {
    enabled: true,
    reasoningEffort: effortMap[thinkLevel] ?? "medium",
  };
}

// ── Universal Thinking Config Builder ─────────────────────────────────────────

export interface UniversalThinkingConfig {
  provider: string;
  modelId: string;
  thinkLevel: ThinkLevel;
  anthropic?: AnthropicThinkingConfig;
  gemini?: GeminiThinkingConfig;
  openai?: OpenAIReasoningConfig;
}

/**
 * Build the correct thinking config for any provider/model combination.
 * This is the primary entry point for the agent runner.
 */
export function buildUniversalThinkingConfig(
  provider: string,
  modelId: string,
  thinkLevel: ThinkLevel,
): UniversalThinkingConfig {
  const p = provider.trim().toLowerCase();

  const result: UniversalThinkingConfig = { provider, modelId, thinkLevel };

  if (p === "anthropic") {
    result.anthropic = buildAnthropicThinkingConfig(thinkLevel, modelId);
  } else if (p === "google" || p === "gemini") {
    result.gemini = buildGeminiThinkingConfig(thinkLevel, modelId);
  } else if (p === "openai") {
    result.openai = buildOpenAIReasoningConfig(thinkLevel, modelId);
  }

  return result;
}

// ── Context Assembly ───────────────────────────────────────────────────────────

export interface ContextSection {
  name: string;
  content: string;
  /** Salience 0–1: higher = survives pruning */
  salience: number;
  /** Never pruned regardless of budget */
  protected: boolean;
}

export interface ContextEngineeringResult {
  systemPrompt: string;
  estimatedTokens: number;
  windowFraction: number;
  droppedSections: string[];
  tier: ModelTier;
  contextWindowTokens: number;
  isLargeContext: boolean;
}

/**
 * Assemble a context-engineered system prompt within a token budget.
 * Keeps system prompt ≤ targetWindowFraction of available context window.
 */
export function assembleContextEngineeredPrompt(params: {
  sections: ContextSection[];
  contextWindowTokens: number;
  targetWindowFraction?: number;
  provider: string;
  modelId: string;
}): ContextEngineeringResult {
  const { sections, contextWindowTokens, targetWindowFraction = 0.3, provider, modelId } = params;

  const tier = detectModelTier(provider, modelId);
  const budgetTokens = Math.floor(contextWindowTokens * targetWindowFraction);

  const protectedSections = sections.filter((s) => s.protected);
  const optionalSections = sections
    .filter((s) => !s.protected)
    .toSorted((a, b) => b.salience - a.salience);

  const included: ContextSection[] = [...protectedSections];
  const dropped: string[] = [];

  let usedTokens = protectedSections.reduce((sum, s) => sum + estimateTokens(s.content), 0);

  for (const section of optionalSections) {
    const sectionTokens = estimateTokens(section.content);
    if (usedTokens + sectionTokens <= budgetTokens) {
      included.push(section);
      usedTokens += sectionTokens;
    } else {
      dropped.push(section.name);
    }
  }

  const includedNames = new Set(included.map((s) => s.name));
  const ordered = sections.filter((s) => includedNames.has(s.name));
  const systemPrompt = ordered.map((s) => s.content).join("\n\n");

  return {
    systemPrompt,
    estimatedTokens: usedTokens,
    windowFraction: usedTokens / contextWindowTokens,
    droppedSections: dropped,
    tier,
    contextWindowTokens,
    isLargeContext: contextWindowTokens >= 500_000,
  };
}

// ── Proactive Compaction ───────────────────────────────────────────────────────

/**
 * Returns true when context fills ≥ 60% of the window.
 * Fires BEFORE overflow to prevent "lost in the middle" degradation.
 */
export function shouldProactivelyCompact(params: {
  historyTokens: number;
  systemPromptTokens: number;
  contextWindowTokens: number;
  thresholdFraction?: number;
}): boolean {
  const {
    historyTokens,
    systemPromptTokens,
    contextWindowTokens,
    thresholdFraction = 0.6,
  } = params;
  if (contextWindowTokens <= 0) {
    return false;
  }
  return (historyTokens + systemPromptTokens) / contextWindowTokens >= thresholdFraction;
}

// ── Memory Auto-Extraction ─────────────────────────────────────────────────────

/**
 * Heuristically extract memorable facts from an assistant reply.
 * Used for the memory self-reinforcement loop.
 */
export function extractMemorableFacts(reply: string): string[] {
  if (!reply || reply.length < 20) {
    return [];
  }

  const lines = reply
    .split(/[.\n!?]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 30 && l.length < 300);

  const memorySignals = [
    /\bI (will|plan to|decided|recommend|suggest|prefer|always|never)\b/i,
    /\b(important|critical|key|remember|note that|keep in mind)\b/i,
    /\b(user|you) (want|prefer|like|need|hate|love|always|never)\b/i,
    /\b(the answer is|the solution is|this works because|this means)\b/i,
    /\b(completed|finished|done with|successfully|failed to)\b/i,
    /\b(config|setting|configured|enabled|disabled)\b/i,
  ];

  return lines.filter((line) => memorySignals.some((re) => re.test(line))).slice(0, 5);
}
