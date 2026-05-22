/**
 * Cloud Inference — APR (Adaptive Prompt Router) Integration
 *
 * Routes citizen decision prompts through the Adaptive Prompt Router:
 * - Simple tasks → fast-path single model call (no overhead)
 * - Complex tasks → partitioned across multiple optimized models in parallel
 * - Consolidated response returned as a parsed tool call
 *
 * Falls back to standard cloudInference() if APR fails.
 */

import type { Citizen, RepublicState } from "../types.js";
import {
  routePrompt,
  type ModelCallFn,
  DEFAULT_ROUTER_CONFIG,
} from "../../intelligence/prompt-router.js";
import { buildDecisionPrompt, buildSystemPrompt } from "../citizen-prompt.js";
import { cloudInference } from "../cloud-inference.js";
import { recordAprDecision } from "../inference-gateway.js";
import { parseActionJSON } from "./parse.js";
import {
  key,
  TIMEOUT_MS,
  isGeminiAvailable,
  isOpenAIAvailable,
  isAnthropicAvailable,
  isGroqAvailable,
  isNvidiaNimAvailable,
  isDeepSeekAvailable,
} from "./providers.js";

// ─── ModelCallFn Adapter ────────────────────────────────────────

/**
 * Build a ModelCallFn adapter over cloud REST calls.
 * Routes APR requests to the appropriate provider based on assignment.
 */
function buildModelCallFn(): ModelCallFn {
  return async (params: Parameters<ModelCallFn>[0]): ReturnType<ModelCallFn> => {
    const { provider, modelId, systemPrompt, userPrompt, maxTokens, temperature } = params;
    const p = provider.toLowerCase();
    const limitMs = maxTokens ? Math.min(maxTokens, 2048) : 512;

    // Gemini
    if ((p === "google" || p === "gemini") && isGeminiAvailable()) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${key("GEMINI_MODEL") || "gemini-2.5-flash"}:generateContent?key=${key("GEMINI_API_KEY")}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
            contents: [{ parts: [{ text: userPrompt }] }],
            generationConfig: {
              temperature: temperature ?? 0.7,
              maxOutputTokens: limitMs,
              responseMimeType: "text/plain",
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (!response.ok) {
        throw new Error(`Gemini APR error: ${response.status}`);
      }
      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      return { content: text, tokensUsed: Math.ceil(text.length / 4) };
    }

    // OpenAI
    if (p === "openai" && isOpenAIAvailable()) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key("OPENAI_API_KEY")}`,
        },
        body: JSON.stringify({
          model: modelId.includes("gpt-") ? modelId : key("OPENAI_MODEL") || "gpt-5.4-mini",
          messages: [
            ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: userPrompt },
          ],
          temperature: temperature ?? 0.7,
          max_completion_tokens: limitMs,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`OpenAI APR error: ${response.status}`);
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      return { content: text, tokensUsed: data.usage?.total_tokens ?? Math.ceil(text.length / 4) };
    }

    // Anthropic
    if (p === "anthropic" && isAnthropicAvailable()) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key("ANTHROPIC_API_KEY"),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelId.includes("claude")
            ? modelId
            : key("ANTHROPIC_MODEL") || "claude-haiku-3-5-20241022",
          max_tokens: limitMs,
          ...(systemPrompt ? { system: systemPrompt } : {}),
          messages: [{ role: "user", content: userPrompt }],
          temperature: temperature ?? 0.7,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`Anthropic APR error: ${response.status}`);
      }
      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text = data.content?.find((c) => c.type === "text")?.text ?? "";
      const tokens = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
      return { content: text, tokensUsed: tokens || Math.ceil(text.length / 4) };
    }

    // Groq
    if (p === "groq" && isGroqAvailable()) {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key("GROQ_API_KEY")}`,
        },
        body: JSON.stringify({
          model: key("GROQ_MODEL") || "llama-3.3-70b-versatile",
          messages: [
            ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: userPrompt },
          ],
          temperature: temperature ?? 0.7,
          max_tokens: limitMs,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`Groq APR error: ${response.status}`);
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      return { content: text, tokensUsed: data.usage?.total_tokens ?? Math.ceil(text.length / 4) };
    }

    // NVIDIA NIM
    if ((p === "nvidia" || p === "nvidia-nim") && isNvidiaNimAvailable()) {
      const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key("NVIDIA_API_KEY")}`,
        },
        body: JSON.stringify({
          model:
            modelId.includes("nemotron") || modelId.includes("nvidia/")
              ? modelId
              : key("NVIDIA_MODEL") || "meta/llama-3.3-70b-instruct",
          messages: [
            ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: userPrompt },
          ],
          temperature: temperature ?? 0.7,
          max_tokens: limitMs,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`NVIDIA NIM APR error: ${response.status}`);
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      return { content: text, tokensUsed: data.usage?.total_tokens ?? Math.ceil(text.length / 4) };
    }

    // DeepSeek
    if (p === "deepseek" && isDeepSeekAvailable()) {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key("DEEPSEEK_API_KEY")}`,
        },
        body: JSON.stringify({
          model: modelId.includes("deepseek") ? modelId : "deepseek-chat",
          messages: [
            ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
            { role: "user", content: userPrompt },
          ],
          temperature: temperature ?? 0.7,
          max_tokens: limitMs,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`DeepSeek APR error: ${response.status}`);
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      return { content: text, tokensUsed: data.usage?.total_tokens ?? Math.ceil(text.length / 4) };
    }

    // Fallback: Gemini
    if (isGeminiAvailable()) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${key("GEMINI_MODEL") || "gemini-2.5-flash"}:generateContent?key=${key("GEMINI_API_KEY")}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              { parts: [{ text: `${systemPrompt ? systemPrompt + "\n\n" : ""}${userPrompt}` }] },
            ],
            generationConfig: { temperature: 0.7, maxOutputTokens: limitMs },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      return { content: text, tokensUsed: Math.ceil(text.length / 4) };
    }

    throw new Error(`No provider available for APR assignment: ${provider}/${modelId}`);
  };
}

// ─── APR Cloud Inference ────────────────────────────────────────

/**
 * APR-aware cloud inference for citizen decision-making.
 * Falls back to standard cloudInference() if APR fails.
 */
export async function aprCloudInference(
  citizen: Citizen,
  state: RepublicState,
): Promise<{ tool: string; params: Record<string, unknown> }> {
  const systemPrompt = await buildSystemPrompt({ citizen, state, includeTools: true });
  const userPrompt = buildDecisionPrompt(citizen);
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  try {
    const callModel = buildModelCallFn();
    const result = await routePrompt({
      prompt: fullPrompt,
      callModel,
      config: {
        ...DEFAULT_ROUTER_CONFIG,
        debug: process.env.APR_DEBUG === "1",
        useControllerAgent: false,
        excludeProviders: ["anthropic", "openai", "gemini", "google"],
      },
    });

    // Record telemetry for ClawRouter APR dashboard
    recordAprDecision({
      ts: Date.now(),
      strategy: result.routingPlan.strategy,
      chunkCount: result.chunkResults.length,
      costMultiplier: result.relativeCost,
      validationScore: result.validationScore,
      usedFallback: result.chunkResults.some((r) => r.fallbackUsed),
    });

    return parseActionJSON(result.finalResponse);
  } catch {
    // APR failed — fall back to direct cloud inference
    return cloudInference(citizen, state);
  }
}
