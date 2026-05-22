/**
 * Voice Engine — STT (Speech-to-Text)
 *
 * Routes audio through available STT providers:
 * - Whisper (local via Docker — sovereign, free)
 * - Groq Whisper (cloud — ultra-fast, free tier)
 * - OpenAI Whisper API (cloud — highest quality)
 * - AssemblyAI (cloud — real-time streaming)
 */

import type { STTProvider, STTResult } from "./types.js";

// ─── Stats ───────────────────────────────────────────────────────

let totalCalls = 0;
let totalLatencyMs = 0;

export function getSTTStats(): { calls: number; avgLatencyMs: number } {
  return {
    calls: totalCalls,
    avgLatencyMs: totalCalls > 0 ? Math.round(totalLatencyMs / totalCalls) : 0,
  };
}

// ─── Provider Availability ───────────────────────────────────────

function envKey(name: string): string {
  return process.env[name] ?? "";
}

export function getAvailableSTTProviders(): STTProvider[] {
  const providers: STTProvider[] = ["whisper-local"]; // Always available if Docker running
  if (envKey("GROQ_API_KEY")) {
    providers.push("groq-whisper");
  }
  if (envKey("OPENAI_API_KEY")) {
    providers.push("whisper-api");
  }
  if (envKey("ASSEMBLYAI_API_KEY")) {
    providers.push("assemblyai");
  }
  return providers;
}

// ─── Transcribe ──────────────────────────────────────────────────

/** Transcribe audio using the best available STT provider */
export async function transcribe(
  audioBase64: string,
  provider?: STTProvider,
  language = "en",
): Promise<STTResult> {
  const p = provider ?? getAvailableSTTProviders()[0] ?? "whisper-local";
  const start = performance.now();

  let result: STTResult;
  switch (p) {
    case "groq-whisper":
      result = await groqWhisper(audioBase64, language);
      break;
    case "whisper-api":
      result = await openaiWhisper(audioBase64, language);
      break;
    case "whisper-local":
      result = await localWhisper(audioBase64, language);
      break;
    case "assemblyai":
      result = await assemblyAI(audioBase64, language);
      break;
    default:
      result = await localWhisper(audioBase64, language);
  }

  result.latencyMs = Math.round(performance.now() - start);
  totalCalls++;
  totalLatencyMs += result.latencyMs;

  return result;
}

// ─── Groq Whisper ────────────────────────────────────────────────

async function groqWhisper(audioBase64: string, language: string): Promise<STTResult> {
  const apiKey = envKey("GROQ_API_KEY");
  if (!apiKey) {
    throw new Error("GROQ_API_KEY not set");
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer], { type: "audio/wav" }), "audio.wav");
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("language", language);
  formData.append("response_format", "verbose_json");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Groq Whisper error: ${response.status}`);
  }

  const data = (await response.json()) as {
    text?: string;
    language?: string;
    segments?: Array<{ start: number; end: number; text: string }>;
  };

  return {
    text: data.text ?? "",
    confidence: 0.92,
    latencyMs: 0,
    isFinal: true,
    language: data.language,
    segments: data.segments,
  };
}

// ─── OpenAI Whisper ──────────────────────────────────────────────

async function openaiWhisper(audioBase64: string, language: string): Promise<STTResult> {
  const apiKey = envKey("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer], { type: "audio/wav" }), "audio.wav");
  formData.append("model", "whisper-1");
  formData.append("language", language);
  formData.append("response_format", "verbose_json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`OpenAI Whisper error: ${response.status}`);
  }

  const data = (await response.json()) as {
    text?: string;
    language?: string;
    segments?: Array<{ start: number; end: number; text: string }>;
  };

  return {
    text: data.text ?? "",
    confidence: 0.95,
    latencyMs: 0,
    isFinal: true,
    language: data.language,
    segments: data.segments,
  };
}

// ─── Local Whisper (Docker) ──────────────────────────────────────

async function localWhisper(audioBase64: string, language: string): Promise<STTResult> {
  const host = process.env.WHISPER_HOST ?? "http://localhost:9000";

  const response = await fetch(`${host}/asr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audio: audioBase64,
      language,
      task: "transcribe",
      output: "json",
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`Local Whisper error: ${response.status}`);
  }

  const data = (await response.json()) as {
    text?: string;
    segments?: Array<{ start: number; end: number; text: string }>;
  };

  return {
    text: data.text ?? "",
    confidence: 0.88,
    latencyMs: 0,
    isFinal: true,
    language,
    segments: data.segments,
  };
}

// ─── AssemblyAI ──────────────────────────────────────────────────

async function assemblyAI(audioBase64: string, language: string): Promise<STTResult> {
  const apiKey = envKey("ASSEMBLYAI_API_KEY");
  if (!apiKey) {
    throw new Error("ASSEMBLYAI_API_KEY not set");
  }

  // Upload audio
  const audioBuffer = Buffer.from(audioBase64, "base64");
  const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/octet-stream",
    },
    body: audioBuffer,
    signal: AbortSignal.timeout(30_000),
  });

  if (!uploadRes.ok) {
    throw new Error(`AssemblyAI upload error: ${uploadRes.status}`);
  }
  const { upload_url } = (await uploadRes.json()) as { upload_url: string };

  // Create transcription
  const txRes = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: upload_url,
      language_code: language,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!txRes.ok) {
    throw new Error(`AssemblyAI transcribe error: ${txRes.status}`);
  }
  const { id } = (await txRes.json()) as { id: string };

  // Poll for result (max 30s)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(10_000),
    });

    const poll = (await pollRes.json()) as {
      status: string;
      text?: string;
      confidence?: number;
    };

    if (poll.status === "completed") {
      return {
        text: poll.text ?? "",
        confidence: poll.confidence ?? 0.9,
        latencyMs: 0,
        isFinal: true,
        language,
      };
    }
    if (poll.status === "error") {
      throw new Error("AssemblyAI transcription failed");
    }
  }

  throw new Error("AssemblyAI transcription timeout");
}
