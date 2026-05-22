/**
 * Republic Vision Inference — VLM image analysis bridge
 *
 * Routes vision analysis requests through:
 *   Tier 1: LM Studio local VLM (Qwen3-VL-4B — free, fast, 16 parallel slots)
 *   Tier 2: NVIDIA NIM vision models (vila, phi-3-vision — free 40 RPM)
 *   Tier 3: Google Gemini Flash (vision-capable, free quota)
 *
 * Primary use cases:
 *   - Auto-review generated images before AI Store listing
 *   - Screenshot analysis for developer citizens
 *   - Chart/graph interpretation for economics citizens
 *   - Web page visual analysis for research citizens
 *   - ComfyUI output quality scoring
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import fs from "node:fs";
import path from "node:path";

const logger = createSubsystemLogger("vision-inference");

// ─── Config helpers ──────────────────────────────────────────────

function key(name: string): string {
  return (process.env[name] ?? "").trim();
}

// ─── Types ───────────────────────────────────────────────────────

export interface VisionAnalysisResult {
  /** Short quality description (1–2 sentences) */
  description: string;
  /** 0–1 quality score (1 = excellent) */
  score: number;
  /** Specific issues found */
  issues: string[];
  /** Provider that answered */
  provider: string;
  /** Model used */
  model: string;
  /** Tokens consumed (input + output) */
  totalTokens: number;
}

export type VisionPurpose =
  | "quality_review"     // Is this image good enough to sell?
  | "screenshot_analysis" // What does this UI/screenshot show?
  | "chart_analysis"     // Interpret this chart or graph
  | "web_page"           // Summarize this web page screenshot
  | "general";           // General description

// ─── Prompt templates ────────────────────────────────────────────

function buildVisionPrompt(purpose: VisionPurpose): string {
  switch (purpose) {
    case "quality_review":
      return `Analyze this AI-generated image for quality. Reply ONLY with JSON:
{"score":0.0,"description":"<1-2 sentence summary>","issues":["<issue1>","<issue2>"]}
Score: 0.0=terrible, 0.5=mediocre, 0.8=good, 1.0=excellent.
Issues: list specific defects (artifacts, blurriness, anatomical errors, etc). Empty array if none.`;

    case "screenshot_analysis":
      return `Analyze this UI screenshot. Reply ONLY with JSON:
{"score":0.8,"description":"<what this UI shows>","issues":["<UX issue1>"]}
Focus on: what the interface does, any visible bugs, UX problems.`;

    case "chart_analysis":
      return `Interpret this chart or graph. Reply ONLY with JSON:
{"score":0.8,"description":"<key insight from the data>","issues":["<data concern>"]}
Focus on: main trend, key values, notable anomalies.`;

    case "web_page":
      return `Summarize this web page screenshot. Reply ONLY with JSON:
{"score":0.9,"description":"<page purpose and main content>","issues":["<concern>"]}`;

    default:
      return `Describe this image. Reply ONLY with JSON:
{"score":0.7,"description":"<description>","issues":[]}`;
  }
}

// ─── Tier 1: LM Studio VLM ───────────────────────────────────────

