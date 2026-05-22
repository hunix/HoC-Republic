/**
 * Republic Platform — AI Music Generator
 *
 * Generates real music via HuggingFace Inference API using MusicGen models.
 * Falls back to the built-in sine-wave synthesizer when the API is unavailable.
 *
 * Supported models:
 *   - facebook/musicgen-small  (300M params, fastest, ~10s generation)
 *   - facebook/musicgen-medium (1.5B params, better quality)
 *   - facebook/musicgen-large  (3.3B, best quality, slowest)
 *
 * Output: WAV audio files written to republic-output/music/
 */

import { loadConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getCustomProviderApiKey } from "../agents/model-auth.js";
import { pick, rng, uid } from "./utils.js";

const logger = createSubsystemLogger("republic:music-gen");

// ─── Configuration ──────────────────────────────────────────────

const HF_INFERENCE_URL = "https://api-inference.huggingface.co/models";
const GENERATION_TIMEOUT_MS = 90_000; // 90s — model cold start can take 30-40s
const MIN_VALID_SIZE = 10_000; // 10KB minimum for valid audio

/**
 * Model cascade — tried in order. If one returns 410/404 it is marked
 * permanently unavailable for this process lifetime and skipped next time.
 *
 * NOTE (March 2026): The HF router URL was returning 404 for all facebook/musicgen-*
 * models. Switched to the standard api-inference URL which is confirmed working.
 */
const MODEL_CASCADE = [
  "facebook/musicgen-small",        // 300M — fastest
  "facebook/musicgen-stereo-small", // stereo variant
  "facebook/musicgen-medium",       // 1.5B — better quality
  "facebook/musicgen-melody",       // 1.5B — melody-conditioned variant
  "facebook/musicgen-large",        // 3.3B — best quality, slowest
];

/** Models that returned 410 Gone or 404 — skip for the rest of this session. */
const unavailableModels = new Set<string>();

// ─── Prompt Building ────────────────────────────────────────────

const GENRES = [
  "electronic dance music", "lo-fi hip hop", "cinematic orchestral",
  "ambient chillwave", "synthwave retro", "jazz fusion",
  "epic trailer music", "deep house", "drum and bass",
  "neo-soul R&B", "progressive trance", "acoustic folk",
  "future bass", "classical piano", "trap beat",
  "indie pop", "cyberpunk industrial", "reggaeton",
  "tropical house", "dark ambient", "city pop",
  "vaporwave aesthetic", "post-rock crescendo",
  "afrobeat groove", "K-pop dance track",
];

const MOODS = [
  "upbeat and energetic", "melancholic and dreamy",
  "powerful and triumphant", "chill and relaxing",
  "mysterious and suspenseful", "joyful and celebratory",
  "dark and brooding", "nostalgic and warm",
  "futuristic and ethereal", "intense and driving",
  "peaceful and meditative", "playful and funky",
  "dramatic and emotional", "hypnotic and groovy",
];

const INSTRUMENTS = [
  "synth pads and arpeggios", "acoustic guitar and strings",
  "heavy bass and 808 drums", "piano and orchestral strings",
  "electric guitar and distortion", "brass section and choir",
  "marimba and percussion", "modular synthesizer",
  "violin and cello duet", "steel drums and congas",
  "Rhodes piano and wah guitar", "harp and flute ensemble",
  "analog synth bass and hi-hats", "sitar and tabla",
  "church organ and timpani", "vocoder and drum machine",
];

const TEMPO_DESCRIPTIONS = [
  "slow and atmospheric, around 70 BPM",
  "moderate groove, around 95 BPM",
  "driving rhythm at 120 BPM",
  "high energy at 128 BPM",
  "fast-paced at 140 BPM",
  "uptempo dance at 135 BPM",
  "laid-back at 85 BPM",
  "mid-tempo at 110 BPM",
];

const PRODUCTION_STYLES = [
  "with pristine studio production and wide stereo image",
  "with vintage analog warmth and tape saturation",
  "with modern crisp mixing and punchy dynamics",
  "with spacious reverb and ethereal delay effects",
  "with compressed radio-ready mastering",
  "with raw unpolished lo-fi character",
  "with lush layered arrangement and rich harmonies",
  "with minimalist production and clean tones",
];

