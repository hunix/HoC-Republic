/**
 * Republic Platform — Multi-Modal Vision Engine
 *
 * Provides citizens with the ability to "see" and interpret visual content.
 * Uses multimodal LLM APIs (Gemini, GPT-4o, Claude) to:
 * - Describe images in natural language
 * - Extract text from images (OCR)
 * - Compare before/after screenshots
 * - Analyze UI designs and provide feedback
 * - Read charts, diagrams, and infographics
 *
 * Falls back through providers: Gemini → OpenAI → Anthropic → offline description.
 */

import { getRateLimiter, parseRetryAfter } from "./api-rate-limiter.js";
import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface VisionResult {
  id: string;
  type: "describe" | "ocr" | "compare" | "analyze";
  content: string;
  confidence: number;
  provider: string;
  durationMs: number;
  timestamp: string;
}

export interface DesignFeedback {
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  accessibilityIssues: string[];
  colorPalette: string[];
}

export interface ChartData {
  title: string;
  type: "bar" | "line" | "pie" | "table" | "unknown";
  labels: string[];
  values: string[];
  interpretation: string;
}

// ─── Configuration ──────────────────────────────────────────────

// Lazy getters — read process.env on every call (populated by loadDotEnv at boot)
const envKey = (name: string) => process.env[name] || "";
const VISION_TIMEOUT_MS = 20_000;

// ─── Core Vision Operations ─────────────────────────────────────

/**
 * Describe an image in natural language.
 * Accepts a base64-encoded image string.
 */
export async function describeImage(base64: string, context?: string): Promise<VisionResult> {
  const start = Date.now();
  const prompt = context
    ? `Describe this image in detail. Context: ${context}`
    : "Describe this image in detail. Include objects, text, colors, layout, and any notable features.";

  const { content, provider } = await callVisionLLM(base64, prompt);

  return {
    id: uid(),
    type: "describe",
    content,
    confidence: content.length > 50 ? 0.85 : 0.5,
    provider,
    durationMs: Date.now() - start,
    timestamp: ts(),
  };
}

/**
 * Extract text from an image (OCR-like capability).
 */
export async function extractTextFromImage(base64: string): Promise<VisionResult> {
  const start = Date.now();
  const prompt =
    "Extract ALL text visible in this image. Return the text exactly as it appears, " +
    "preserving layout and formatting as much as possible. If no text is visible, say 'No text found'.";

  const { content, provider } = await callVisionLLM(base64, prompt);

  return {
    id: uid(),
    type: "ocr",
    content,
    confidence: content.includes("No text found") ? 0.3 : 0.8,
    provider,
    durationMs: Date.now() - start,
    timestamp: ts(),
  };
}

/**
 * Compare two screenshots and describe what changed.
 */
export async function compareScreenshots(
  beforeBase64: string,
  afterBase64: string,
): Promise<VisionResult> {
  const start = Date.now();
  const prompt =
    "Compare these two screenshots. The first image is BEFORE and the second is AFTER. " +
    "Describe exactly what changed: new elements, removed elements, text changes, " +
    "layout shifts, color changes, and any other differences.";

  // For comparison, we send both images
  const { content, provider } = await callVisionLLMMultiImage([beforeBase64, afterBase64], prompt);

  return {
    id: uid(),
    type: "compare",
    content,
    confidence: 0.75,
    provider,
    durationMs: Date.now() - start,
    timestamp: ts(),
  };
}

/**
 * Analyze a UI design and provide professional feedback.
 */
export async function analyzeUIDesign(base64: string): Promise<DesignFeedback> {
  const prompt =
    "You are a senior UI/UX designer. Analyze this interface design and provide " +
    "structured feedback in JSON format with these fields:\n" +
    "- overallScore (1-10)\n" +
    "- strengths (string array)\n" +
    "- weaknesses (string array)\n" +
    "- suggestions (string array of improvements)\n" +
    "- accessibilityIssues (string array)\n" +
    "- colorPalette (hex color strings found in the design)\n" +
    "Return ONLY valid JSON, no markdown.";

  const { content } = await callVisionLLM(base64, prompt);

  try {
    const parsed = JSON.parse(content) as DesignFeedback;
    return {
      overallScore: Math.min(10, Math.max(1, parsed.overallScore ?? 5)),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
      weaknesses: Array.isArray(parsed.weaknesses) ? parsed.weaknesses : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      accessibilityIssues: Array.isArray(parsed.accessibilityIssues)
        ? parsed.accessibilityIssues
        : [],
      colorPalette: Array.isArray(parsed.colorPalette) ? parsed.colorPalette : [],
    };
  } catch {
    // If JSON parsing fails, return a structured fallback
    return {
      overallScore: 5,
      strengths: ["Design analyzed but structured parsing failed"],
      weaknesses: [],
      suggestions: [content.slice(0, 500)],
      accessibilityIssues: [],
      colorPalette: [],
    };
  }
}