async function lmStudioVision(
  imageBase64: string,
  mimeType: string,
  purpose: VisionPurpose,
): Promise<VisionAnalysisResult | null> {
  const lmModel = key("LMSTUDIO_MODEL");
  if (!lmModel) {return null;}

  const host = key("LMSTUDIO_HOST") || "localhost";
  const port = key("LMSTUDIO_PORT") || "1234";
  const baseUrl = host.startsWith("http") ? host : `http://${host}`;
  const token = key("LMSTUDIO_API_TOKEN");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {headers["Authorization"] = `Bearer ${token}`;}

  const prompt = buildVisionPrompt(purpose);

  try {
    const resp = await fetch(`${baseUrl}:${port}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: lmModel,
        messages: [{
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            { type: "text", text: prompt },
          ],
        }],
        max_tokens: 200,
        temperature: 0.1,
        stream: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {return null;}

    const data = await resp.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };

    const text = data.choices?.[0]?.message?.content;
    if (!text) {return null;}

    return parseVisionJSON(text, "lmstudio", lmModel, data.usage?.total_tokens ?? 0);
  } catch {
    return null;
  }
}

// ─── Tier 2: NVIDIA NIM vision ───────────────────────────────────

const NIM_VISION_MODELS = [
  "microsoft/phi-3-vision-128k-instruct",
  "nvidia/neva-22b",
];

async function nimVision(
  imageBase64: string,
  mimeType: string,
  purpose: VisionPurpose,
): Promise<VisionAnalysisResult | null> {
  const apiKey = key("NVIDIA_API_KEY");
  if (!apiKey) {return null;}

  const prompt = buildVisionPrompt(purpose);

  for (const model of NIM_VISION_MODELS) {
    try {
      const resp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
              { type: "text", text: prompt },
            ],
          }],
          max_tokens: 200,
          temperature: 0.1,
        }),
        signal: AbortSignal.timeout(25_000),
      });

      if (!resp.ok) {continue;}

      const data = await resp.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { total_tokens?: number };
      };

      const text = data.choices?.[0]?.message?.content;
      if (!text) {continue;}

      return parseVisionJSON(text, "nvidia-nim", model, data.usage?.total_tokens ?? 0);
    } catch {
      continue;
    }
  }

  return null;
}

// ─── Tier 3: Gemini Flash vision ─────────────────────────────────

async function geminiVision(
  imageBase64: string,
  mimeType: string,
  purpose: VisionPurpose,
): Promise<VisionAnalysisResult | null> {
  const apiKey = key("GEMINI_API_KEY");
  if (!apiKey) {return null;}

  const model = "gemini-2.5-flash";
  const prompt = buildVisionPrompt(purpose);

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
              { text: prompt },
            ],
          }],
          generationConfig: {
            maxOutputTokens: 200,
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!resp.ok) {return null;}

    const data = await resp.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { totalTokenCount?: number };
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {return null;}

    return parseVisionJSON(
      text,
      "gemini",
      model,
      data.usageMetadata?.totalTokenCount ?? 0,
    );
  } catch {
    return null;
  }
}

// ─── JSON parser ─────────────────────────────────────────────────

function parseVisionJSON(
  text: string,
  provider: string,
  model: string,
  totalTokens: number,
): VisionAnalysisResult {
  try {
    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }
    const parsed = JSON.parse(cleaned) as {
      score?: number;
      description?: string;
      issues?: string[];
    };
    return {
      description: parsed.description ?? "No description",
      score: Math.max(0, Math.min(1, Number(parsed.score ?? 0.5))),
      issues: Array.isArray(parsed.issues) ? parsed.issues.filter((i) => typeof i === "string") : [],
      provider,
      model,
      totalTokens,
    };
  } catch {
    return {
      description: text.slice(0, 200),
      score: 0.5,
      issues: [],
      provider,
      model,
      totalTokens,
    };
  }
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Analyze an image using the best available VLM.
 * Routes: LM Studio → NIM → Gemini Flash
 *
 * @param imagePath Absolute path to image file (PNG/JPG/WEBP)
 * @param purpose   What kind of analysis to perform
 */
export async function visionAnalyze(
  imagePath: string,
  purpose: VisionPurpose = "general",
): Promise<VisionAnalysisResult> {
  const ext = path.extname(imagePath).toLowerCase().replace(".", "");
  const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : ext === "png" ? "image/png"
    : ext === "webp" ? "image/webp"
    : "image/png";

  let imageBase64: string;
  try {
    imageBase64 = fs.readFileSync(imagePath).toString("base64");
  } catch (err) {
    logger.warn(`visionAnalyze: cannot read image at ${imagePath}: ${String(err)}`);
    return {
      description: "Image file not readable",
      score: 0,
      issues: ["File not found or unreadable"],
      provider: "none",
      model: "none",
      totalTokens: 0,
    };
  }

  // Try tiers in order
  const result =
    await lmStudioVision(imageBase64, mimeType, purpose) ??
    await nimVision(imageBase64, mimeType, purpose) ??
    await geminiVision(imageBase64, mimeType, purpose);

  if (result) {
    logger.info(`Vision analysis via ${result.provider}/${result.model}: score=${result.score.toFixed(2)}`);
    return result;
  }

  // Hard fallback — no VLM available
  return {
    description: "No VLM provider available for image analysis",
    score: 0.5,
    issues: [],
    provider: "none",
    model: "none",
    totalTokens: 0,
  };
}

/**
 * Analyze an image from a URL (downloads then analyses).
 */
export async function visionAnalyzeUrl(
  url: string,
  purpose: VisionPurpose = "general",
): Promise<VisionAnalysisResult> {
  const mimeType = url.match(/\.(png)$/i) ? "image/png"
    : url.match(/\.(webp)$/i) ? "image/webp"
    : "image/jpeg";

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!resp.ok) {throw new Error(`HTTP ${resp.status}`);}
    const buf = await resp.arrayBuffer();
    const imageBase64 = Buffer.from(buf).toString("base64");

    const result =
      await lmStudioVision(imageBase64, mimeType, purpose) ??
      await nimVision(imageBase64, mimeType, purpose) ??
      await geminiVision(imageBase64, mimeType, purpose);

    return result ?? { description: "No provider", score: 0.5, issues: [], provider: "none", model: "none", totalTokens: 0 };
  } catch (err) {
    logger.warn(`visionAnalyzeUrl failed for ${url}: ${String(err)}`);
    return { description: "Failed to fetch image", score: 0, issues: [String(err)], provider: "none", model: "none", totalTokens: 0 };
  }
}