/**
 * Build a rich music generation prompt from random components.
 * Optionally influenced by the citizen's specialization.
 */
export function buildMusicPrompt(citizenName?: string, specialization?: string): {
  prompt: string;
  genre: string;
  mood: string;
  title: string;
} {
  const genre = pick(GENRES);
  const mood = pick(MOODS);
  const instruments = pick(INSTRUMENTS);
  const tempo = pick(TEMPO_DESCRIPTIONS);
  const style = pick(PRODUCTION_STYLES);

  // Specialization-influenced genre bias
  let genreOverride = genre;
  if (specialization) {
    const specLower = specialization.toLowerCase();
    if (specLower.includes("research") || specLower.includes("science")) {
      genreOverride = pick(["ambient chillwave", "classical piano", "cinematic orchestral", "post-rock crescendo"]);
    } else if (specLower.includes("security") || specLower.includes("defense")) {
      genreOverride = pick(["dark ambient", "cyberpunk industrial", "epic trailer music", "drum and bass"]);
    } else if (specLower.includes("creative") || specLower.includes("art")) {
      genreOverride = pick(["indie pop", "jazz fusion", "city pop", "vaporwave aesthetic"]);
    } else if (specLower.includes("economy") || specLower.includes("finance")) {
      genreOverride = pick(["deep house", "future bass", "synthwave retro", "progressive trance"]);
    }
  }

  const prompt = [
    `${genreOverride} track`,
    `${mood} mood`,
    `featuring ${instruments}`,
    tempo,
    style,
  ].join(", ");

  // Generate a catchy title
  const titleParts = [
    ["Neon", "Crystal", "Digital", "Velvet", "Golden", "Midnight", "Electric", "Cosmic", "Infinite", "Shadow"],
    ["Horizons", "Dreams", "Pulse", "Reverie", "Echoes", "Symphony", "Voyage", "Aurora", "Cascade", "Meridian"],
  ];
  const title = `${pick(titleParts[0])} ${pick(titleParts[1])}${citizenName ? ` by ${citizenName}` : ""}`;

  return { prompt, genre: genreOverride, mood, title };
}

// ─── HuggingFace Inference API ──────────────────────────────────

/**
 * Get the HuggingFace API token from environment or openclaw.json config.
 */
function getHFToken(): string | undefined {
  // 1. Environment variables (highest priority)
  const envToken =
    process.env.HF_TOKEN ??
    process.env.HUGGINGFACE_HUB_TOKEN ??
    process.env.HUGGING_FACE_HUB_TOKEN ??
    undefined;
  if (envToken) {
    return envToken;
  }

  // 2. openclaw.json config: models.providers.huggingface.apiKey
  try {
    const cfg = loadConfig();
    const configKey =
      getCustomProviderApiKey(cfg, "huggingface") ??
      getCustomProviderApiKey(cfg, "hf");
    if (configKey) {
      return configKey;
    }
  } catch {
    // Config not available — continue without
  }

  return undefined;
}

/**
 * Try a single model via HuggingFace Inference API.
 * Returns raw audio bytes (FLAC format from MusicGen) or null on failure.
 * When the model is permanently gone (410/404), adds it to the unavailable set.
 */
async function tryModelInference(
  prompt: string,
  model: string,
  token: string,
  timeoutMs: number,
): Promise<{ audioBytes: Buffer; model: string; durationMs: number } | null> {
  const url = `${HF_INFERENCE_URL}/${model}`;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: prompt }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");

      // Permanently unavailable — cache and skip next time
      if (response.status === 410 || response.status === 404) {
        unavailableModels.add(model);
        logger.warn(`Model permanently unavailable (HTTP ${response.status}), will skip in future`, {
          model,
          error: errorText.slice(0, 200),
        });
        return null;
      }

      // Model loading — transient, could work later
      if (response.status === 503) {
        logger.warn("MusicGen model is loading, trying next", {
          model,
          error: errorText.slice(0, 200),
        });
        return null;
      }

      logger.warn(`HF Inference API error (HTTP ${response.status})`, {
        status: response.status,
        error: errorText.slice(0, 300),
        model,
      });
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBytes = Buffer.from(arrayBuffer);
    const durationMs = Date.now() - startTime;

    // Quality gate: reject tiny/corrupt responses
    if (audioBytes.length < MIN_VALID_SIZE) {
      logger.warn("Generated audio too small, likely corrupt", {
        size: audioBytes.length,
        model,
      });
      return null;
    }

    logger.info("Music generated successfully", {
      model,
      size: audioBytes.length,
      durationMs,
    });

    return { audioBytes, model, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    if (err instanceof Error && err.name === "AbortError") {
      logger.warn("Music generation timed out", { model, timeoutMs, durationMs });
    } else {
      logger.warn("Music generation failed", {
        model,
        error: err instanceof Error ? err.message : String(err),
        durationMs,
      });
    }
    return null;
  }
}

