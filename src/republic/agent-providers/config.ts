/**
 * Agent Provider Config — Provider selection, model defaults, and env helpers.
 *
 * Centralizes the provider fallback chain, model ID resolution, and
 * OpenAI-compatible endpoint configuration for all 9 provider types.
 */

import fs from "node:fs";
import path from "node:path";
import type { AgentProvider, OpenAiCompatConfig } from "./types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";

export type { AgentProvider, OpenAiCompatConfig };

const logger = createSubsystemLogger("agent-config");

// ─── .env Loading ───────────────────────────────────────────────

let envLoaded = false;
function ensureEnvLoaded(): void {
  if (envLoaded) {
    return;
  }
  envLoaded = true;
  try {
    // Walk up from this file to find .env at project root
    let dir = import.meta.dirname ?? process.cwd();
    for (let i = 0; i < 5; i++) {
      const envPath = path.join(dir, ".env");
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) {
            continue;
          }
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx < 1) {
            continue;
          }
          const k = trimmed.slice(0, eqIdx).trim();
          const v = trimmed
            .slice(eqIdx + 1)
            .trim()
            .replace(/^["']|["']$/g, "");
          if (!process.env[k]) {
            process.env[k] = v;
          }
        }
        logger.info(`Loaded .env from ${envPath}`);
        return;
      }
      dir = path.dirname(dir);
    }
  } catch (e) {
    logger.warn(`Failed to load .env: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Read an environment variable, loading .env on first access */
export const key = (name: string): string => {
  ensureEnvLoaded();
  return process.env[name] || "";
};

// ─── Default Models ─────────────────────────────────────────────

// Agent loop tasks: use fast Flash/Nano models by default to save cost.
// Override via env: AGENT_LOOP_GEMINI_MODEL, AGENT_LOOP_OPENAI_MODEL, AGENT_LOOP_MODEL
// IMPORTANT: Use real Gemini API model IDs (fictional names like gemini-3.2-pro cause 403!)
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-pro-preview"; // Best Gemini, 1M ctx, $2/M (March 2026)
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"; // Best value OpenAI, tool calling (March 2026)
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6-20260217"; // Best Sonnet, 1M ctx (Feb 2026)

// ─── OpenAI-Compatible Config ───────────────────────────────────

/** Get OpenAI-compatible config for a provider. Returns null if provider is not OpenAI-compat. */
export function getOpenAiCompatConfig(
  provider: AgentProvider,
  modelIdOverride?: string,
): OpenAiCompatConfig | null {
  switch (provider) {
    case "openai":
      return {
        baseUrl: "https://api.openai.com/v1",
        apiKey: key("OPENAI_API_KEY"),
        modelId:
          modelIdOverride ||
          key("AGENT_LOOP_OPENAI_MODEL") ||
          key("OPENAI_MODEL") ||
          DEFAULT_OPENAI_MODEL,
        label: "OpenAI",
      };
    case "deepseek":
      return {
        baseUrl: "https://api.deepseek.com",
        apiKey: key("DEEPSEEK_API_KEY"),
        modelId: modelIdOverride || key("DEEPSEEK_MODEL") || "deepseek-chat",
        label: "DeepSeek",
        maxTokens: 8192,
      };
    case "groq":
      return {
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: key("GROQ_API_KEY"),
        modelId: modelIdOverride || key("GROQ_MODEL") || "llama-3.3-70b-versatile",
        label: "Groq",
        maxTokens: 8192,
      };
    case "nvidia-nim":
      return {
        baseUrl: "https://integrate.api.nvidia.com/v1",
        apiKey: key("NVIDIA_API_KEY"),
        modelId: modelIdOverride || key("NVIDIA_MODEL") || "nvidia/llama-3.3-nemotron-super-49b-v1",
        label: "NVIDIA NIM",
        maxTokens: 4096,
      };
    case "openrouter":
      return {
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: key("OPENROUTER_API_KEY"),
        modelId: modelIdOverride || key("OPENROUTER_MODEL") || "auto",
        label: "OpenRouter",
        extraHeaders: { "HTTP-Referer": "https://openclaw.dev", "X-Title": "HoC Agent" },
      };
    case "lmstudio": {
      const host = key("LMSTUDIO_HOST") || "localhost";
      const port = key("LMSTUDIO_PORT") || "1234";
      return {
        baseUrl: `http://${host}:${port}/v1`,
        apiKey: "lm-studio", // LM Studio accepts any key
        modelId: modelIdOverride || key("LMSTUDIO_MODEL") || "default",
        label: "LM Studio",
        maxTokens: 4096,
      };
    }
    case "ollama": {
      const host = key("OLLAMA_HOST") || "http://localhost:11434";
      return {
        baseUrl: `${host.replace(/\/$/, "")}/v1`,
        apiKey: "ollama", // Ollama accepts any key
        modelId: modelIdOverride || key("OLLAMA_MODEL") || "llama3.3",
        label: "Ollama",
        maxTokens: 4096,
      };
    }
    default:
      return null; // anthropic, gemini have their own loop functions
  }
}

