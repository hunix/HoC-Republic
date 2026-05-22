/**
 * Vision Engine — Provider Adapters
 *
 * Routes image understanding through available vision-capable LLMs:
 * - Gemma 4 26B (local via Ollama — multimodal, free, sovereign)
 * - Gemini 2.5 Flash (cloud — $0.01/M, fast vision)
 * - OpenAI GPT-4o (cloud — highest quality fallback)
 * - Generic Ollama (any multimodal model — LLaVA, BakLLaVA, etc.)
 */

import type { VisionProvider, VisionProviderConfig, VisionResponse } from "./types.js";

// ─── Provider Availability ───────────────────────────────────────

/** Lazy env key reader */
function envKey(name: string): string {
  return process.env[name] ?? "";
}

const PROVIDER_CONFIGS: Record<VisionProvider, VisionProviderConfig> = {
  gemma4: {
    provider: "gemma4",
    model: "gemma4:latest",
    endpoint: process.env.OLLAMA_HOST ?? "http://localhost:11434",
    maxImageSizeMB: 20,
    supportedFormats: ["png", "jpg", "jpeg", "webp", "gif"],
  },
  ollama: {
    provider: "ollama",
    model: process.env.OLLAMA_VISION_MODEL ?? "llava:13b",
    endpoint: process.env.OLLAMA_HOST ?? "http://localhost:11434",
    maxImageSizeMB: 20,
    supportedFormats: ["png", "jpg", "jpeg", "webp", "gif"],
  },
  gemini: {
    provider: "gemini",
    model: "gemini-2.5-flash-lite",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    apiKey: envKey("GEMINI_API_KEY"),
    maxImageSizeMB: 20,
    supportedFormats: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
  },
  openai: {
    provider: "openai",
    model: "gpt-4o-mini",
    endpoint: "https://api.openai.com/v1",
    apiKey: envKey("OPENAI_API_KEY"),
    maxImageSizeMB: 20,
    supportedFormats: ["png", "jpg", "jpeg", "webp", "gif"],
  },
  local: {
    provider: "local",
    model: "pixel-analysis",
    endpoint: "",
    maxImageSizeMB: 50,
    supportedFormats: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"],
  },
};

/** Check if a vision provider is available */
export function isVisionProviderAvailable(provider: VisionProvider): boolean {
  switch (provider) {
    case "gemma4":
    case "ollama":
      return true; // Availability checked at request time
    case "gemini":
      return !!envKey("GEMINI_API_KEY");
    case "openai":
      return !!envKey("OPENAI_API_KEY");
    case "local":
      return true;
  }
}

/** Get all available vision providers in priority order */
export function getAvailableVisionProviders(): VisionProvider[] {
  const priority: VisionProvider[] = ["gemma4", "ollama", "gemini", "openai", "local"];
  return priority.filter(isVisionProviderAvailable);
}

export function getProviderConfig(provider: VisionProvider): VisionProviderConfig {
  return PROVIDER_CONFIGS[provider];
}

// ─── Ollama Vision (Gemma 4 / LLaVA) ────────────────────────────

export async function ollamaVision(
  imageBase64: string,
  prompt: string,
  model?: string,
): Promise<VisionResponse> {
  const cfg = PROVIDER_CONFIGS[model?.startsWith("gemma") ? "gemma4" : "ollama"];
  const actualModel = model ?? cfg.model;
  const start = performance.now();

  const response = await fetch(`${cfg.endpoint}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: actualModel,
      prompt,
      images: [imageBase64],
      stream: false,
      options: { temperature: 0.3, num_predict: 1024 },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Ollama vision error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    response?: string;
    eval_count?: number;
  };

  return {
    provider: model?.startsWith("gemma") ? "gemma4" : "ollama",
    model: actualModel,
    text: data.response ?? "",
    confidence: 0.85,
    latencyMs: Math.round(performance.now() - start),
    tokensUsed: data.eval_count,
  };
}

// ─── Gemini Vision ───────────────────────────────────────────────

export async function geminiVision(
  imageBase64: string,
  prompt: string,
  mimeType = "image/png",
): Promise<VisionResponse> {
  const apiKey = envKey("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set");
  }

  const cfg = PROVIDER_CONFIGS.gemini;
  const start = performance.now();

  const response = await fetch(
    `${cfg.endpoint}/models/${cfg.model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }],
          },
        ],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini vision error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { totalTokenCount?: number };
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  return {
    provider: "gemini",
    model: cfg.model,
    text,
    confidence: 0.9,
    latencyMs: Math.round(performance.now() - start),
    tokensUsed: data.usageMetadata?.totalTokenCount,
  };
}

// ─── OpenAI Vision ───────────────────────────────────────────────

export async function openaiVision(
  imageBase64: string,
  prompt: string,
  mimeType = "image/png",
): Promise<VisionResponse> {
  const apiKey = envKey("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const cfg = PROVIDER_CONFIGS.openai;
  const start = performance.now();

  const response = await fetch(`${cfg.endpoint}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "auto" },
            },
          ],
        },
      ],
      max_tokens: 1024,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI vision error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };

  return {
    provider: "openai",
    model: cfg.model,
    text: data.choices?.[0]?.message?.content ?? "",
    confidence: 0.92,
    latencyMs: Math.round(performance.now() - start),
    tokensUsed: data.usage?.total_tokens,
  };
}