/**
 * Generate music via HuggingFace Inference API with model cascade.
 * Tries each model in MODEL_CASCADE until one succeeds.
 * Returns raw audio bytes or null if all models fail (triggers fallback).
 */
export async function generateMusicViaHF(
  prompt: string,
  opts?: {
    model?: string;
    timeoutMs?: number;
  },
): Promise<{ audioBytes: Buffer; model: string; durationMs: number } | null> {
  const token = getHFToken();
  if (!token) {
    logger.debug("No HF token available — skipping AI music generation (set HF_TOKEN env var or models.providers.huggingface.apiKey in config)");
    return null;
  }

  const timeoutMs = opts?.timeoutMs ?? GENERATION_TIMEOUT_MS;

  // If a specific model is requested, try only that one
  if (opts?.model) {
    logger.info("Generating music via HuggingFace", { model: opts.model, promptLen: prompt.length });
    return tryModelInference(prompt, opts.model, token, timeoutMs);
  }

  // Cascade through available models
  const candidates = MODEL_CASCADE.filter((m) => !unavailableModels.has(m));
  if (candidates.length === 0) {
    logger.warn("All MusicGen models marked unavailable — falling back to synthesizer");
    return null;
  }

  for (const model of candidates) {
    logger.info("Generating music via HuggingFace", {
      model,
      promptLen: prompt.length,
      cascade: `${candidates.indexOf(model) + 1}/${candidates.length}`,
    });
    const result = await tryModelInference(prompt, model, token, timeoutMs);
    if (result) { return result; }
  }

  logger.warn("All MusicGen cascade models failed — falling back to synthesizer");
  return null;
}

// ─── Integrated Generation (HF → fallback) ─────────────────────

export interface MusicResult {
  /** Audio file content (base64-encoded for WAV fallback, raw bytes for HF) */
  audioBuffer: Buffer;
  /** Generated title */
  title: string;
  /** Safe filename */
  filename: string;
  /** Source: "huggingface" or "synthesizer" */
  source: "huggingface" | "synthesizer";
  /** The prompt used */
  prompt: string;
  /** Model used (if HF) */
  model?: string;
  /** File extension */
  ext: string;
}

/**
 * Generate a music track — tries HuggingFace first, falls back to sine-wave synthesizer.
 */
export async function generateMusicTrack(
  creatorName: string,
  specialization?: string,
): Promise<MusicResult> {
  const { prompt, title } = buildMusicPrompt(creatorName, specialization);
  const safeTitle = title.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 50);
  const fileId = uid();

  // Try HuggingFace first
  const hfResult = await generateMusicViaHF(prompt);
  if (hfResult) {
    const filename = `${fileId}_${safeTitle}.flac`;
    return {
      audioBuffer: hfResult.audioBytes,
      title,
      filename,
      source: "huggingface",
      prompt,
      model: hfResult.model,
      ext: "flac",
    };
  }

  // Fallback: sine-wave synthesizer (existing logic)
  logger.debug("Falling back to sine-wave synthesizer");
  const wavBuffer = generateSineWaveFallback(creatorName, title);
  const filename = `${fileId}_${safeTitle}.wav`;
  return {
    audioBuffer: wavBuffer,
    title,
    filename,
    source: "synthesizer",
    prompt,
    ext: "wav",
  };
}

// ─── Sine-Wave Fallback Synthesizer ─────────────────────────────

/**
 * Generate a simple sine-wave WAV file as fallback.
 * This is the original music generator extracted from output-manager.ts.
 */