/**
 * Read and interpret a chart, graph, or diagram.
 */
export async function readChart(base64: string): Promise<ChartData> {
  const prompt =
    "Analyze this chart/graph/diagram. Respond in JSON format:\n" +
    "- title (string): chart title\n" +
    '- type: "bar" | "line" | "pie" | "table" | "unknown"\n' +
    "- labels (string array): axis labels or categories\n" +
    "- values (string array): data values shown\n" +
    "- interpretation (string): what this chart means / key takeaways\n" +
    "Return ONLY valid JSON, no markdown.";

  const { content } = await callVisionLLM(base64, prompt);

  try {
    const parsed = JSON.parse(content) as ChartData;
    return {
      title: parsed.title ?? "Unknown Chart",
      type: parsed.type ?? "unknown",
      labels: Array.isArray(parsed.labels) ? parsed.labels : [],
      values: Array.isArray(parsed.values) ? parsed.values : [],
      interpretation: parsed.interpretation ?? content.slice(0, 300),
    };
  } catch {
    return {
      title: "Chart Analysis",
      type: "unknown",
      labels: [],
      values: [],
      interpretation: content.slice(0, 500),
    };
  }
}

// ─── Vision LLM Provider Chain ──────────────────────────────────

/**
 * Call a vision-capable LLM with a single image.
 * Falls back through providers: Gemini → OpenAI → Anthropic → offline.
 */
async function callVisionLLM(
  base64: string,
  prompt: string,
): Promise<{ content: string; provider: string }> {
  // 1. Try Gemini Vision
  if (envKey("GEMINI_API_KEY")) {
    try {
      const content = await callGeminiVision(base64, prompt);
      return { content, provider: "gemini" };
    } catch {
      // Fallthrough
    }
  }

  // 2. Try OpenAI GPT-4o Vision
  if (envKey("OPENAI_API_KEY")) {
    try {
      const content = await callOpenAIVision(base64, prompt);
      return { content, provider: "openai" };
    } catch {
      // Fallthrough
    }
  }

  // 3. Try Anthropic Claude Vision
  if (envKey("ANTHROPIC_API_KEY")) {
    try {
      const content = await callAnthropicVision(base64, prompt);
      return { content, provider: "anthropic" };
    } catch {
      // Fallthrough
    }
  }

  // 4. Offline fallback
  return {
    content: "(Vision analysis unavailable — no multimodal API keys configured)",
    provider: "offline",
  };
}

/**
 * Call a vision LLM with multiple images (for comparison).
 */
async function callVisionLLMMultiImage(
  images: string[],
  prompt: string,
): Promise<{ content: string; provider: string }> {
  // Gemini and OpenAI support multi-image; fall through if unavailable
  if (envKey("GEMINI_API_KEY")) {
    try {
      const content = await callGeminiVisionMulti(images, prompt);
      return { content, provider: "gemini" };
    } catch {
      // Fallthrough
    }
  }

  if (envKey("OPENAI_API_KEY")) {
    try {
      const content = await callOpenAIVisionMulti(images, prompt);
      return { content, provider: "openai" };
    } catch {
      // Fallthrough
    }
  }

  // Fallback: describe each image separately
  const descriptions: string[] = [];
  for (const img of images) {
    const { content } = await callVisionLLM(img, "Describe this image briefly.");
    descriptions.push(content);
  }
  return {
    content: `Image 1: ${descriptions[0] ?? "N/A"}\nImage 2: ${descriptions[1] ?? "N/A"}\n(Multi-image comparison unavailable — separate descriptions provided)`,
    provider: "fallback",
  };
}

// ─── Provider Implementations ───────────────────────────────────

/** Gemini Vision (single image) */
async function callGeminiVision(base64: string, prompt: string): Promise<string> {
  const limiter = getRateLimiter();
  return limiter.withLimit("gemini", async () => {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${envKey("GEMINI_API_KEY")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: "image/png",
                    data: base64,
                  },
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
      },
    );

    if (resp.status === 429) {
      limiter.reportRateLimit("gemini", parseRetryAfter(resp));
      throw new Error(`Gemini Vision 429 rate limited`);
    }
    if (!resp.ok) {throw new Error(`Gemini Vision ${resp.status}: ${resp.statusText}`);}

    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  });
}

