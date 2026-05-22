/**
 * Republic Platform — Cloud Media Inference (March 2026)
 *
 * Unified client for media generation via cloud APIs.
 * These are used as fallbacks when local GPU plugins are not available.
 *
 * Supported providers and capabilities:
 *
 * ┌─────────────┬──────────────┬───────────────┬──────────────┬─────────┐
 * │ Capability   │ HuggingFace  │ NVIDIA NIM    │ Gemini       │ OpenAI  │
 * ├─────────────┼──────────────┼───────────────┼──────────────┼─────────┤
 * │ Text→Image  │ SD3.5, FLUX  │ SD3.5         │ Imagen 3     │ DALL-E 3│
 * │ Text→Video  │ damo t2v     │ Cosmos        │ Veo 2        │   —     │
 * │ Text→Speech │ SpeechT5     │ Parakeet      │   —          │ TTS     │
 * │ Text→Music  │ MusicGen     │   —           │   —          │   —     │
 * │ Text→3D     │   —          │ Edify-3D      │   —          │   —     │
 * │ Speech→Text │ Whisper      │ Parakeet-CTC  │   —          │ Whisper │
 * │ Translation │ NLLB         │   —           │   —          │   —     │
 * └─────────────┴──────────────┴───────────────┴──────────────┴─────────┘
 *
 * Fallback chain per capability:
 *   Plugin (local GPU) → HuggingFace → NVIDIA NIM → Gemini → OpenAI → Placeholder
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { uid } from "./utils.js";

const logger = createSubsystemLogger("republic:cloud-media");

// ─── Configuration ──────────────────────────────────────────────

const key = (name: string) => process.env[name] || "";

const HF_INFERENCE_URL = "https://api-inference.huggingface.co/models";
const NIM_API_URL = "https://integrate.api.nvidia.com/v1";
const NIM_ASSET_URL = "https://ai.api.nvidia.com/v1";
const TIMEOUT_MS = 120_000; // 2 min for media generation
const MIN_VALID_SIZE = 1_000; // 1KB minimum for valid media output

const OUTPUT_BASE = path.join(process.cwd(), "republic-output");

// ─── Provider Availability ──────────────────────────────────────

export function isHFAvailable(): boolean {
  return key("HF_TOKEN").length > 0 || key("HUGGINGFACE_HUB_TOKEN").length > 0;
}
export function isNIMAvailable(): boolean {
  return key("NVIDIA_API_KEY").length > 0;
}
export function isGeminiMediaAvailable(): boolean {
  return key("GEMINI_API_KEY").length > 0;
}
export function isOpenAIMediaAvailable(): boolean {
  return key("OPENAI_API_KEY").length > 0;
}
export function isElevenLabsAvailable(): boolean {
  return key("ELEVENLABS_API_KEY").length > 0;
}

function hfToken(): string {
  return key("HF_TOKEN") || key("HUGGINGFACE_HUB_TOKEN");
}

// ─── Generic Fetch Helpers ──────────────────────────────────────

async function hfInfer(model: string, payload: unknown, binary = true): Promise<Buffer | null> {
  if (!isHFAvailable()) { return null; }
  try {
    const response = await fetch(`${HF_INFERENCE_URL}/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn(`HF ${model} error: ${response.status}`);
      return null;
    }
    if (binary) {
      const buf = Buffer.from(await response.arrayBuffer());
      return buf.length >= MIN_VALID_SIZE ? buf : null;
    }
    const data = await response.json();
    return Buffer.from(JSON.stringify(data));
  } catch (err) {
    logger.warn(`HF ${model} failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}



function ensureOutputDir(category: string): string {
  const dir = path.join(OUTPUT_BASE, category);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── TEXT → IMAGE ───────────────────────────────────────────────

export interface ImageGenResult {
  success: boolean;
  provider: string;
  outputPath?: string;
  error?: string;
}

/**
 * Generate image via cloud APIs. Fallback: HF → NIM → Gemini → OpenAI
 */
