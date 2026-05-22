/**
 * Model Registry — Authoritative 2026 Frontier Model Capabilities
 *
 * Single source of truth for all model IDs, context windows, thinking APIs,
 * and feature flags for the GPT-5.2, Gemini 3.x, and Claude 4.6 families.
 *
 * Updated: March 2026
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModelProvider = "openai" | "anthropic" | "google" | "openrouter" | "local";

/**
 * The type of per-provider thinking / reasoning API to use for this model.
 *
 * - `"reasoning_effort"` — OpenAI GPT-5.x and o-series: add `reasoning_effort` to API call
 * - `"adaptive"`         — Anthropic Claude 4.6+: `thinking: { type: "adaptive" }` + `effort`
 * - `"enabled"`          — Anthropic Claude 3.x legacy: `thinking: { type: "enabled", budget_tokens: N }` (deprecated for 4.6)
 * - `"thinkingConfig"`   — Google Gemini 3.x: `generationConfig.thinkingConfig.thinkingMode`
 * - `"none"`             — Model does not expose a thinking control API
 */
export type ThinkingApiType =
  | "reasoning_effort"
  | "adaptive"
  | "enabled"
  | "thinkingConfig"
  | "none";

export interface ModelCapabilities {
  /** Canonical model ID as used in the API */
  modelId: string;
  /** Human-readable display name */
  displayName: string;
  provider: ModelProvider;
  /** Input context window in tokens */
  contextWindowTokens: number;
  /** Maximum output tokens per call */
  maxOutputTokens: number;
  /**
   * Which thinking API this model uses.
   * Determines how ThinkLevel is mapped to actual API params.
   */
  thinkingApi: ThinkingApiType;
  /**
   * For `adaptive` (Claude 4.6): max effort level this variant supports.
   * "max" is only available on Opus variants.
   */
  maxEffort?: "low" | "medium" | "high" | "max";
  /**
   * For `thinkingConfig` (Gemini 3.x): which levels this model supports.
   * Gemini 3 Pro: ["low", "high"]; Gemini 3 Flash: ["minimal", "low", "medium", "high"]
   */
  supportedThinkingLevels?: Array<"minimal" | "low" | "medium" | "high">;
  /** Whether this model has automatic prompt caching (inputs already cached transparently) */
  hasAutomaticCaching: boolean;
  /** Whether the model can use Google Search grounding */
  supportsGrounding: boolean;
  /** Whether the model supports code execution tool */
  supportsCodeExecution: boolean;
  /** Whether the model supports computer use */
  supportsComputerUse: boolean;
  /** Whether the model supports native image input */
  supportsVision: boolean;
  /** Whether the model supports native audio input */
  supportsAudio: boolean;
  /** Model capability tier — drives CoT injection strategy */
  tier: "frontier" | "mid" | "light";
  /**
   * If true, the model is a dedicated thinking/reasoning variant
   * with always-on extended reasoning (e.g., gpt-5.2-thinking, gemini-3-deep-think).
   */
  isThinkingVariant: boolean;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const REGISTRY: ModelCapabilities[] = [
  // ── OpenAI GPT-5.2 Family ─────────────────────────────────────────────────
  {
    modelId: "gpt-5.2",
    displayName: "GPT-5.2",
    provider: "openai",
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    thinkingApi: "reasoning_effort",
    hasAutomaticCaching: true,
    supportsGrounding: false,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: true,
    tier: "frontier",
    isThinkingVariant: false,
  },
  {
    modelId: "gpt-5.2-instant",
    displayName: "GPT-5.2 Instant",
    provider: "openai",
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    thinkingApi: "reasoning_effort",
    hasAutomaticCaching: true,
    supportsGrounding: false,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: false,
    tier: "frontier",
    isThinkingVariant: false,
  },
  {
    modelId: "gpt-5.2-thinking",
    displayName: "GPT-5.2 Thinking",
    provider: "openai",
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    thinkingApi: "reasoning_effort",
    hasAutomaticCaching: true,
    supportsGrounding: false,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: false,
    tier: "frontier",
    isThinkingVariant: true,
  },
  {
    modelId: "gpt-5.4",
    displayName: "GPT-5.4",
    provider: "openai",
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    thinkingApi: "reasoning_effort",
    hasAutomaticCaching: true,
    supportsGrounding: false,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: true,
    tier: "frontier",
    isThinkingVariant: false,
  },
  {
    modelId: "gpt-5.4-thinking",
    displayName: "GPT-5.4 Thinking",
    provider: "openai",
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    thinkingApi: "reasoning_effort",
    hasAutomaticCaching: true,
    supportsGrounding: false,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: true,
    tier: "frontier",
    isThinkingVariant: true,
  },
  // o-series (reasoning models)
  {
    modelId: "o3",
    displayName: "o3",
    provider: "openai",
    contextWindowTokens: 200_000,
    maxOutputTokens: 100_000,
    thinkingApi: "reasoning_effort",
    hasAutomaticCaching: true,
    supportsGrounding: false,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: false,
    tier: "frontier",
    isThinkingVariant: true,
  },
  {
    modelId: "o3-mini",
    displayName: "o3-mini",
    provider: "openai",
    contextWindowTokens: 200_000,
    maxOutputTokens: 100_000,
    thinkingApi: "reasoning_effort",
    hasAutomaticCaching: true,
    supportsGrounding: false,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsVision: false,
    supportsAudio: false,
    tier: "mid",
    isThinkingVariant: true,
  },
  {
    modelId: "gpt-5.2-codex",
    displayName: "GPT-5.2 Codex",
    provider: "openai",
    contextWindowTokens: 400_000,
    maxOutputTokens: 128_000,
    thinkingApi: "reasoning_effort",
    hasAutomaticCaching: true,
    supportsGrounding: false,
    supportsCodeExecution: true,
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: false,
    tier: "frontier",
    isThinkingVariant: false,
  },

  // ── Anthropic Claude 4.6 Family ───────────────────────────────────────────
  {
    modelId: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    provider: "anthropic",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 32_000,
    thinkingApi: "adaptive",
    maxEffort: "max",
    hasAutomaticCaching: true,
    supportsGrounding: false,
    supportsCodeExecution: false,
    supportsComputerUse: true,
    supportsVision: true,
    supportsAudio: false,
    tier: "frontier",
    isThinkingVariant: false,
  },
  {
    modelId: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    provider: "anthropic",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 16_000,
    thinkingApi: "adaptive",
    maxEffort: "high",
    hasAutomaticCaching: true,
    supportsGrounding: false,
    supportsCodeExecution: false,
    supportsComputerUse: true,
    supportsVision: true,
    supportsAudio: false,
    tier: "frontier",
    isThinkingVariant: false,
  },
  {
    modelId: "claude-haiku-4-6",
    displayName: "Claude Haiku 4.6",
    provider: "anthropic",
    contextWindowTokens: 200_000,
    maxOutputTokens: 8_000,
    thinkingApi: "adaptive",
    maxEffort: "medium",
    hasAutomaticCaching: true,
    supportsGrounding: false,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: false,
    tier: "mid",
    isThinkingVariant: false,
  },
  // Claude 3.x — kept for backward compatibility; uses legacy thinking API
  {
    modelId: "claude-3-7-sonnet-20250219",
    displayName: "Claude 3.7 Sonnet",
    provider: "anthropic",
    contextWindowTokens: 200_000,
    maxOutputTokens: 16_000,
    thinkingApi: "enabled",
    hasAutomaticCaching: false,
    supportsGrounding: false,
    supportsCodeExecution: false,
    supportsComputerUse: true,
    supportsVision: true,
    supportsAudio: false,
    tier: "frontier",
    isThinkingVariant: false,
  },
  {
    modelId: "claude-3-5-sonnet-20241022",
    displayName: "Claude 3.5 Sonnet",
    provider: "anthropic",
    contextWindowTokens: 200_000,
    maxOutputTokens: 8_192,
    thinkingApi: "none",
    hasAutomaticCaching: false,
    supportsGrounding: false,
    supportsCodeExecution: false,
    supportsComputerUse: true,
    supportsVision: true,
    supportsAudio: false,
    tier: "mid",
    isThinkingVariant: false,
  },

  // ── Google Gemini 3.x Family ──────────────────────────────────────────────
  {
    modelId: "gemini-3-pro",
    displayName: "Gemini 3 Pro",
    provider: "google",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 32_768,
    thinkingApi: "thinkingConfig",
    supportedThinkingLevels: ["low", "high"],
    hasAutomaticCaching: true,
    supportsGrounding: true,
    supportsCodeExecution: false, // cannot use with grounding simultaneously
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: true,
    tier: "frontier",
    isThinkingVariant: false,
  },
  {
    modelId: "gemini-3.1-pro",
    displayName: "Gemini 3.1 Pro",
    provider: "google",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 32_768,
    thinkingApi: "thinkingConfig",
    supportedThinkingLevels: ["low", "high"],
    hasAutomaticCaching: true,
    supportsGrounding: true,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: true,
    tier: "frontier",
    isThinkingVariant: false,
  },
  {
    modelId: "gemini-3-flash",
    displayName: "Gemini 3 Flash",
    provider: "google",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 16_384,
    thinkingApi: "thinkingConfig",
    supportedThinkingLevels: ["minimal", "low", "medium", "high"],
    hasAutomaticCaching: true,
    supportsGrounding: true,
    supportsCodeExecution: true,
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: true,
    tier: "frontier",
    isThinkingVariant: false,
  },
  {
    modelId: "gemini-3.1-flash",
    displayName: "Gemini 3.1 Flash",
    provider: "google",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 16_384,
    thinkingApi: "thinkingConfig",
    supportedThinkingLevels: ["minimal", "low", "medium", "high"],
    hasAutomaticCaching: true,
    supportsGrounding: true,
    supportsCodeExecution: true,
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: true,
    tier: "frontier",
    isThinkingVariant: false,
  },
  {
    modelId: "gemini-3.1-flash-lite",
    displayName: "Gemini 3.1 Flash Lite",
    provider: "google",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 8_192,
    thinkingApi: "thinkingConfig",
    supportedThinkingLevels: ["minimal", "low", "medium"],
    hasAutomaticCaching: true,
    supportsGrounding: true,
    supportsCodeExecution: true,
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: false,
    tier: "mid",
    isThinkingVariant: false,
  },
  {
    modelId: "gemini-3.2-flash",
    displayName: "Gemini 3.2 Flash",
    provider: "google",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 16_384,
    thinkingApi: "thinkingConfig",
    supportedThinkingLevels: ["minimal", "low", "medium", "high"],
    hasAutomaticCaching: true,
    supportsGrounding: true,
    supportsCodeExecution: true,
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: true,
    tier: "frontier",
    isThinkingVariant: false,
  },
  {
    modelId: "gemini-3-deep-think",
    displayName: "Gemini 3 Deep Think",
    provider: "google",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 32_768,
    thinkingApi: "none", // Always-on max think; no user control
    hasAutomaticCaching: true,
    supportsGrounding: true,
    supportsCodeExecution: false,
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: false,
    tier: "frontier",
    isThinkingVariant: true,
  },
  // Gemini 2.5 — backward compat
  {
    modelId: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    provider: "google",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 16_384,
    thinkingApi: "thinkingConfig",
    supportedThinkingLevels: ["minimal", "low", "medium", "high"],
    hasAutomaticCaching: true,
    supportsGrounding: true,
    supportsCodeExecution: true,
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: true,
    tier: "frontier",
    isThinkingVariant: false,
  },
  {
    modelId: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    provider: "google",
    contextWindowTokens: 1_000_000,
    maxOutputTokens: 16_384,
    thinkingApi: "thinkingConfig",
    supportedThinkingLevels: ["minimal", "low", "medium", "high"],
    hasAutomaticCaching: true,
    supportsGrounding: true,
    supportsCodeExecution: true,
    supportsComputerUse: false,
    supportsVision: true,
    supportsAudio: true,
    tier: "frontier",
    isThinkingVariant: false,
  },
];

// ── Lookup Helpers ────────────────────────────────────────────────────────────

/** Index for O(1) lookup by model ID */
const REGISTRY_INDEX = new Map<string, ModelCapabilities>(REGISTRY.map((m) => [m.modelId, m]));

/**
 * Look up a model's capabilities by ID.
 * Returns undefined if the model is not in the registry.
 */
export function getModelCapabilities(modelId: string): ModelCapabilities | undefined {
  return REGISTRY_INDEX.get(modelId);
}

/**
 * Fuzzy look up: find the best matching model by partial ID.
 * Useful when model IDs have date suffixes or minor version variations.
 */
export function findModelCapabilities(modelId: string): ModelCapabilities | undefined {
  // Exact match first
  const exact = REGISTRY_INDEX.get(modelId);
  if (exact) {
    return exact;
  }

  // Partial prefix match (longest match wins)
  const lower = modelId.toLowerCase();
  let bestMatch: ModelCapabilities | undefined;
  let bestLen = 0;

  for (const entry of REGISTRY) {
    const entryId = entry.modelId.toLowerCase();
    if (lower.startsWith(entryId) || entryId.startsWith(lower)) {
      const matchLen = Math.min(lower.length, entryId.length);
      if (matchLen > bestLen) {
        bestLen = matchLen;
        bestMatch = entry;
      }
    }
  }

  return bestMatch;
}

/**
 * List all registered models, optionally filtered by provider.
 */
export function listRegisteredModels(provider?: ModelProvider): ModelCapabilities[] {
  if (!provider) {
    return [...REGISTRY];
  }
  return REGISTRY.filter((m) => m.provider === provider);
}

/**
 * Get context window tokens for a model, with a sensible default.
 * For unknown models, returns a safe default of 128,000.
 */
export function resolveContextWindowTokens(modelId: string): number {
  return findModelCapabilities(modelId)?.contextWindowTokens ?? 128_000;
}

/**
 * Get the thinking API type for a model.
 * Used to determine how to map ThinkLevel to API params.
 */
export function resolveThinkingApiType(modelId: string): ThinkingApiType {
  return findModelCapabilities(modelId)?.thinkingApi ?? "none";
}

/**
 * Returns true if this model supports context windows >= 500K tokens,
 * enabling a "large context" prompting strategy.
 */
export function isLargeContextModel(modelId: string): boolean {
  const ctx = resolveContextWindowTokens(modelId);
  return ctx >= 500_000;
}

/**
 * Returns true if this model is a frontier-tier model (self-reasons, no CoT hints needed).
 */
export function isFrontierModel(modelId: string): boolean {
  return findModelCapabilities(modelId)?.tier === "frontier";
}
