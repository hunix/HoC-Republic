/**
 * Cloud Inference — Provider Availability Status
 */

// ─── Configuration ──────────────────────────────────────────────
// Lazy getters — process.env is populated by loadDotEnv() at boot
// and updated at runtime by config.env.set. Static const captures
// would freeze the value at import time (before dotenv loads).

export const key = (name: string) => process.env[name] || "";

export const TIMEOUT_MS = 15_000;

export function isGeminiAvailable(): boolean {
  return key("GEMINI_API_KEY").length > 0;
}

export function isOpenAIAvailable(): boolean {
  return key("OPENAI_API_KEY").length > 0;
}

export function isAnthropicAvailable(): boolean {
  return key("ANTHROPIC_API_KEY").length > 0;
}

export function isGroqAvailable(): boolean {
  return key("GROQ_API_KEY").length > 0;
}

export function isNvidiaNimAvailable(): boolean {
  return key("NVIDIA_API_KEY").length > 0;
}

export function isDeepSeekAvailable(): boolean {
  return key("DEEPSEEK_API_KEY").length > 0;
}

export function isOpenRouterAvailable(): boolean {
  return key("OPENROUTER_API_KEY").length > 0;
}

/**
 * LM Studio — OpenAI-compatible local inference server.
 * Runs on localhost:1234 by default with LMSTUDIO_MODEL.
 * Set LMSTUDIO_HOST, LMSTUDIO_PORT, and LMSTUDIO_MODEL in .env.
 * RECOMMENDED MODEL: qwen3-30b-a3b-iq4_xs (fits in 24GB VRAM, 70-90 tok/s)
 */
export function isLmStudioAvailable(): boolean {
  // Available if LMSTUDIO_MODEL is set — we always try localhost:1234 by default
  return key("LMSTUDIO_MODEL").length > 0;
}

/**
 * Gemma 4 — sovereign local AI via LM Studio / LM Link cluster.
 * Runs 26B MoE (3.8B active), E4B, E2B, or 31B Dense.
 * GEMMA4_MODEL defaults to gemma4:26b-a4b — override in .env.
 * Falls back to Gemini API free cloud if LM Studio unreachable.
 */
export function isGemma4Available(): boolean {
  return key("GEMMA4_MODEL").length > 0 || key("GEMMA4_ENABLED") === "true";
}

/**
 * Ollama — uses OpenAI-compat API at localhost:11434.
 */
export function isOllamaAvailable(): boolean {
  return key("OLLAMA_HOST").length > 0 || true; // Always try (localhost default)
}

export function isCloudAvailable(): boolean {
  return (
    isGeminiAvailable() ||
    isOpenAIAvailable() ||
    isGroqAvailable() ||
    isNvidiaNimAvailable() ||
    isDeepSeekAvailable() ||
    isOpenRouterAvailable()
  );
}

/** Get a summary of all cloud provider statuses */
export function getCloudProviderStatus(): Record<string, boolean> {
  return {
    gemma4: isGemma4Available(),
    lmStudio: isLmStudioAvailable(),
    ollama: isOllamaAvailable(),
    gemini: isGeminiAvailable(),
    openai: isOpenAIAvailable(),
    anthropic: isAnthropicAvailable(),
    groq: isGroqAvailable(),
    nvidiaNim: isNvidiaNimAvailable(),
    deepseek: isDeepSeekAvailable(),
    openrouter: isOpenRouterAvailable(),
  };
}
