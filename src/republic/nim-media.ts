/**
 * NVIDIA NIM Media Inference Bridge
 *
 * Provides OpenAI-compatible wrappers for NVIDIA NIM multimodal models:
 *
 * TEXT / REASONING — verified working on integrate.api.nvidia.com/v1 (March 2026)
 *   meta/llama-3.3-70b-instruct          — ✅ VERIFIED, primary model
 *   nvidia/llama-3.1-nemotron-70b-instruct — ✅ VERIFIED, NVIDIA-tuned reasoning
 *   mistralai/mistral-7b-instruct-v0.3    — ✅ VERIFIED, fast routing
 *   google/gemma-3-27b-it                 — ✅ VERIFIED, fallback
 *
 * NOTE: nemotron-3-super-120b-a12b, nemotron-h-56b-instruct, and nemotron-nano-8b
 * return 404 on the hosted NIM API endpoint as of March 2026 — likely only
 * accessible via build.nvidia.com playground, not the API catalog yet.
 *
 * IMAGE GENERATION (via integrate.api.nvidia.com/v1)
 *   black-forest-labs/flux-1-schnell   — FLUX 1 Schnell, 12B param diffusion
 *   black-forest-labs/flux-1-dev       — FLUX 1 Dev, higher quality
 *
 * SPEECH (via integrate.api.nvidia.com/v1)
 *   nvidia/parakeet-tdt-0.6b-v3        — ASR (speech-to-text), 24 min audio
 *
 * VIDEO WORLD MODEL (via integrate.api.nvidia.com/v1)
 *   nvidia/cosmos-predict2-2b          — physics-aware video prediction
 *
 * Rate limit: 40 RPM shared across ALL NIM models on your API key.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("republic:nim-media");

// ─── Config ─────────────────────────────────────────────────────

const NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
const key = () => process.env["NVIDIA_API_KEY"] ?? "";

/** NIM free-tier: 40 RPM shared. We allocate per category. */
const NIM_RATE_LIMIT_RPM = 40;

// ─── NIM Model Catalog ───────────────────────────────────────────

export const NIM_MODELS = {
  // ── Text / Reasoning — VERIFIED working March 2026 ───────────────────
  // deepseekR1 remapped: deepseek-ai/deepseek-r1 reached EOL 2026-01-26
  // (returns HTTP 410). Key retained for backwards-compat; points to nemotron.
  deepseekR1:       "nvidia/llama-3.1-nemotron-70b-instruct",
  // Primary General: Llama 3.3 70B on NVIDIA infra (confirmed ✅)
  llama33_70b:      "meta/llama-3.3-70b-instruct",
  // NVIDIA-tuned reasoning variant (confirmed ✅)
  nemotron70b:      "nvidia/llama-3.1-nemotron-70b-instruct",
  // Fast lightweight (confirmed ✅)
  mistral7b:        "mistralai/mistral-7b-instruct-v0.3",
  // Gemma 27B (confirmed ✅)
  gemma3_27b:       "google/gemma-3-27b-it",

  // ── Future / Aspirational (404 on API as of March 2026) ─────────────
  // These exist on build.nvidia.com playground but NOT yet on the API
  // catalog. Will work once NVIDIA adds them to integrate.api.nvidia.com.
  nemotron3Super:   "nvidia/nemotron-3-super-120b-a12b",   // NOT YET AVAILABLE
  nemotronH56:      "nvidia/nemotron-h-56b-instruct",       // NOT YET AVAILABLE
  nemotronNano8b:   "nvidia/nemotron-nano-8b-instruct",     // NOT YET AVAILABLE

  // ── Image Generation ────────────────────────────────────────────
  flux1Schnell:     "black-forest-labs/flux-1-schnell",
  flux1Dev:         "black-forest-labs/flux-1-dev",

  // ── Speech (ASR) ────────────────────────────────────────────────
  parakeetTdt:      "nvidia/parakeet-tdt-0.6b-v3",

  // ── Video / World Model ─────────────────────────────────────────
  cosmosPredict:    "nvidia/cosmos-predict2-2b",
} as const;