// ─── Provider Selection ─────────────────────────────────────────

/** Select the best available provider, skipping any in the skip set.
 *  Priority: Anthropic → OpenAI → Gemini → DeepSeek → Groq → NIM → OpenRouter → LM Studio → Ollama
 */
export function selectAgentProvider(skip: Set<AgentProvider> = new Set()): AgentProvider | null {
  const checks: Array<[AgentProvider, string | (() => boolean)]> = [
    ["anthropic", "ANTHROPIC_API_KEY"],
    ["openai", "OPENAI_API_KEY"],
    ["gemini", "GEMINI_API_KEY"],
    ["deepseek", "DEEPSEEK_API_KEY"],
    ["groq", "GROQ_API_KEY"],
    ["nvidia-nim", "NVIDIA_API_KEY"],
    ["openrouter", "OPENROUTER_API_KEY"],
    ["lmstudio", () => !!key("LMSTUDIO_MODEL")],
    ["ollama", () => !!key("OLLAMA_MODEL") || !!key("OLLAMA_HOST")],
  ];
  for (const [p, check] of checks) {
    if (skip.has(p)) {
      continue;
    }
    const available = typeof check === "function" ? check() : !!key(check);
    if (available) {
      return p;
    }
  }
  return null;
}

/** Return the next available provider in the fallback chain after `current` */
export function nextAgentProvider(
  current: AgentProvider,
  skip: Set<AgentProvider>,
): AgentProvider | null {
  const newSkip = new Set(skip);
  newSkip.add(current);
  return selectAgentProvider(newSkip);
}

export function providerModelId(provider: AgentProvider): string {
  if (provider === "gemini") {
    return key("AGENT_LOOP_GEMINI_MODEL") || key("GEMINI_MODEL") || DEFAULT_GEMINI_MODEL;
  }
  if (provider === "anthropic") {
    return key("AGENT_LOOP_MODEL") || key("ANTHROPIC_MODEL") || DEFAULT_CLAUDE_MODEL;
  }
  // All OpenAI-compatible providers
  const compat = getOpenAiCompatConfig(provider);
  if (compat) {
    return compat.modelId;
  }
  return key("AGENT_LOOP_OPENAI_MODEL") || key("OPENAI_MODEL") || DEFAULT_OPENAI_MODEL;
}

export function providerLabel(provider: AgentProvider, modelId: string): string {
  const compat = getOpenAiCompatConfig(provider);
  if (compat) {
    return `${compat.label} (${modelId})`;
  }
  if (provider === "gemini") {
    return `Gemini (${modelId})`;
  }
  return `Claude (${modelId})`;
}

// ─── Provider→String mapping for session dropdown ───────────────

export const PROVIDER_MAP: Record<string, AgentProvider> = {
  google: "gemini",
  gemini: "gemini",
  openai: "openai",
  anthropic: "anthropic",
  deepseek: "deepseek",
  groq: "groq",
  nvidia: "nvidia-nim",
  "nvidia-nim": "nvidia-nim",
  nim: "nvidia-nim",
  openrouter: "openrouter",
  lmstudio: "lmstudio",
  "lm-studio": "lmstudio",
  lm_studio: "lmstudio",
  ollama: "ollama",
};

/** Parse a "provider/modelId" string into provider + model */
export function parseProviderModel(
  combined: string,
): { provider: AgentProvider; model: string } | null {
  const parts = combined.split("/");
  if (parts.length < 2) {
    return null;
  }
  const pMap: Record<string, AgentProvider> = {
    google: "gemini",
    gemini: "gemini",
    openai: "openai",
    anthropic: "anthropic",
    deepseek: "deepseek",
    groq: "groq",
    "nvidia-nim": "nvidia-nim",
    openrouter: "openrouter",
    lmstudio: "lmstudio",
    ollama: "ollama",
  };
  const provider = pMap[parts[0]!];
  if (!provider) {
    return null;
  }
  return { provider, model: parts.slice(1).join("/") };
}