export async function cloudImageGeneration(
  prompt: string,
  opts?: { width?: number; height?: number; model?: string; allowCloud?: boolean },
): Promise<ImageGenResult> {
  const w = opts?.width ?? 1024;
  const h = opts?.height ?? 1024;
  const allowCloud = opts?.allowCloud ?? false;
  const filename = `${uid()}_cloud_image.png`;
  const outputDir = ensureOutputDir("art");
  const outputPath = path.join(outputDir, filename);

  // 1. HuggingFace — FLUX.1 Dev (high quality, open-weight)
  // NOTE: FLUX.1-schnell returned HTTP 410 (Gone) as of March 2026.
  const hfModel = opts?.model ?? "black-forest-labs/FLUX.1-dev";
  const hfBuf = await hfInfer(hfModel, {
    inputs: prompt,
    parameters: { width: w, height: h },
  });
  if (hfBuf) {
    fs.writeFileSync(outputPath, hfBuf);
    logger.info("Image generated via HuggingFace", { model: hfModel, size: hfBuf.length });
    return { success: true, provider: `HuggingFace/${hfModel}`, outputPath };
  }

  // 2. NVIDIA NIM — Stable Diffusion 3.5
  if (isNIMAvailable()) {
    try {
      const nimResp = await fetch(`${NIM_ASSET_URL}/nvidia/stable-diffusion-3-5-large`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key("NVIDIA_API_KEY")}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          prompt,
          width: w,
          height: h,
          steps: 30,
          cfg_scale: 7,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (nimResp.ok) {
        const data = (await nimResp.json()) as { artifacts?: Array<{ base64?: string }> };
        const b64 = data.artifacts?.[0]?.base64;
        if (b64) {
          fs.writeFileSync(outputPath, Buffer.from(b64, "base64"));
          logger.info("Image generated via NIM SD3.5");
          return { success: true, provider: "NVIDIA/SD3.5", outputPath };
        }
      }
    } catch { /* fall through */ }
  }

  // 3. Gemini Imagen 3
  if (isGeminiMediaAvailable()) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${key("GEMINI_API_KEY")}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: { sampleCount: 1, aspectRatio: w === h ? "1:1" : "16:9" },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (resp.ok) {
        const data = (await resp.json()) as { predictions?: Array<{ bytesBase64Encoded?: string }> };
        const b64 = data.predictions?.[0]?.bytesBase64Encoded;
        if (b64) {
          fs.writeFileSync(outputPath, Buffer.from(b64, "base64"));
          logger.info("Image generated via Gemini Imagen 3");
          return { success: true, provider: "Gemini/Imagen3", outputPath };
        }
      }
    } catch { /* fall through */ }
  }

  // 4. OpenAI DALL-E 3
  // DALL-E 3 is restricted to user-initiated tasks (allowCloud) or explicit env variable opt-in
  const allowDalleAutonomous = process.env.ALLOW_DALLE_AUTONOMOUS === "1";
  if (isOpenAIMediaAvailable() && (allowCloud || allowDalleAutonomous)) {
    try {
      const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key("OPENAI_API_KEY")}`,
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt,
          n: 1,
          size: w >= 1792 || h >= 1792 ? "1792x1024" : w >= 1024 ? "1024x1024" : "1024x1024",
          response_format: "b64_json",
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { data?: Array<{ b64_json?: string }> };
        const b64 = data.data?.[0]?.b64_json;
        if (b64) {
          fs.writeFileSync(outputPath, Buffer.from(b64, "base64"));
          logger.info("Image generated via OpenAI DALL-E 3");
          return { success: true, provider: "OpenAI/DALL-E-3", outputPath };
        }
      }
    } catch { /* fall through */ }
  }

  return { success: false, provider: "none", error: "All image providers failed or unavailable" };
}

// ─── TEXT → VIDEO ───────────────────────────────────────────────

export interface VideoGenResult {
  success: boolean;
  provider: string;
  outputPath?: string;
  jobId?: string;
  error?: string;
}

/**
 * Generate video via cloud APIs. Fallback: HF → NIM Cosmos
 */
export async function cloudVideoGeneration(
  prompt: string,
  opts?: { duration?: number; model?: string },
): Promise<VideoGenResult> {
  const filename = `${uid()}_cloud_video.mp4`;
  const outputDir = ensureOutputDir("video");
  const outputPath = path.join(outputDir, filename);

  // 1. HuggingFace — text-to-video
  const hfModel = opts?.model ?? "damo-vilab/text-to-video-ms-1.7b";
  const hfBuf = await hfInfer(hfModel, { inputs: prompt });
  if (hfBuf) {
    fs.writeFileSync(outputPath, hfBuf);
    logger.info("Video generated via HuggingFace", { model: hfModel, size: hfBuf.length });
    return { success: true, provider: `HuggingFace/${hfModel}`, outputPath };
  }

  // 2. NVIDIA NIM — Cosmos video generation
  if (isNIMAvailable()) {
    try {
      const resp = await fetch(`${NIM_API_URL}/video/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key("NVIDIA_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "nvidia/cosmos-1.0-generate-7b-video",
          prompt,
          duration: opts?.duration ?? 5,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
        const entry = data.data?.[0];
        if (entry?.b64_json) {
          fs.writeFileSync(outputPath, Buffer.from(entry.b64_json, "base64"));
          logger.info("Video generated via NIM Cosmos");
          return { success: true, provider: "NVIDIA/Cosmos", outputPath };
        }
        if (entry?.url) {
          return { success: true, provider: "NVIDIA/Cosmos", outputPath: entry.url };
        }
      }
    } catch { /* fall through */ }
  }

  return { success: false, provider: "none", error: "All video providers failed or unavailable" };
}

