/**
 * Republic Platform — Execution LLM Bridge
 *
 * Extracted from real-execution.ts (Phase 2: Split God Modules).
 *
 * Provides a unified `callLLM()` function that routes inference
 * through ALL available providers (local + cloud) with automatic fallback.
 *
 * Provider call chain:
 *   1. Orchestrator tier: Cloud (Gemini/OpenAI/Anthropic) → Local fallback
 *   2. Default tier: Local (Ollama → LM Studio) → Cloud fallback
 */

import type { ModelConfig, ModelDecision } from "./model-council.js";
import { getRateLimiter, parseRetryAfter } from "./api-rate-limiter.js";
import type { CallerType } from "./api-key-guard.js";
import { canCallerAccessKey } from "./api-key-guard.js";

// ─── Configuration ──────────────────────────────────────────────

const envKey = (name: string) => process.env[name] || "";
const OLLAMA_URL = () => process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const LMSTUDIO_URL = () => process.env.LMSTUDIO_URL ?? "http://127.0.0.1:1234";
const INFERENCE_TIMEOUT_MS = 30_000;

// ─── Main LLM Dispatcher ───────────────────────────────────────

/**
 * Real LLM inference — LOCAL-FIRST routing with cloud fallback.
 *
 * Strategy:
 * - Orchestrator-tier cloud tasks: Cloud first → local fallback
 * - Everything else: Local first (Ollama → LM Studio) → cloud fallback
 */
export async function callLLM(params: {
  prompt: string;
  systemPrompt: string;
  decision: ModelDecision;
  callerType?: CallerType;
}): Promise<string> {
  const { prompt, systemPrompt, decision, callerType = "user" } = params;
  const { model, config } = decision;

  const attempts: Array<() => Promise<string>> = [];

  const isOrchestratorCloudTask =
    ["google", "openai", "anthropic"].includes(model.provider) &&
    (decision.requestedTier === "premium" || decision.requestedTier === "standard");

  if (isOrchestratorCloudTask) {
    // ═══ ORCHESTRATOR PATH: Cloud primary → local fallback ═══
    switch (model.provider) {
      case "google":
        if (envKey("GEMINI_API_KEY") && canCallerAccessKey("GEMINI_API_KEY", callerType)) {
          attempts.push(() => callGemini(systemPrompt, prompt, config, model.id));
        }
        break;
      case "openai":
        if (envKey("OPENAI_API_KEY") && canCallerAccessKey("OPENAI_API_KEY", callerType)) {
          attempts.push(() => callOpenAI(systemPrompt, prompt, config, model.id));
        }
        break;
      case "anthropic":
        if (envKey("ANTHROPIC_API_KEY") && canCallerAccessKey("ANTHROPIC_API_KEY", callerType)) {
          attempts.push(() => callAnthropic(systemPrompt, prompt, config, model.id));
        }
        break;
    }

    if (model.provider !== "google" && envKey("GEMINI_API_KEY") && canCallerAccessKey("GEMINI_API_KEY", callerType)) {
      attempts.push(() => callGemini(systemPrompt, prompt, config, "gemini-2.0-flash"));
    }
    if (model.provider !== "openai" && envKey("OPENAI_API_KEY") && canCallerAccessKey("OPENAI_API_KEY", callerType)) {
      attempts.push(() => callOpenAI(systemPrompt, prompt, config, "gpt-4o-mini"));
    }
    if (model.provider !== "anthropic" && envKey("ANTHROPIC_API_KEY") && canCallerAccessKey("ANTHROPIC_API_KEY", callerType)) {
      attempts.push(() => callAnthropic(systemPrompt, prompt, config, "claude-sonnet-4-20250514"));
    }

    attempts.push(() => callOllama(systemPrompt, prompt, config, "llama3.2"));
    attempts.push(() => callLMStudio(systemPrompt, prompt, config));
  } else {
    // ═══ DEFAULT PATH: Local first → cloud fallback ═══
    if (model.provider === "ollama") {
      attempts.push(() => callOllama(systemPrompt, prompt, config, model.id));
    } else if (model.provider === "lmstudio") {
      attempts.push(() => callLMStudio(systemPrompt, prompt, config));
    }

    if (model.provider !== "ollama") {
      attempts.push(() => callOllama(systemPrompt, prompt, config, "llama3.2"));
    }
    if (model.provider !== "lmstudio") {
      attempts.push(() => callLMStudio(systemPrompt, prompt, config));
    }

    if (envKey("GEMINI_API_KEY") && canCallerAccessKey("GEMINI_API_KEY", callerType)) {
      attempts.push(() => callGemini(systemPrompt, prompt, config, "gemini-2.0-flash"));
    }
    if (envKey("OPENAI_API_KEY") && canCallerAccessKey("OPENAI_API_KEY", callerType)) {
      attempts.push(() => callOpenAI(systemPrompt, prompt, config, "gpt-4o-mini"));
    }
    if (envKey("ANTHROPIC_API_KEY") && canCallerAccessKey("ANTHROPIC_API_KEY", callerType)) {
      attempts.push(() => callAnthropic(systemPrompt, prompt, config, "claude-sonnet-4-20250514"));
    }
  }

  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    `All LLM providers failed for ${model.id}. Last error: ${lastError?.message ?? "unknown"}`,
  );
}