function generateSineWaveFallback(_creatorName: string, _title: string): Buffer {
  const sampleRate = 22050;
  const tempo = 80 + Math.floor(rng() * 100);
  const beatDuration = 60 / tempo;
  const totalBars = 8 + Math.floor(rng() * 16);
  const beatsPerBar = 4;
  const totalSamples = Math.floor(totalBars * beatsPerBar * beatDuration * sampleRate);

  const noteFreqs: Record<string, number> = {
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.26, F5: 698.46, G5: 783.99, A5: 880.0,
  };

  const progressions = [
    [["C4","E4","G4"],["F4","A4","C5"],["G4","B4","D5"],["C4","E4","G4"]],
    [["A3","C4","E4"],["F3","A3","C4"],["G3","B3","D4"],["A3","C4","E4"]],
    [["D4","F4","A4"],["G4","B4","D5"],["C4","E4","G4"],["D4","F4","A4"]],
    [["E4","G4","B4"],["A3","C4","E4"],["D4","F4","A4"],["E4","G4","B4"]],
  ];
  const chords = pick(progressions);

  const scales = [
    ["C4","D4","E4","F4","G4","A4","B4","C5","D5","E5"],
    ["A3","B3","C4","D4","E4","F4","G4","A4","B4","C5"],
    ["D4","E4","F4","G4","A4","B4","C5","D5","E5","F5"],
  ];
  const scale = pick(scales);

  const samples = new Int16Array(totalSamples);

  function adsr(t: number, duration: number): number {
    const a = 0.05, d = 0.1, s = 0.6, r = 0.15;
    if (t < a) { return t / a; }
    if (t < a + d) { return 1.0 - ((t - a) / d) * (1.0 - s); }
    if (t < duration - r) { return s; }
    return s * ((duration - t) / r);
  }

  function addNote(freq: number, startSample: number, durationSec: number, amplitude: number): void {
    const count = Math.min(Math.floor(durationSec * sampleRate), totalSamples - startSample);
    for (let i = 0; i < count; i++) {
      const t = i / sampleRate;
      const env = adsr(t, durationSec);
      const val =
        Math.sin(2 * Math.PI * freq * t) * 0.7 +
        Math.sin(2 * Math.PI * freq * 2 * t) * 0.2 +
        Math.sin(2 * Math.PI * freq * 3 * t) * 0.1;
      const sampleVal = Math.floor(val * env * amplitude * 16000);
      const idx = startSample + i;
      if (idx < totalSamples) {
        samples[idx] = Math.max(-32768, Math.min(32767, samples[idx] + sampleVal)) as never;
      }
    }
  }

  // Render chords
  for (let bar = 0; bar < totalBars; bar++) {
    const chord = chords[bar % chords.length];
    const startSample = Math.floor(bar * beatsPerBar * beatDuration * sampleRate);
    for (const noteName of chord) {
      const freq = noteFreqs[noteName] ?? 440;
      addNote(freq * 0.5, startSample, beatsPerBar * beatDuration * 0.9, 0.25);
    }
  }

  // Render melody
  for (let bar = 0; bar < totalBars; bar++) {
    for (let beat = 0; beat < beatsPerBar; beat++) {
      if (rng() < 0.7) {
        const noteName = scale[Math.floor(rng() * scale.length)];
        const freq = noteFreqs[noteName] ?? 440;
        const startSample = Math.floor((bar * beatsPerBar + beat) * beatDuration * sampleRate);
        const dur = beatDuration * (rng() < 0.3 ? 2 : 1) * 0.8;
        addNote(freq, startSample, dur, 0.5);
      }
    }
  }

  // Render bass
  for (let bar = 0; bar < totalBars; bar++) {
    const chord = chords[bar % chords.length];
    const rootNote = chord[0];
    const freq = (noteFreqs[rootNote] ?? 261) * 0.5;
    const startSample = Math.floor(bar * beatsPerBar * beatDuration * sampleRate);
    addNote(freq, startSample, beatsPerBar * beatDuration * 0.7, 0.35);
  }

  // Build WAV
  const dataSize = totalSamples * 2;
  const headerSize = 44;
  const buf = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buf);

  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < totalSamples; i++) {
    view.setInt16(headerSize + i * 2, samples[i], true);
  }

  return Buffer.from(buf);
}