// ─── TEXT → SPEECH ──────────────────────────────────────────────

export interface TTSResult {
  success: boolean;
  provider: string;
  outputPath?: string;
  error?: string;
}

/**
 * Generate speech via cloud APIs. Fallback: ElevenLabs → HF → NIM → OpenAI
 */
export async function cloudTTS(
  text: string,
  opts?: { voice?: string; model?: string },
): Promise<TTSResult> {
  const filename = `${uid()}_cloud_tts.mp3`;
  const outputDir = ensureOutputDir("audio");
  const outputPath = path.join(outputDir, filename);

  // 1. ElevenLabs (highest quality)
  if (isElevenLabsAvailable()) {
    try {
      const voiceId = opts?.voice ?? "21m00Tcm4TlvDq8ikWAM"; // Rachel
      const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "xi-api-key": key("ELEVENLABS_API_KEY"),
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: opts?.model ?? "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.length >= MIN_VALID_SIZE) {
          fs.writeFileSync(outputPath, buf);
          logger.info("TTS generated via ElevenLabs", { size: buf.length });
          return { success: true, provider: "ElevenLabs", outputPath };
        }
      }
    } catch { /* fall through */ }
  }

  // 2. HuggingFace — SpeechT5
  const hfBuf = await hfInfer("microsoft/speecht5_tts", { inputs: text });
  if (hfBuf) {
    const wavPath = outputPath.replace(".mp3", ".wav");
    fs.writeFileSync(wavPath, hfBuf);
    logger.info("TTS generated via HuggingFace SpeechT5");
    return { success: true, provider: "HuggingFace/SpeechT5", outputPath: wavPath };
  }

  // 3. NVIDIA NIM — Parakeet TTS
  if (isNIMAvailable()) {
    try {
      const resp = await fetch(`${NIM_ASSET_URL}/nvidia/parakeet-tdt-0.6b-v2`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key("NVIDIA_API_KEY")}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { audio?: string };
        if (data.audio) {
          const wavPath = outputPath.replace(".mp3", ".wav");
          fs.writeFileSync(wavPath, Buffer.from(data.audio, "base64"));
          logger.info("TTS generated via NIM Parakeet");
          return { success: true, provider: "NVIDIA/Parakeet", outputPath: wavPath };
        }
      }
    } catch { /* fall through */ }
  }

  // 4. OpenAI TTS
  if (isOpenAIMediaAvailable()) {
    try {
      const resp = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key("OPENAI_API_KEY")}`,
        },
        body: JSON.stringify({
          model: "tts-1-hd",
          voice: opts?.voice ?? "alloy",
          input: text,
          response_format: "mp3",
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.length >= MIN_VALID_SIZE) {
          fs.writeFileSync(outputPath, buf);
          logger.info("TTS generated via OpenAI");
          return { success: true, provider: "OpenAI/TTS-HD", outputPath };
        }
      }
    } catch { /* fall through */ }
  }

  return { success: false, provider: "none", error: "All TTS providers failed or unavailable" };
}

// ─── SPEECH → TEXT ──────────────────────────────────────────────

export interface STTResult {
  success: boolean;
  provider: string;
  text?: string;
  error?: string;
}

/**
 * Transcribe speech via cloud APIs. Fallback: HF Whisper → OpenAI Whisper
 */
export async function cloudSTT(
  audioBuffer: Buffer,
  opts?: { language?: string },
): Promise<STTResult> {
  // 1. HuggingFace — Whisper Large V3
  if (isHFAvailable()) {
    try {
      const resp = await fetch(`${HF_INFERENCE_URL}/openai/whisper-large-v3`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hfToken()}`,
          "Content-Type": "audio/flac",
        },
        body: new Uint8Array(audioBuffer),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { text?: string };
        if (data.text) {
          logger.info("STT via HF Whisper", { textLen: data.text.length });
          return { success: true, provider: "HuggingFace/Whisper-V3", text: data.text };
        }
      }
    } catch { /* fall through */ }
  }

  // 2. OpenAI Whisper
  if (isOpenAIMediaAvailable()) {
    try {
      const formData = new FormData();
      formData.append("file", new Blob([new Uint8Array(audioBuffer)], { type: "audio/wav" }), "audio.wav");
      formData.append("model", "whisper-1");
      if (opts?.language) { formData.append("language", opts.language); }
      const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key("OPENAI_API_KEY")}`,
        },
        body: formData,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { text?: string };
        if (data.text) {
          return { success: true, provider: "OpenAI/Whisper", text: data.text };
        }
      }
    } catch { /* fall through */ }
  }

  return { success: false, provider: "none", error: "All STT providers failed" };
}

// ─── TEXT → 3D ──────────────────────────────────────────────────

export interface Gen3DResult {
  success: boolean;
  provider: string;
  outputPath?: string;
  error?: string;
}

/**
 * Generate 3D model via cloud APIs. Primary: NVIDIA Edify-3D
 */
export async function cloud3DGeneration(
  prompt: string,
): Promise<Gen3DResult> {
  const filename = `${uid()}_cloud_3d.glb`;
  const outputDir = ensureOutputDir("3d-models");
  const outputPath = path.join(outputDir, filename);

  // NVIDIA NIM — Edify-3D
  if (isNIMAvailable()) {
    try {
      const resp = await fetch(`${NIM_ASSET_URL}/nvidia/edify-3d`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key("NVIDIA_API_KEY")}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ prompt, output_format: "glb" }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { model_data?: string };
        if (data.model_data) {
          fs.writeFileSync(outputPath, Buffer.from(data.model_data, "base64"));
          logger.info("3D model generated via NIM Edify-3D");
          return { success: true, provider: "NVIDIA/Edify-3D", outputPath };
        }
      }
    } catch { /* fall through */ }
  }

  return { success: false, provider: "none", error: "No 3D providers available" };
}

// ─── Translation ────────────────────────────────────────────────

export interface TranslationResult {
  success: boolean;
  provider: string;
  text?: string;
  error?: string;
}

/**
 * Translate text via HuggingFace NLLB-200 (200 languages)
 */
export async function cloudTranslation(
  text: string,
  targetLang: string,
  sourceLang?: string,
): Promise<TranslationResult> {
  if (!isHFAvailable()) {
    return { success: false, provider: "none", error: "No HF token" };
  }
  try {
    const resp = await fetch(`${HF_INFERENCE_URL}/facebook/nllb-200-distilled-600M`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${hfToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: text,
        parameters: {
          src_lang: sourceLang ?? "eng_Latn",
          tgt_lang: targetLang,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (resp.ok) {
      const data = (await resp.json()) as Array<{ translation_text?: string }>;
      const translated = data[0]?.translation_text;
      if (translated) {
        return { success: true, provider: "HuggingFace/NLLB-200", text: translated };
      }
    }
  } catch { /* fall through */ }
  return { success: false, provider: "none", error: "Translation failed" };
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface CloudMediaDiagnostics {
  providers: Record<string, boolean>;
  capabilities: string[];
}

export function getCloudMediaDiagnostics(): CloudMediaDiagnostics {
  const providers: Record<string, boolean> = {
    huggingface: isHFAvailable(),
    nvidiaNim: isNIMAvailable(),
    gemini: isGeminiMediaAvailable(),
    openai: isOpenAIMediaAvailable(),
    elevenlabs: isElevenLabsAvailable(),
  };

  const capabilities: string[] = [];
  if (isHFAvailable()) {
    capabilities.push("hf:text-to-image", "hf:text-to-video", "hf:text-to-speech", "hf:text-to-music", "hf:speech-to-text", "hf:translation");
  }
  if (isNIMAvailable()) {
    capabilities.push("nim:text-to-image", "nim:text-to-video", "nim:text-to-speech", "nim:text-to-3d");
  }
  if (isGeminiMediaAvailable()) {
    capabilities.push("gemini:text-to-image");
  }
  if (isOpenAIMediaAvailable()) {
    capabilities.push("openai:text-to-image", "openai:text-to-speech", "openai:speech-to-text");
  }
  if (isElevenLabsAvailable()) {
    capabilities.push("elevenlabs:text-to-speech");
  }

  return { providers, capabilities };
}