export type NimModelId = (typeof NIM_MODELS)[keyof typeof NIM_MODELS];

/**
 * Primary NIM model — used as the default for all nimChat() calls.
 * Verified working on integrate.api.nvidia.com as of March 2026.
 */
export const NIM_PRIMARY_MODEL: NimModelId = NIM_MODELS.llama33_70b;

/**
 * Fallback NIM model order — tried in sequence if primary is rate-limited.
 * All entries are verified working.
 */
export const NIM_FALLBACK_CHAIN: NimModelId[] = [
  // Note: deepseekR1 removed — it was EOL 2026-01-26 and returned HTTP 410,
  // causing every fallback attempt to fail immediately.
  NIM_MODELS.llama33_70b,
  NIM_MODELS.nemotron70b,
  NIM_MODELS.gemma3_27b,
  NIM_MODELS.mistral7b,
];

// ─── Specialization → Preferred NIM Text Model ──────────────────

/**
 * Map citizen specializations to the best verified NIM text model.
 * All models in this map are confirmed working on the NIM API.
 *
 * When Nemotron 3 Super 120B becomes available on the API, update
 * reasoning-heavy specializations to use NIM_MODELS.nemotron3Super.
 */
export const SPEC_NIM_MODEL_MAP: Record<string, NimModelId> = {
  // Deep reasoning / research → DeepSeek R1 (hyper-analytical reasoning)
  QuantumAlgorithmDesigner: NIM_MODELS.deepseekR1,
  Scientist:                NIM_MODELS.deepseekR1,
  Researcher:               NIM_MODELS.deepseekR1,
  Mathematician:            NIM_MODELS.deepseekR1,
  NeuroinformaticsEngineer: NIM_MODELS.deepseekR1,
  BCISpecialist:            NIM_MODELS.deepseekR1,
  SynbioEngineer:           NIM_MODELS.deepseekR1,
  Strategist:               NIM_MODELS.nemotron70b,
  GenerativeAIArchitect:    NIM_MODELS.nemotron70b,
  AutonomousSystemsArchitect: NIM_MODELS.nemotron70b,

  // Engineering / coding → Llama 3.3 70B (strong coding, instruction following)
  Developer:          NIM_MODELS.llama33_70b,
  Engineer:           NIM_MODELS.llama33_70b,
  Architect:          NIM_MODELS.llama33_70b,
  HardwareTechnician: NIM_MODELS.llama33_70b,

  // Analyst / diplomat / governance → Gemma 27B (nuanced, factual)
  Analyst:   NIM_MODELS.gemma3_27b,
  Diplomat:  NIM_MODELS.gemma3_27b,
  Planner:   NIM_MODELS.gemma3_27b,

  // Social / creative → Llama 3.3 70B (creative + instruction)
  Artist:      NIM_MODELS.llama33_70b,
  Musician:    NIM_MODELS.llama33_70b,
  Writer:      NIM_MODELS.llama33_70b,
  Doctor:      NIM_MODELS.llama33_70b,
  Psychologist: NIM_MODELS.llama33_70b,

  // Fast / light tasks → Mistral 7B (minimal latency)
  Farmer: NIM_MODELS.mistral7b,
};

/** Returns the ideal NIM text model for a citizen's specialization. */
export function getNimModelForSpec(specialization: string): NimModelId {
  return SPEC_NIM_MODEL_MAP[specialization] ?? NIM_PRIMARY_MODEL;
}

// ─── Shared Rate Limiter (40 RPM bucket) ────────────────────────

/** Simple token-bucket rate limiter: 40 RPM = 1 token per 1.5 seconds */
const nimRateBucket = (() => {
  const intervalMs = (60 / NIM_RATE_LIMIT_RPM) * 1000; // 1500ms
  let lastCall = 0;
  let queued = 0;

  return {
    /** Returns ms to wait before this call is allowed, or 0 if immediate. */
    waitMs(): number {
      const now = Date.now();
      const elapsed = now - lastCall;
      if (elapsed >= intervalMs) {
        lastCall = now;
        return 0;
      }
      queued++;
      const wait = intervalMs - elapsed + queued * intervalMs;
      setTimeout(() => { queued = Math.max(0, queued - 1); }, wait);
      lastCall = now + wait;
      return wait;
    },
    status() {
      return {
        rpmLimit: NIM_RATE_LIMIT_RPM,
        intervalMs,
        lastCallAgo: Date.now() - lastCall,
        queued,
      };
    },
  };
})();

