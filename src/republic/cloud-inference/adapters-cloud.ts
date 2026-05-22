/**
 * Cloud Inference — Cloud Provider Adapters
 *
 * Rate-limited REST adapters for Groq, NVIDIA NIM, DeepSeek, and OpenRouter.
 * Each function connects to one provider's cloud API, builds the request
 * using the appropriate prompt strategy, and parses the JSON action response.
 */

import type { Citizen, RepublicState } from "../types.js";
import { getRateLimiter, parseRetryAfter } from "../api-rate-limiter.js";
import { buildDecisionPrompt, buildSystemPrompt } from "../citizen-prompt.js";
import { parseActionJSON } from "./parse.js";
import { key, TIMEOUT_MS } from "./providers.js";

// ─── Lazy Cache ─────────────────────────────────────────────────

let _inferenceStrategy: typeof import("../inference-strategy.js") | null = null;
async function getInferenceStrategy() {
  return (_inferenceStrategy ??= await import("../inference-strategy.js"));
}

// ─── Groq ───────────────────────────────────────────────────────

/**
 * Groq inference — ultra-fast Llama 70B. Uses buildFlashPrompt with JSON mode.
 * Groq has a 6000 TPM free limit — compact flash prompt keeps us well under it.
 */
export async function groqInference(
  citizen: Citizen,
  state: RepublicState,
): Promise<{ tool: string; params: Record<string, unknown> }> {
  const limiter = getRateLimiter();
  return limiter.withLimit("groq", async () => {
    const { buildPromptForProvider } = await getInferenceStrategy();
    const { system, user, maxTokens } = buildPromptForProvider("groq", citizen);
    void state;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key("GROQ_API_KEY")}`,
      },
      body: JSON.stringify({
        model: key("GROQ_MODEL") || "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status === 429) {
      limiter.reportRateLimit("groq", parseRetryAfter(response));
      throw new Error(`Groq 429 rate limited`);
    }
    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("Empty Groq response");
    }
    return parseActionJSON(text);
  });
}

// ─── NVIDIA NIM ─────────────────────────────────────────────────

/**
 * NVIDIA NIM inference (OpenAI-compat). Uses buildFlashPrompt — same tier as Groq.
 * NIM has 40 RPM shared limit — flash prompt keeps tokens low.
 */
export async function nvidiaNimInference(
  citizen: Citizen,
  state: RepublicState,
): Promise<{ tool: string; params: Record<string, unknown> }> {
  const limiter = getRateLimiter();
  return limiter.withLimit("nvidia-nim", async () => {
    const { buildPromptForProvider } = await getInferenceStrategy();
    const { system, user, maxTokens } = buildPromptForProvider("nim", citizen);
    void state;

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key("NVIDIA_API_KEY")}`,
      },
      body: JSON.stringify({
        model: key("NVIDIA_MODEL") || "meta/llama-3.3-70b-instruct",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status === 429) {
      limiter.reportRateLimit("nvidia-nim", parseRetryAfter(response));
      throw new Error(`NVIDIA NIM 429 rate limited`);
    }
    if (!response.ok) {
      throw new Error(`NVIDIA NIM API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("Empty NVIDIA NIM response");
    }
    return parseActionJSON(text);
  });
}

// ─── DeepSeek ───────────────────────────────────────────────────

/**
 * DeepSeek inference via OpenAI-compatible REST API.
 * Uses deepseek-chat (V3.2) by default — very cost-efficient deep reasoning.
 */
export async function deepSeekInference(
  citizen: Citizen,
  state: RepublicState,
): Promise<{ tool: string; params: Record<string, unknown> }> {
  const limiter = getRateLimiter();
  return limiter.withLimit("deepseek", async () => {
    const systemPrompt = await buildSystemPrompt({ citizen, state, includeTools: true });
    const userPrompt = buildDecisionPrompt(citizen);

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key("DEEPSEEK_API_KEY")}`,
      },
      body: JSON.stringify({
        model: key("DEEPSEEK_MODEL") || "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 256,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status === 429) {
      limiter.reportRateLimit("deepseek", parseRetryAfter(response));
      throw new Error(`DeepSeek 429 rate limited`);
    }
    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("Empty DeepSeek response");
    }
    return parseActionJSON(text);
  });
}

// ─── OpenRouter ─────────────────────────────────────────────────

/**
 * OpenRouter inference via REST API.
 * Unified API gateway for 100+ LLM models. Uses "auto" routing by default.
 */
export async function openRouterInference(
  citizen: Citizen,
  state: RepublicState,
): Promise<{ tool: string; params: Record<string, unknown> }> {
  const limiter = getRateLimiter();
  return limiter.withLimit("openrouter", async () => {
    const systemPrompt = await buildSystemPrompt({ citizen, state, includeTools: true });
    const userPrompt = buildDecisionPrompt(citizen);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key("OPENROUTER_API_KEY")}`,
        "HTTP-Referer": "https://openclaw.dev",
        "X-Title": "OpenClaw Republic",
      },
      body: JSON.stringify({
        model: (key("OPENROUTER_MODEL") || "auto") === "auto" ? undefined : key("OPENROUTER_MODEL"),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 256,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status === 429) {
      limiter.reportRateLimit("openrouter", parseRetryAfter(response));
      throw new Error(`OpenRouter 429 rate limited`);
    }
    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("Empty OpenRouter response");
    }
    return parseActionJSON(text);
  });
}
