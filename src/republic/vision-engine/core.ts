/**
 * Vision Engine — Core Orchestrator
 *
 * Routes image analysis requests through the best available vision model.
 * Fallback chain: Gemma 4 → Ollama (LLaVA) → Gemini Flash → OpenAI → pixel analysis
 *
 * Supports: describe, OCR, chart analysis, screenshot understanding,
 * object detection, comparison, classification, text extraction, Q&A
 */

import type { VisionAction, VisionRequest, VisionResponse, VisionDiagnostics } from "./types.js";
import {
  ollamaVision,
  geminiVision,
  openaiVision,
  getAvailableVisionProviders,
  isVisionProviderAvailable,
} from "./providers.js";

// ─── Stats ───────────────────────────────────────────────────────

interface ProviderStat {
  requests: number;
  totalLatencyMs: number;
  errors: number;
}
const stats: Record<string, ProviderStat> = {};
let totalRequests = 0;

function trackSuccess(provider: string, latencyMs: number): void {
  const s = (stats[provider] ??= { requests: 0, totalLatencyMs: 0, errors: 0 });
  s.requests++;
  s.totalLatencyMs += latencyMs;
  totalRequests++;
}

function trackError(provider: string): void {
  const s = (stats[provider] ??= { requests: 0, totalLatencyMs: 0, errors: 0 });
  s.errors++;
  totalRequests++;
}

// ─── Prompt Builder ──────────────────────────────────────────────

const ACTION_PROMPTS: Record<VisionAction, (req: VisionRequest) => string> = {
  describe: () =>
    "Describe this image in detail. Include: main subject, setting, colors, mood, notable elements. Be specific and comprehensive.",
  ocr: (req) =>
    `Extract ALL text visible in this image. Preserve layout and formatting. Language: ${req.language ?? "auto-detect"}.`,
  analyze_chart: () =>
    "Analyze this chart/graph. Identify: chart type, axes labels, data series, key trends, notable data points. Provide a structured summary.",
  screenshot: () =>
    "Analyze this screenshot. Identify: application/website name, UI elements visible, main content, any errors or notifications, layout structure.",
  objects: () =>
    "List all distinct objects visible in this image. For each object, provide: name, approximate position (top/center/bottom, left/center/right), and relative size.",
  compare: () =>
    "Compare these two images. Describe: similarities, differences, what changed between them. Be specific about visual differences.",
  classify: () =>
    "Classify this image. Provide: primary category, subcategories, tags, content type (photo/illustration/screenshot/document), estimated era, and confidence level.",
  extract_text: (req) =>
    `Extract and structure all text from this image into ${req.language === "ar" ? "Arabic" : "English"}. Output as clean formatted text.`,
  qa: (req) => req.question ?? "What do you see in this image?",
};

function buildPrompt(req: VisionRequest): string {
  const builder = ACTION_PROMPTS[req.action];
  return builder(req);
}

// ─── Core Vision Function ────────────────────────────────────────

/**
 * Analyze an image using the best available vision model.
 * Falls through providers until one succeeds.
 */
export async function analyzeImage(req: VisionRequest): Promise<VisionResponse> {
  const prompt = buildPrompt(req);
  const imageData = req.image;

  // If a specific provider is requested, use it directly
  if (req.provider && req.provider !== "local") {
    return callProvider(req.provider, imageData, prompt);
  }

  // Auto-select: try providers in priority order
  const providers = getAvailableVisionProviders().filter((p) => p !== "local");

  for (const provider of providers) {
    try {
      const result = await callProvider(provider, imageData, prompt);
      trackSuccess(provider, result.latencyMs);
      return result;
    } catch {
      trackError(provider);
      // Fall through to next provider
    }
  }

  // Final fallback: return a structured "no vision available" message
  return {
    provider: "local",
    model: "fallback",
    text: "⚠️ No vision model available. Install a multimodal model via Ollama (e.g., `ollama pull gemma4`) or set GEMINI_API_KEY / OPENAI_API_KEY for cloud vision.",
    confidence: 0,
    latencyMs: 0,
  };
}

async function callProvider(
  provider: string,
  imageBase64: string,
  prompt: string,
): Promise<VisionResponse> {
  switch (provider) {
    case "gemma4":
      return ollamaVision(imageBase64, prompt, "gemma4:latest");
    case "ollama":
      return ollamaVision(imageBase64, prompt);
    case "gemini":
      return geminiVision(imageBase64, prompt);
    case "openai":
      return openaiVision(imageBase64, prompt);
    default:
      throw new Error(`Unknown vision provider: ${provider}`);
  }
}

// ─── Convenience Functions ───────────────────────────────────────

/** Describe an image using AI vision */
export async function describeImage(imageBase64: string): Promise<string> {
  const result = await analyzeImage({ image: imageBase64, action: "describe" });
  return result.text;
}

/** Extract text from an image via AI OCR */
export async function ocrImage(imageBase64: string, language?: string): Promise<string> {
  const result = await analyzeImage({ image: imageBase64, action: "ocr", language });
  return result.text;
}

/** Analyze a chart/graph image */
export async function analyzeChart(imageBase64: string): Promise<string> {
  const result = await analyzeImage({ image: imageBase64, action: "analyze_chart" });
  return result.text;
}

/** Analyze a screenshot */
export async function analyzeScreenshot(imageBase64: string): Promise<string> {
  const result = await analyzeImage({ image: imageBase64, action: "screenshot" });
  return result.text;
}

/** Ask a question about an image */
export async function askAboutImage(imageBase64: string, question: string): Promise<string> {
  const result = await analyzeImage({ image: imageBase64, action: "qa", question });
  return result.text;
}

// ─── Diagnostics ─────────────────────────────────────────────────

export function getVisionDiagnostics(): VisionDiagnostics {
  const available = getAvailableVisionProviders();
  const allStats = Object.entries(stats);
  const totalLatency = allStats.reduce((s, [, v]) => s + v.totalLatencyMs, 0);
  const totalReqs = allStats.reduce((s, [, v]) => s + v.requests, 0);
  const totalErrs = allStats.reduce((s, [, v]) => s + v.errors, 0);

  const providerStats: VisionDiagnostics["providerStats"] = {};
  for (const [key, val] of allStats) {
    providerStats[key] = {
      requests: val.requests,
      avgLatencyMs: val.requests > 0 ? Math.round(val.totalLatencyMs / val.requests) : 0,
      errors: val.errors,
    };
  }

  return {
    availableProviders: available,
    totalRequests,
    avgLatencyMs: totalReqs > 0 ? Math.round(totalLatency / totalReqs) : 0,
    successRate: totalRequests > 0 ? (totalRequests - totalErrs) / totalRequests : 1,
    providerStats,
  };
}

/** Check if any AI vision model is available */
export function isVisionAvailable(): boolean {
  return getAvailableVisionProviders().some((p) => p !== "local" && isVisionProviderAvailable(p));
}