async function nimThrottledFetch(
  path: string,
  body: unknown,
  timeoutMs = 30_000,
): Promise<Response> {
  const wait = nimRateBucket.waitMs();
  if (wait > 0) {
    await new Promise(r => setTimeout(r, wait));
  }

  const apiKey = key();
  if (!apiKey) {throw new Error("NVIDIA_API_KEY not configured");}

  return fetch(`${NIM_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

// ─── Text / Chat Completion ──────────────────────────────────────

export interface NimChatOptions {
  model?: NimModelId;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Chat completion via NVIDIA NIM (OpenAI-compatible).
 * Respects the 40 RPM shared rate limit.
 */
export async function nimChat(
  userPrompt: string,
  opts: NimChatOptions = {},
): Promise<string> {
  const model = opts.model ?? NIM_PRIMARY_MODEL;
  const response = await nimThrottledFetch("/chat/completions", {
    model,
    messages: [
      ...(opts.systemPrompt ? [{ role: "system", content: opts.systemPrompt }] : []),
      { role: "user", content: userPrompt },
    ],
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 1024,
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`NIM chat error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  logger.debug(`NIM chat ok: model=${model} tokens=${data.usage?.total_tokens ?? "?"}`);
  return content;
}

// ─── Image Generation (FLUX via NIM) ────────────────────────────

export interface NimImageOptions {
  model?: "black-forest-labs/flux-1-schnell" | "black-forest-labs/flux-1-dev";
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
}

/**
 * Generate an image via NVIDIA NIM (FLUX 1 Schnell / Dev).
 * Returns base64-encoded PNG.
 * Rate-limited to NIM's 40 RPM shared bucket.
 */
export async function nimGenerateImage(
  prompt: string,
  opts: NimImageOptions = {},
): Promise<{ base64: string; model: string }> {
  const model = opts.model ?? "black-forest-labs/flux-1-schnell";

  // FLUX via NIM uses the /images/generations endpoint
  const response = await nimThrottledFetch("/images/generations", {
    model,
    prompt,
    width: opts.width ?? 1024,
    height: opts.height ?? 1024,
    num_inference_steps: opts.steps ?? (model.includes("schnell") ? 4 : 20),
    guidance_scale: opts.cfgScale ?? (model.includes("schnell") ? 0 : 3.5),
    response_format: "b64_json",
  }, 60_000);

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`NIM FLUX error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ b64_json?: string }>;
  };
  const b64 = data.data?.[0]?.b64_json ?? "";
  if (!b64) {throw new Error("NIM FLUX: no image data returned");}

  logger.info(`NIM FLUX image generated: model=${model} prompt="${prompt.slice(0, 60)}"`);
  return { base64: b64, model };
}

// ─── Speech Recognition (Parakeet via NIM) ──────────────────────

/**
 * Transcribe audio via NVIDIA Parakeet TDT (best-in-class ASR).
 * audioBase64: base64-encoded WAV/MP3/FLAC, max 24 minutes.
 */
export async function nimTranscribeAudio(
  audioBase64: string,
  language = "en",
): Promise<string> {
  const response = await nimThrottledFetch("/audio/transcriptions", {
    model: NIM_MODELS.parakeetTdt,
    audio: audioBase64,
    language,
    response_format: "text",
    timestamp_granularities: ["word"],
  }, 60_000);

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`NIM Parakeet error ${response.status}: ${err.slice(0, 200)}`);
  }

  return (await response.text()).trim();
}

// ─── Rate Budget Diagnostics ─────────────────────────────────────

export function getNimRateBudgetStatus() {
  return {
    ...nimRateBucket.status(),
    apiKeyConfigured: key().length > 0,
    models: NIM_MODELS,
  };
}