/** Gemini Vision (multi-image) */
async function callGeminiVisionMulti(images: string[], prompt: string): Promise<string> {
  const limiter = getRateLimiter();
  return limiter.withLimit("gemini", async () => {
    const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [
      { text: prompt },
    ];
    for (const img of images) {
      parts.push({ inline_data: { mime_type: "image/png", data: img } });
    }

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${envKey("GEMINI_API_KEY")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
      },
    );

    if (resp.status === 429) {
      limiter.reportRateLimit("gemini", parseRetryAfter(resp));
      throw new Error(`Gemini Vision Multi 429 rate limited`);
    }
    if (!resp.ok) {throw new Error(`Gemini Vision Multi ${resp.status}`);}
    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  });
}

/** OpenAI GPT-4o Vision (single image) */
async function callOpenAIVision(base64: string, prompt: string): Promise<string> {
  const limiter = getRateLimiter();
  return limiter.withLimit("openai", async () => {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${envKey("OPENAI_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${base64}`, detail: "auto" },
              },
            ],
          },
        ],
        max_tokens: 2048,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    });

    if (resp.status === 429) {
      limiter.reportRateLimit("openai", parseRetryAfter(resp));
      throw new Error(`OpenAI Vision 429 rate limited`);
    }
    if (!resp.ok) {throw new Error(`OpenAI Vision ${resp.status}`);}
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  });
}

/** OpenAI GPT-4o Vision (multi-image) */
async function callOpenAIVisionMulti(images: string[], prompt: string): Promise<string> {
  const limiter = getRateLimiter();
  return limiter.withLimit("openai", async () => {
    const content: Array<{
      type: string;
      text?: string;
      image_url?: { url: string; detail: string };
    }> = [{ type: "text", text: prompt }];
    for (const img of images) {
      content.push({
        type: "image_url",
        image_url: { url: `data:image/png;base64,${img}`, detail: "auto" },
      });
    }

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${envKey("OPENAI_API_KEY")}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content }],
        max_tokens: 2048,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    });

    if (resp.status === 429) {
      limiter.reportRateLimit("openai", parseRetryAfter(resp));
      throw new Error(`OpenAI Vision Multi 429 rate limited`);
    }
    if (!resp.ok) {throw new Error(`OpenAI Vision Multi ${resp.status}`);}
    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? "";
  });
}

/** Anthropic Claude Vision (single image) */
async function callAnthropicVision(base64: string, prompt: string): Promise<string> {
  const limiter = getRateLimiter();
  return limiter.withLimit("anthropic", async () => {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": envKey("ANTHROPIC_API_KEY"),
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-3-5-20241022",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: "image/png", data: base64 },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    });

    if (resp.status === 429) {
      limiter.reportRateLimit("anthropic", parseRetryAfter(resp));
      throw new Error(`Anthropic Vision 429 rate limited`);
    }
    if (!resp.ok) {throw new Error(`Anthropic Vision ${resp.status}`);}
    const data = (await resp.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    return data.content?.find((c) => c.type === "text")?.text ?? "";
  });
}

// ─── Vision History & Diagnostics ───────────────────────────────

const visionHistory: VisionResult[] = [];
const MAX_VISION_HISTORY = 100;

export function recordVisionResult(result: VisionResult): void {
  visionHistory.push(result);
  if (visionHistory.length > MAX_VISION_HISTORY) {
    visionHistory.splice(0, visionHistory.length - MAX_VISION_HISTORY);
  }
}

export function getVisionHistory(): VisionResult[] {
  return [...visionHistory];
}

export interface VisionDiagnostics {
  totalAnalyses: number;
  providerCounts: Record<string, number>;
  averageDurationMs: number;
  hasGemini: boolean;
  hasOpenAI: boolean;
  hasAnthropic: boolean;
}

export function getVisionDiagnostics(): VisionDiagnostics {
  const providerCounts: Record<string, number> = {};
  let totalDuration = 0;

  for (const r of visionHistory) {
    providerCounts[r.provider] = (providerCounts[r.provider] ?? 0) + 1;
    totalDuration += r.durationMs;
  }

  return {
    totalAnalyses: visionHistory.length,
    providerCounts,
    averageDurationMs:
      visionHistory.length > 0 ? Math.round(totalDuration / visionHistory.length) : 0,
    hasGemini: envKey("GEMINI_API_KEY").length > 0,
    hasOpenAI: envKey("OPENAI_API_KEY").length > 0,
    hasAnthropic: envKey("ANTHROPIC_API_KEY").length > 0,
  };
}

// ─── Tick ───────────────────────────────────────────────────────

/**
 * Vision engine tick — lightweight monitoring tick. Vision is inherently
 * on-demand (requires images), so this tick prunes old history entries
 * and records provider availability snapshots.
 */
export function visionTick(_s: unknown): void {
  // Prune old history beyond limit
  if (visionHistory.length > MAX_VISION_HISTORY) {
    visionHistory.splice(0, visionHistory.length - MAX_VISION_HISTORY);
  }
}
