/**
 * Voice Engine — TTS (Text-to-Speech) Streaming
 *
 * Routes synthesis through available TTS providers:
 * - Chatterbox (local Docker — sovereign, high quality)
 * - Qwen3-TTS (local — multilingual)
 * - ElevenLabs (cloud — ultra-realistic)
 * - OpenAI TTS (cloud — stable fallback)
 */

import type { TTSProvider, TTSResult } from "./types.js";

// ─── Stats ───────────────────────────────────────────────────────

let totalCalls = 0;
let totalLatencyMs = 0;

export function getTTSStats(): { calls: number; avgLatencyMs: number } {
  return {
    calls: totalCalls,
    avgLatencyMs: totalCalls > 0 ? Math.round(totalLatencyMs / totalCalls) : 0,
  };
}

// ─── Provider Availability ───────────────────────────────────────

function envKey(name: string): string {
  return process.env[name] ?? "";
}

export function getAvailableTTSProviders(): TTSProvider[] {
  const providers: TTSProvider[] = ["chatterbox"]; // Always available if Docker running
  providers.push("qwen3-tts");
  if (envKey("ELEVENLABS_API_KEY")) {
    providers.push("elevenlabs");
  }
  if (envKey("OPENAI_API_KEY")) {
    providers.push("openai-tts");
  }
  return providers;
}

// ─── Synthesize ──────────────────────────────────────────────────

/** Synthesize speech from text */
export async function synthesize(
  text: string,
  provider?: TTSProvider,
  voiceId?: string,
): Promise<TTSResult> {
  const p = provider ?? getAvailableTTSProviders()[0] ?? "chatterbox";
  const start = performance.now();

  let result: TTSResult;
  switch (p) {
    case "chatterbox":
      result = await chatterboxTTS(text, voiceId);
      break;
    case "qwen3-tts":
      result = await qwen3TTS(text, voiceId);
      break;
    case "elevenlabs":
      result = await elevenLabsTTS(text, voiceId);
      break;
    case "openai-tts":
      result = await openaiTTS(text, voiceId);
      break;
    default:
      result = await chatterboxTTS(text, voiceId);
  }

  result.latencyMs = Math.round(performance.now() - start);
  totalCalls++;
  totalLatencyMs += result.latencyMs;

  return result;
}

// ─── Chatterbox (Local Docker) ───────────────────────────────────

async function chatterboxTTS(text: string, voiceId?: string): Promise<TTSResult> {
  const host = process.env.CHATTERBOX_HOST ?? "http://localhost:8100";

  const response = await fetch(`${host}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text.slice(0, 5000),
      voice: voiceId ?? "default",
      output_format: "wav",
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Chatterbox TTS error: ${response.status}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const audioBase64 = Buffer.from(audioBuffer).toString("base64");

  return {
    audioBase64,
    format: "wav",
    durationMs: Math.round(text.length * 60), // ~60ms per character estimate
    latencyMs: 0,
  };
}

// ─── Qwen3-TTS (Local) ──────────────────────────────────────────

async function qwen3TTS(text: string, voiceId?: string): Promise<TTSResult> {
  const host = process.env.QWEN3_TTS_HOST ?? "http://localhost:8200";

  const response = await fetch(`${host}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text.slice(0, 5000),
      speaker: voiceId ?? "default",
      language: "en",
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Qwen3-TTS error: ${response.status}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const audioBase64 = Buffer.from(audioBuffer).toString("base64");

  return {
    audioBase64,
    format: "wav",
    durationMs: Math.round(text.length * 55),
    latencyMs: 0,
  };
}

// ─── ElevenLabs ──────────────────────────────────────────────────

async function elevenLabsTTS(text: string, voiceId?: string): Promise<TTSResult> {
  const apiKey = envKey("ELEVENLABS_API_KEY");
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY not set");
  }

  const voice = voiceId ?? "21m00Tcm4TlvDq8ikWAM"; // Default: Rachel
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text: text.slice(0, 5000),
      model_id: "eleven_turbo_v2_5",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs TTS error: ${response.status}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const audioBase64 = Buffer.from(audioBuffer).toString("base64");

  return {
    audioBase64,
    format: "mp3",
    durationMs: Math.round(text.length * 65),
    latencyMs: 0,
  };
}

// ─── OpenAI TTS ──────────────────────────────────────────────────

async function openaiTTS(text: string, voiceId?: string): Promise<TTSResult> {
  const apiKey = envKey("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const voice = voiceId ?? "alloy";
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "tts-1",
      input: text.slice(0, 4096),
      voice,
      response_format: "mp3",
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI TTS error: ${response.status}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const audioBase64 = Buffer.from(audioBuffer).toString("base64");

  return {
    audioBase64,
    format: "mp3",
    durationMs: Math.round(text.length * 60),
    latencyMs: 0,
  };
}
