/**
 * Extra Params — Provider-Specific Stream Parameter Injection
 *
 * 2026 Upgrade: Adds per-provider thinking / reasoning API injection:
 *   - OpenAI GPT-5.x / o-series: `reasoning_effort` (low / medium / high)
 *   - Google Gemini 3.x:          `generationConfig.thinkingConfig.thinkingMode`
 *   - Anthropic Claude 4.6:       `thinking: { type: "adaptive" }` + `effort` param
 *   - Anthropic Claude 3.7:       `thinking: { type: "enabled", budget_tokens: N }`
 *
 * The thinking params are resolved from the `thinkLevel` key in extraParams,
 * which agent runners set based on session/task configuration.
 */

import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { SimpleStreamOptions } from "@mariozechner/pi-ai";
import { streamSimple } from "@mariozechner/pi-ai";
import type { OpenClawConfig } from "../../config/config.js";
import {
  buildAnthropicThinkingConfig,
  buildGeminiThinkingConfig,
  buildOpenAIReasoningConfig,
  type ThinkLevel,
} from "../context-engineer.js";
import { log } from "./logger.js";

const OPENROUTER_APP_HEADERS: Record<string, string> = {
  "HTTP-Referer": "https://openclaw.ai",
  "X-Title": "OpenClaw",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type CacheRetention = "none" | "short" | "long";

type ExtendedStreamOptions = Partial<SimpleStreamOptions> & {
  cacheRetention?: CacheRetention;
  /** Anthropic: thinking block params */
  thinking?: Record<string, unknown>;
  /** OpenAI: reasoning_effort param */
  reasoningEffort?: string;
  /** Gemini: generationConfig override */
  generationConfig?: Record<string, unknown>;
};

// ── Config Resolvers ──────────────────────────────────────────────────────────

/**
 * Resolve provider-specific extra params from model config.
 * Used to pass through stream params like temperature/maxTokens.
 *
 * @internal Exported for testing only
 */
export function resolveExtraParams(params: {
  cfg: OpenClawConfig | undefined;
  provider: string;
  modelId: string;
}): Record<string, unknown> | undefined {
  const modelKey = `${params.provider}/${params.modelId}`;
  const modelConfig = params.cfg?.agents?.defaults?.models?.[modelKey];
  return modelConfig?.params ? { ...modelConfig.params } : undefined;
}

/**
 * Resolve cacheRetention from extraParams, supporting both new `cacheRetention`
 * and legacy `cacheControlTtl` values for backwards compatibility.
 *
 * Mapping: "5m" → "short", "1h" → "long"
 * Only applies to Anthropic provider.
 */
function resolveCacheRetention(
  extraParams: Record<string, unknown> | undefined,
  provider: string,
): CacheRetention | undefined {
  if (provider !== "anthropic") {
    return undefined;
  }

  const newVal = extraParams?.cacheRetention;
  if (newVal === "none" || newVal === "short" || newVal === "long") {
    return newVal;
  }

  const legacy = extraParams?.cacheControlTtl;
  if (legacy === "5m") {
    return "short";
  }
  if (legacy === "1h") {
    return "long";
  }
  return undefined;
}

/**
 * Resolve the ThinkLevel from extraParams.
 * Users/runners set `thinkLevel` on the extraParams object.
 * Falls back to "off" if not set.
 */
function resolveThinkLevel(extraParams: Record<string, unknown> | undefined): ThinkLevel {
  const val = extraParams?.thinkLevel;
  if (
    val === "off" ||
    val === "minimal" ||
    val === "low" ||
    val === "medium" ||
    val === "high" ||
    val === "xhigh"
  ) {
    return val;
  }
  return "off";
}

// ── Thinking Param Builders ───────────────────────────────────────────────────

/**
 * 2026 Upgrade: Build Anthropic thinking params for the streamFn.
 *
 * Claude 4.6 (opus-4-6, sonnet-4-6, haiku-4-6):
 *   → thinking: { type: "adaptive" }, effort: "low"|"medium"|"high"|"max"
 *   → budget_tokens is DEPRECATED — must NOT be sent
 *   → Interleaved thinking auto-enabled for effort medium+
 *
 * Claude 3.7:
 *   → thinking: { type: "enabled", budget_tokens: N }
 *   → Beta header needed for interleaved thinking
 */
function buildAnthropicStreamParams(
  modelId: string,
  thinkLevel: ThinkLevel,
): Partial<ExtendedStreamOptions> {
  if (thinkLevel === "off") {
    return {};
  }

  const cfg = buildAnthropicThinkingConfig(thinkLevel, modelId);
  if (cfg.type === "disabled") {
    return {};
  }

  const result: Partial<ExtendedStreamOptions> = {};

  if (cfg.type === "adaptive") {
    // Claude 4.6+ — new adaptive API
    result.thinking = { type: "adaptive" };
    // "effort" is a top-level API param, not nested inside thinking
    (result as Record<string, unknown>).effort = cfg.effort;
    log.debug(`[2026] Anthropic adaptive thinking: effort=${cfg.effort} model=${modelId}`);
  } else if (cfg.type === "enabled" && cfg.budgetTokens) {
    // Claude 3.7 legacy — enabled + budget_tokens
    result.thinking = { type: "enabled", budget_tokens: cfg.budgetTokens };
    if (cfg.betaHeader) {
      (result as Record<string, unknown>).betaHeaders = [cfg.betaHeader];
    }
    log.debug(`[2026] Anthropic legacy thinking: budget=${cfg.budgetTokens} model=${modelId}`);
  }

  return result;
}

/**
 * 2026 Upgrade: Build Gemini thinking params for the streamFn.
 *
 * Gemini 3 Pro: low, high only
 * Gemini 3 Flash / 3.1 / 3.2: minimal, low, medium, high
 *
 * Passed as: generationConfig.thinkingConfig.thinkingMode
 */
function buildGeminiStreamParams(
  modelId: string,
  thinkLevel: ThinkLevel,
): Partial<ExtendedStreamOptions> {
  if (thinkLevel === "off") {
    return {};
  }

  const cfg = buildGeminiThinkingConfig(thinkLevel, modelId);
  if (!cfg.enabled || !cfg.thinkingMode) {
    return {};
  }

  log.debug(`[2026] Gemini thinkingConfig.thinkingMode=${cfg.thinkingMode} model=${modelId}`);

  return {
    generationConfig: {
      thinkingConfig: { thinkingMode: cfg.thinkingMode },
    },
  };
}

/**
 * 2026 Upgrade: Build OpenAI reasoning params for the streamFn.
 *
 * GPT-5.x, o3, o3-mini: reasoning_effort: "low" | "medium" | "high"
 */
function buildOpenAIStreamParams(
  modelId: string,
  thinkLevel: ThinkLevel,
): Partial<ExtendedStreamOptions> {
  if (thinkLevel === "off") {
    return {};
  }

  const cfg = buildOpenAIReasoningConfig(thinkLevel, modelId);
  if (!cfg.enabled || !cfg.reasoningEffort) {
    return {};
  }

  log.debug(`[2026] OpenAI reasoning_effort=${cfg.reasoningEffort} model=${modelId}`);

  return {
    reasoningEffort: cfg.reasoningEffort,
  };
}

// ── Core Stream Wrapper ───────────────────────────────────────────────────────

function createStreamFnWithExtraParams(
  baseStreamFn: StreamFn | undefined,
  extraParams: Record<string, unknown> | undefined,
  provider: string,
  modelId: string,
): StreamFn | undefined {
  if (!extraParams || Object.keys(extraParams).length === 0) {
    return undefined;
  }

  const streamParams: ExtendedStreamOptions = {};

  // Standard params
  if (typeof extraParams.temperature === "number") {
    streamParams.temperature = extraParams.temperature;
  }
  if (typeof extraParams.maxTokens === "number") {
    streamParams.maxTokens = extraParams.maxTokens;
  }

  // Cache retention (Anthropic)
  const cacheRetention = resolveCacheRetention(extraParams, provider);
  if (cacheRetention) {
    streamParams.cacheRetention = cacheRetention;
  }

  // 2026: Per-provider thinking params
  const thinkLevel = resolveThinkLevel(extraParams);
  const p = provider.trim().toLowerCase();

  let thinkingParams: Partial<ExtendedStreamOptions> = {};
  if (p === "anthropic") {
    thinkingParams = buildAnthropicStreamParams(modelId, thinkLevel);
  } else if (p === "google" || p === "gemini") {
    thinkingParams = buildGeminiStreamParams(modelId, thinkLevel);
  } else if (p === "openai") {
    thinkingParams = buildOpenAIStreamParams(modelId, thinkLevel);
  }

  // Merge thinking params into stream params
  Object.assign(streamParams, thinkingParams);

  if (Object.keys(streamParams).length === 0) {
    return undefined;
  }

  log.debug(`creating streamFn wrapper with params: ${JSON.stringify(streamParams)}`);

  const underlying = baseStreamFn ?? streamSimple;
  // Cast to Record to pass provider-specific extras (e.g. generationConfig for Gemini,
  // reasoningEffort for OpenAI) that the pi-ai SDK accepts at runtime but doesn't
  // expose in its SimpleStreamOptions TypeScript type.
  const baseStreamParams = streamParams as Record<string, unknown>;
  const wrappedStreamFn: StreamFn = (model, context, options) => {
    const mergedOptions: Record<string, unknown> = {
      ...baseStreamParams,
      ...(options as Record<string, unknown>),
    };
    // Deep-merge generationConfig rather than override
    const baseGC = baseStreamParams.generationConfig as Record<string, unknown> | undefined;
    const optGC = (options as Record<string, unknown>)?.generationConfig as
      | Record<string, unknown>
      | undefined;
    if (baseGC && optGC) {
      mergedOptions.generationConfig = { ...baseGC, ...optGC };
    }
    return underlying(model, context, mergedOptions as Parameters<StreamFn>[2]);
  };

  return wrappedStreamFn;
}

/**
 * Create a streamFn wrapper that adds OpenRouter app attribution headers.
 * These headers allow OpenClaw to appear on OpenRouter's leaderboard.
 */
function createOpenRouterHeadersWrapper(baseStreamFn: StreamFn | undefined): StreamFn {
  const underlying = baseStreamFn ?? streamSimple;
  return (model, context, options) =>
    underlying(model, context, {
      ...options,
      headers: {
        ...OPENROUTER_APP_HEADERS,
        ...options?.headers,
      },
    });
}

/**
 * Apply extra params (like temperature, thinking level) to an agent's streamFn.
 * Also adds OpenRouter app attribution headers when using the OpenRouter provider.
 *
 * 2026: Injects correct thinking API params per provider:
 *   - Anthropic: adaptive thinking (Claude 4.6) or legacy enabled+budget_tokens (3.7)
 *   - Google: thinkingConfig.thinkingMode levels
 *   - OpenAI: reasoning_effort
 *
 * Set `thinkLevel` in extraParamsOverride to control thinking depth.
 *
 * @internal Exported for testing
 */
export function applyExtraParamsToAgent(
  agent: { streamFn?: StreamFn },
  cfg: OpenClawConfig | undefined,
  provider: string,
  modelId: string,
  extraParamsOverride?: Record<string, unknown>,
): void {
  const extraParams = resolveExtraParams({ cfg, provider, modelId });
  const override =
    extraParamsOverride && Object.keys(extraParamsOverride).length > 0
      ? Object.fromEntries(
          Object.entries(extraParamsOverride).filter(([, value]) => value !== undefined),
        )
      : undefined;
  const merged = Object.assign({}, extraParams, override);
  const wrappedStreamFn = createStreamFnWithExtraParams(agent.streamFn, merged, provider, modelId);

  if (wrappedStreamFn) {
    log.debug(`applying extraParams to agent streamFn for ${provider}/${modelId}`);
    agent.streamFn = wrappedStreamFn;
  }

  if (provider === "openrouter") {
    log.debug(`applying OpenRouter app attribution headers for ${provider}/${modelId}`);
    agent.streamFn = createOpenRouterHeadersWrapper(agent.streamFn);
  }
}
