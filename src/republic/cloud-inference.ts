/**
 * Republic Platform — Cloud LLM Inference (March 2026)
 *
 * Tier 3 inference via cloud LLM providers:
 * - Google Gemma 4 26B MoE via Ollama (SOVEREIGN — FREE, Apache 2.0, 256K ctx)
 * - Google Gemini 2.5 Flash Lite (cheapest, $0.01/M — citizen decisions)
 * - OpenAI GPT-5.4 nano / GPT-5.4 mini (latest, $0.20-$0.75/M)
 * - Anthropic Claude Haiku 3.5 (fast, cheap)
 * - Groq Llama 3.3 70B (free tier — very fast inference)
 * - NVIDIA NIM Nemotron 3 Super 120B (free tier, 40 RPM, MoE 12B-active)
 * - OpenRouter (100+ models unified API)
 * - DeepSeek V3 chat / reasoner (ultra-budget paid fallback)
 *
 * ────────────────────────────────────────────────────────────────────────
 * Architecture: This file is the thin BARREL — it imports from:
 *   - cloud-inference/providers.ts       — API key checks & availability
 *   - cloud-inference/budget.ts          — citizen cloud budget governor
 *   - cloud-inference/parse.ts           — JSON action response parser
 *   - cloud-inference/adapters.ts        — per-provider REST adapters
 *   - cloud-inference/apr.ts             — Adaptive Prompt Router integration
 *   - cloud-inference/circuit-breaker.ts — per-provider circuit breaker
 *   - cloud-inference/connection-pool.ts — HTTP keep-alive pool + TLS warming
 * ────────────────────────────────────────────────────────────────────────
 */

import type { Citizen, RepublicState } from "./types.js";
import { tier0Decision } from "./citizen-decision-engine.js";
import {
  groqInference,
  nvidiaNimInference,
  deepSeekInference,
  openRouterInference,
  ollamaInference,
  lmStudioInference,
  gemma4Inference,
} from "./cloud-inference/adapters.js";
import {
  canCall as budgetCanCall,
  recordCall as budgetRecord,
  getBudgetStatus,
  isCloudEnabledForCitizens,
} from "./cloud-inference/budget.js";
import {
  withCircuitBreaker,
  isProviderHealthy,
  getCircuitBreakerStatus,
} from "./cloud-inference/circuit-breaker.js";
import {
  isGemma4Available,
  isLmStudioAvailable,
  isOllamaAvailable,
  isGroqAvailable,
  isNvidiaNimAvailable,
  isDeepSeekAvailable,
  isOpenRouterAvailable,
} from "./cloud-inference/providers.js";

// ─── Re-exports for external consumers ──────────────────────────

export {
  isGeminiAvailable,
  isOpenAIAvailable,
  isAnthropicAvailable,
  isGroqAvailable,
  isNvidiaNimAvailable,
  isDeepSeekAvailable,
  isOpenRouterAvailable,
  isLmStudioAvailable,
  isGemma4Available,
  isOllamaAvailable,
  isCloudAvailable,
  getCloudProviderStatus,
} from "./cloud-inference/providers.js";

export { aprCloudInference } from "./cloud-inference/apr.js";
export { parseActionJSON } from "./cloud-inference/parse.js";
export { getCircuitBreakerStatus } from "./cloud-inference/circuit-breaker.js";
export { initConnectionPool, warmConnections } from "./cloud-inference/connection-pool.js";

/** Expose budget status for dashboard/diagnostics */
export function getCitizenCloudBudgetStatus() {
  return getBudgetStatus();
}

// ─── Lazy Module Caches ─────────────────────────────────────────

let _modelFallback: typeof import("./openclaw/model-fallback-chain.js") | null = null;
async function getModelFallback() {
  return (_modelFallback ??= await import("./openclaw/model-fallback-chain.js"));
}

// ─── Main Cloud Inference Orchestrator ──────────────────────────

