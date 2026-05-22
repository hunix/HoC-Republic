// Defaults for agent metadata when upstream does not supply them.
// Model id uses pi-ai's built-in Anthropic catalog.
export const DEFAULT_PROVIDER = "anthropic";
export const DEFAULT_MODEL = "claude-opus-4-6";
// Conservative fallback used when model metadata is unavailable.
export const DEFAULT_CONTEXT_TOKENS = 200_000;

/**
 * Default model fallback chain — used when the config doesn't specify
 * agents.defaults.model.fallbacks. Ordered by cost priority:
 *   1. Ollama Nemotron 3 Super (free local/cloud, 120B MoE)
 *   2. NVIDIA NIM Nemotron 3 Super (free cloud tier)
 *   3. Anthropic Sonnet (paid, same provider as primary)
 *   4. Gemini Pro (paid, large context)
 *   5. OpenAI GPT-5.2 (paid)
 *
 * Deep reasoning tasks (orchestrator, chat) still use primary
 * (Anthropic Opus/Sonnet, Gemini Pro) — this chain is for citizens.
 */
export const DEFAULT_FALLBACKS: readonly string[] = [
  "ollama/nemotron-super",
  "nvidia-nim/nvidia/nemotron-3-super-120b-a12b",
  "anthropic/claude-sonnet-4-6",
  "google/gemini-3.1-pro",
  "openai/gpt-5.2",
];