// ─── Provider Implementations ───────────────────────────────────

async function callGemini(
  systemPrompt: string,
  prompt: string,
  config: ModelConfig,
  modelId: string,
): Promise<string> {
  const limiter = getRateLimiter();
  return limiter.withLimit("gemini", async () => {
    const geminiModel = modelId.startsWith("gemini-") ? modelId : "gemini-2.0-flash";
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${envKey("GEMINI_API_KEY")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: config.temperature,
            maxOutputTokens: config.maxTokens,
            ...(config.requestJson ? { responseMimeType: "application/json" } : {}),
          },
        }),
        signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
      },
    );
    if (resp.status === 429) {
      limiter.reportRateLimit("gemini", parseRetryAfter(resp));
      throw new Error(`Gemini 429 rate limited`);
    }
    if (!resp.ok) {
      throw new Error(`Gemini ${resp.status}: ${await resp.text().catch(() => "")}`);
    }
    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("Empty Gemini response");
    }
    return stripCodeFences(text);
  });
}

async function callOpenAI(
  systemPrompt: string,
  prompt: string,
  config: ModelConfig,
  modelId: string,
): Promise<string> {
  const limiter = getRateLimiter();
  return limiter.withLimit("openai", async () => {
    const openaiModel = modelId.startsWith("gpt-") ? modelId : "gpt-4o-mini";
    const body: Record<string, unknown> = {
      model: openaiModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    };
    if (config.requestJson) {
      body.response_format = { type: "json_object" };
    }

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${envKey("OPENAI_API_KEY")}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
    });
    if (resp.status === 429) {
      limiter.reportRateLimit("openai", parseRetryAfter(resp));
      throw new Error(`OpenAI 429 rate limited`);
    }
    if (!resp.ok) {
      throw new Error(`OpenAI ${resp.status}: ${await resp.text().catch(() => "")}`);
    }
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("Empty OpenAI response");
    }
    return stripCodeFences(text);
  });
}

async function callAnthropic(
  systemPrompt: string,
  prompt: string,
  config: ModelConfig,
  modelId: string,
): Promise<string> {
  const limiter = getRateLimiter();
  return limiter.withLimit("anthropic", async () => {
    const anthropicModel = modelId.startsWith("claude-") ? modelId : "claude-sonnet-4-20250514";
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": envKey("ANTHROPIC_API_KEY"),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: anthropicModel,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
        max_tokens: config.maxTokens,
        temperature: config.temperature,
      }),
      signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
    });
    if (resp.status === 429) {
      limiter.reportRateLimit("anthropic", parseRetryAfter(resp));
      throw new Error(`Anthropic 429 rate limited`);
    }
    if (!resp.ok) {
      throw new Error(`Anthropic ${resp.status}: ${await resp.text().catch(() => "")}`);
    }
    const data = (await resp.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = data.content?.find((c) => c.type === "text")?.text;
    if (!text) {
      throw new Error("Empty Anthropic response");
    }
    return stripCodeFences(text);
  });
}

async function callOllama(
  systemPrompt: string,
  prompt: string,
  config: ModelConfig,
  modelId: string,
): Promise<string> {
  const limiter = getRateLimiter();
  return limiter.withLimit("ollama", async () => {
    const resp = await fetch(`${OLLAMA_URL()}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        system: systemPrompt,
        prompt,
        stream: false,
        ...(config.requestJson ? { format: "json" } : {}),
        options: {
          temperature: config.temperature,
          num_predict: config.maxTokens,
        },
      }),
      signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
    });
    if (resp.status === 429) {
      limiter.reportRateLimit("ollama", parseRetryAfter(resp));
      throw new Error(`Ollama 429 rate limited`);
    }
    if (!resp.ok) {
      throw new Error(`Ollama ${resp.status}`);
    }
    const data = (await resp.json()) as { response: string };
    if (!data.response) {
      throw new Error("Empty Ollama response");
    }
    return stripCodeFences(data.response);
  });
}

async function callLMStudio(
  systemPrompt: string,
  prompt: string,
  config: ModelConfig,
): Promise<string> {
  const limiter = getRateLimiter();
  return limiter.withLimit("lmstudio", async () => {
    const { getLocalInstances } = await import("./local-compute.js");
    const lmsInstance = getLocalInstances().find(
      (i) => i.type === "lmstudio" && i.status === "online" && i.models.length > 0,
    );
    const modelId = lmsInstance?.models?.[0] ?? "default";

    const body: Record<string, unknown> = {
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    };
    if (config.requestJson) {
      body.response_format = { type: "json_object" };
    }

    const resp = await fetch(`${LMSTUDIO_URL()}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
    });
    if (resp.status === 429) {
      limiter.reportRateLimit("lmstudio", parseRetryAfter(resp));
      throw new Error(`LM Studio 429 rate limited`);
    }
    if (!resp.ok) {
      throw new Error(`LM Studio ${resp.status} (model: ${modelId})`);
    }
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("Empty LM Studio response");
    }
    return stripCodeFences(text);
  });
}

/** Strip markdown code fences from LLM output (```lang ... ```) */
export function stripCodeFences(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:\w+)?\s*\n?/, "").replace(/\n?\s*```\s*$/, "");
  }
  return cleaned;
}