/**
 * Run cloud inference for a citizen's decision.
 * Fallback chain: FREE providers first → paid providers as fallback.
 *   1. Gemma 4 local (sovereign, free)
 *   2. LM Studio local (free, fastest)
 *   3. Ollama fallback (free)
 *   4. Groq → NVIDIA NIM (free cloud tiers)
 *   5. DeepSeek → OpenRouter (budget paid)
 */
export async function cloudInference(
  citizen: Citizen,
  state: RepublicState,
): Promise<{ tool: string; params: Record<string, unknown> }> {
  // ── Tier-0: deterministic engine (FREE, zero latency) ────────────────
  const t0 = tier0Decision(citizen);
  if (t0) {
    return { tool: t0.tool, params: t0.params };
  }

  // ── Tier-1a: Gemma 4 (SOVEREIGN — highest quality free local) ────────
  if (isGemma4Available() && isProviderHealthy("gemma4")) {
    try {
      return await withCircuitBreaker("gemma4", () => gemma4Inference(citizen, state));
    } catch {
      // Gemma 4 not loaded or Ollama down — fall through
    }
  }

  // ── Tier-1b: LM Studio (local GPU — fastest, completely free) ───────
  if (isLmStudioAvailable() && isProviderHealthy("lmstudio")) {
    try {
      return await withCircuitBreaker("lmstudio", () => lmStudioInference(citizen, state));
    } catch {
      // LM Studio not running — continue
    }
  }

  // ── Tier-1c: Ollama fallback ──
  if (!isLmStudioAvailable() && !isGemma4Available() && isProviderHealthy("ollama")) {
    try {
      return await withCircuitBreaker("ollama", () => ollamaInference(citizen, state));
    } catch {
      // Ollama not running — continue to cloud
    }
  }

  // ── Citizen cloud inference kill switch ─────────────────────────────
  if (!isCloudEnabledForCitizens()) {
    const fallback = tier0Decision(citizen) ?? { tool: "work", params: { intensity: 0.5 } };
    return { tool: fallback.tool, params: fallback.params };
  }

  // ── Hourly hard cap ───────────────────────────────────────────
  if (!budgetCanCall()) {
    const fallback = tier0Decision(citizen) ?? { tool: "work", params: { intensity: 0.5 } };
    return { tool: fallback.tool, params: fallback.params };
  }
  budgetRecord();

  // ── Free + Paid cloud via structured fallback chain ──────────────
  const { runWithFallback, isFallbackExhaustedError } = await getModelFallback();
  const candidates: Array<{ provider: string; model: string }> = [];

  if (isGroqAvailable()) {
    candidates.push({
      provider: "groq",
      model: process.env["GROQ_MODEL"] || "llama-3.3-70b-versatile",
    });
  }
  if (isNvidiaNimAvailable()) {
    candidates.push({
      provider: "nvidia-nim",
      model: process.env["NVIDIA_MODEL"] || "meta/llama-3.3-70b-instruct",
    });
  }
  if (isDeepSeekAvailable()) {
    candidates.push({
      provider: "deepseek",
      model: process.env["DEEPSEEK_MODEL"] || "deepseek-chat",
    });
  }
  if (isOpenRouterAvailable()) {
    candidates.push({ provider: "openrouter", model: process.env["OPENROUTER_MODEL"] || "auto" });
  }

  if (candidates.length === 0) {
    throw new Error("No cloud or local provider available for citizen inference");
  }

  try {
    const fallbackResult = await runWithFallback({
      candidates,
      run: async (provider: string) => {
        return withCircuitBreaker(provider, () => {
          switch (provider) {
            case "groq":
              return groqInference(citizen, state);
            case "nvidia-nim":
              return nvidiaNimInference(citizen, state);
            case "deepseek":
              return deepSeekInference(citizen, state);
            case "openrouter":
              return openRouterInference(citizen, state);
            default:
              throw new Error(`Unknown provider: ${provider}`);
          }
        });
      },
    });
    return fallbackResult.result;
  } catch (err: unknown) {
    if (isFallbackExhaustedError(err)) {
      const lastResort = tier0Decision(citizen) ?? { tool: "work", params: { intensity: 0.5 } };
      return { tool: lastResort.tool, params: lastResort.params };
    }
    throw err;
  }
}
