/**
 * Republic Platform — Vision Analyzer
 *
 * Screen content understanding via the locally-running qwen3 4b vision
 * model in LM Studio (http://127.0.0.1:1234).
 *
 * Capabilities:
 *   - Capture screenshot via companion-bridge → analyze via vision model
 *   - Determine visible app, page state, text content, UI elements
 *   - Verify browser task completion
 *   - Extract structured data from screen content
 *   - Read AI app responses (ChatGPT / Gemini / Claude)
 *
 * Falls back to basic screenshot analysis if LM Studio is unavailable.
 */

import { getCompanionBridge, isCompanionAvailable } from "../infra/companion-bridge.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { ts, uid } from "./utils.js";

const logger = createSubsystemLogger("republic:vision-analyzer");

// ─── Types ──────────────────────────────────────────────────────

export interface ScreenAnalysis {
  id: string;
  timestamp: string;
  /** What application is currently in the foreground */
  activeApp: string;
  /** Page title or window title */
  title: string;
  /** Main visible text content (summarized) */
  textContent: string;
  /** Detected UI elements (buttons, links, input fields) */
  uiElements: Array<{
    type: "button" | "link" | "input" | "text" | "image" | "menu" | "other";
    label: string;
    approximate_location?: string;
  }>;
  /** Whether the page appears to be fully loaded */
  pageLoaded: boolean;
  /** Any error messages visible on screen */
  errors: string[];
  /** Raw model response for debugging */
  rawResponse: string;
  /** Whether vision analysis was used vs fallback */
  usedVision: boolean;
  /** Analysis confidence 0-1 */
  confidence: number;
}

export interface AIResponseExtraction {
  /** The AI assistant's response text */
  responseText: string;
  /** Whether the AI is still generating */
  isGenerating: boolean;
  /** Which AI provider is visible */
  provider: "chatgpt" | "gemini" | "claude" | "unknown";
  /** Whether we could read the response */
  success: boolean;
  confidence: number;
}

export interface VisionDiagnostics {
  lmStudioAvailable: boolean;
  visionModelLoaded: boolean;
  modelName: string;
  totalAnalyses: number;
  successfulAnalyses: number;
  averageLatencyMs: number;
  companionAvailable: boolean;
}

// ─── Configuration ──────────────────────────────────────────────

const LMSTUDIO_BASE = process.env.LMSTUDIO_URL ?? "http://127.0.0.1:1234";
const VISION_MODEL = "qwen3-4b";  // The vision model loaded in LM Studio
const VISION_TIMEOUT_MS = 30_000;
const MAX_ANALYSIS_CACHE = 20;

// ─── State ──────────────────────────────────────────────────────

let totalAnalyses = 0;
let successfulAnalyses = 0;
const latencies: number[] = [];
const analysisCache: ScreenAnalysis[] = [];
let lmStudioAvailable: boolean | null = null;

// ─── LM Studio Vision API ───────────────────────────────────────

/**
 * Check if LM Studio is running and has a vision-capable model.
 */
export async function checkVisionAvailability(): Promise<boolean> {
  try {
    const resp = await fetch(`${LMSTUDIO_BASE}/v1/models`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) {
      lmStudioAvailable = false;
      return false;
    }

    const data = (await resp.json()) as { data: Array<{ id: string }> };
    const hasVision = data.data.some(
      (m) => m.id.toLowerCase().includes("qwen") ||
             m.id.toLowerCase().includes("vision") ||
             m.id.toLowerCase().includes("llava"),
    );

    lmStudioAvailable = hasVision;
    if (hasVision) {
      logger.info("Vision model available in LM Studio", {
        models: data.data.map((m) => m.id),
      });
    }

    return hasVision;
  } catch {
    lmStudioAvailable = false;
    return false;
  }
}

/**
 * Send an image to LM Studio vision model for analysis.
 */
async function visionInference(
  imageBase64: string,
  prompt: string,
  systemPrompt?: string,
): Promise<string | null> {
  try {
    const messages: Array<{
      role: string;
      content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }> = [];

    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }

    messages.push({
      role: "user",
      content: [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: { url: `data:image/png;base64,${imageBase64}` },
        },
      ],
    });

    const resp = await fetch(`${LMSTUDIO_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages,
        temperature: 0.1,
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    });

    if (!resp.ok) {
      logger.error(`LM Studio vision request failed: ${resp.status}`);
      return null;
    }

    const data = (await resp.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    logger.error("Vision inference error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── Screenshot Capture ─────────────────────────────────────────

/**
 * Capture a screenshot via the companion bridge.
 * Returns base64-encoded PNG.
 */
async function captureScreen(): Promise<string | null> {
  try {
    const available = await isCompanionAvailable();
    if (!available) {
      logger.warn("Companion not available for screenshot capture");
      return null;
    }

    const bridge = getCompanionBridge();
    const result = await bridge.captureScreen();

    if (result && typeof result === "string") {
      return result;
    }

    // Try alternative: screenshot via bridge
    const altResult = await bridge.executeCommand("powershell", [
      "-Command",
      "Add-Type -AssemblyName System.Windows.Forms; " +
      "[System.Windows.Forms.Screen]::PrimaryScreen | Out-Null; " +
      "$bitmap = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, " +
      "[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); " +
      "$graphics = [System.Drawing.Graphics]::FromImage($bitmap); " +
      "$graphics.CopyFromScreen(0,0,0,0,$bitmap.Size); " +
      "$ms = New-Object System.IO.MemoryStream; " +
      "$bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); " +
      "[Convert]::ToBase64String($ms.ToArray())",
    ]);

    return altResult?.stdout?.trim() ?? null;
  } catch (err) {
    logger.error("Screenshot capture failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── Analysis Functions ─────────────────────────────────────────

/**
 * Capture the screen and analyze its contents using the vision model.
 */
export async function captureAndAnalyze(context?: string): Promise<ScreenAnalysis> {
  totalAnalyses++;
  const startTime = Date.now();

  const analysis: ScreenAnalysis = {
    id: uid(),
    timestamp: ts(),
    activeApp: "unknown",
    title: "",
    textContent: "",
    uiElements: [],
    pageLoaded: false,
    errors: [],
    rawResponse: "",
    usedVision: false,
    confidence: 0,
  };

  // Capture screenshot
  const screenshot = await captureScreen();
  if (!screenshot) {
    analysis.errors.push("Failed to capture screenshot");
    return analysis;
  }

  // Check if vision model is available
  if (lmStudioAvailable === null) {
    await checkVisionAvailability();
  }

  if (lmStudioAvailable) {
    // Use vision model
    const prompt = context
      ? `Analyze this screenshot. Context: ${context}.\n\nProvide a JSON response with fields: activeApp (string), title (string), textContent (brief summary), uiElements (array of {type, label}), pageLoaded (boolean), errors (array of strings).`
      : "Analyze this screenshot. Identify the active application, page title, main visible text content, interactive UI elements (buttons, links, inputs), whether the page is fully loaded, and any error messages.\n\nProvide a JSON response with fields: activeApp (string), title (string), textContent (brief summary), uiElements (array of {type, label}), pageLoaded (boolean), errors (array of strings).";

    const response = await visionInference(
      screenshot,
      prompt,
      "You are a screen analysis assistant. Always respond with valid JSON. Be concise and accurate.",
    );

    if (response) {
      analysis.rawResponse = response;
      analysis.usedVision = true;

      // Parse the response
      try {
        // Try to extract JSON from the response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Partial<ScreenAnalysis>;
          analysis.activeApp = parsed.activeApp ?? "unknown";
          analysis.title = parsed.title ?? "";
          analysis.textContent = parsed.textContent ?? "";
          analysis.pageLoaded = parsed.pageLoaded ?? false;
          analysis.errors = parsed.errors ?? [];
          analysis.confidence = 0.85;

          if (Array.isArray(parsed.uiElements)) {
            analysis.uiElements = parsed.uiElements.map((el) => ({
              type: el.type ?? "other",
              label: el.label ?? "",
              approximate_location: el.approximate_location,
            }));
          }
        }
      } catch {
        // If JSON parsing fails, extract what we can
        analysis.textContent = response.slice(0, 500);
        analysis.confidence = 0.3;
      }

      successfulAnalyses++;
    }
  } else {
    // Fallback: Use companion bridge to get window title at least
    try {
      const bridge = getCompanionBridge();
      const result = await bridge.executeCommand("powershell", [
        "-Command",
        "Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | Select-Object -First 1 MainWindowTitle | Format-Table -HideTableHeaders",
      ]);
      if (result?.stdout) {
        analysis.title = result.stdout.trim();
        analysis.activeApp = analysis.title.split(" - ").pop() ?? "unknown";
        analysis.confidence = 0.4;
      }
    } catch { /* swallow */ }
  }

  const latency = Date.now() - startTime;
  latencies.push(latency);
  if (latencies.length > MAX_ANALYSIS_CACHE) {latencies.shift();}

  // Cache the analysis
  analysisCache.push(analysis);
  if (analysisCache.length > MAX_ANALYSIS_CACHE) {analysisCache.shift();}

  return analysis;
}

/**
 * Analyze what's on screen specifically to verify a task completed.
 */
export async function verifyTaskCompletion(
  expectedOutcome: string,
): Promise<{ verified: boolean; confidence: number; details: string }> {
  const analysis = await captureAndAnalyze(`Verifying task completion. Expected: ${expectedOutcome}`);

  if (!analysis.usedVision) {
    return { verified: false, confidence: 0, details: "Vision not available" };
  }

  // Ask the vision model specifically about task completion
  const screenshot = await captureScreen();
  if (!screenshot) {
    return { verified: false, confidence: 0, details: "Screenshot failed" };
  }

  const response = await visionInference(
    screenshot,
    `Was this task completed successfully? Expected outcome: "${expectedOutcome}"\n\nRespond with JSON: { "verified": boolean, "confidence": number (0-1), "details": string }`,
    "You are a task verification assistant. Respond with valid JSON only.",
  );

  if (response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { verified: boolean; confidence: number; details: string };
        return {
          verified: parsed.verified ?? false,
          confidence: parsed.confidence ?? 0,
          details: parsed.details ?? "",
        };
      }
    } catch { /* fall through */ }
  }

  return { verified: false, confidence: 0, details: "Could not verify" };
}

/**
 * Extract an AI assistant's response from the screen.
 * Used by premium-ai-controller to read ChatGPT/Gemini/Claude responses.
 */
export async function extractAIResponse(): Promise<AIResponseExtraction> {
  const result: AIResponseExtraction = {
    responseText: "",
    isGenerating: false,
    provider: "unknown",
    success: false,
    confidence: 0,
  };

  const screenshot = await captureScreen();
  if (!screenshot) {return result;}

  if (!lmStudioAvailable) {
    await checkVisionAvailability();
    if (!lmStudioAvailable) {return result;}
  }

  const response = await visionInference(
    screenshot,
    "This screenshot shows an AI chat interface. Extract the AI assistant's most recent response.\n\n" +
    "Respond with JSON: { \"provider\": \"unknown\", \"responseText\": \"the full response text\", \"isGenerating\": boolean, \"success\": true }",
    "You are a screen reading assistant. Extract AI responses accurately. Respond with valid JSON only.",
  );

  if (response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Partial<AIResponseExtraction>;
        result.responseText = parsed.responseText ?? "";
        result.isGenerating = parsed.isGenerating ?? false;
        result.provider = parsed.provider ?? "unknown";
        result.success = (parsed.success ?? false) && result.responseText.length > 0;
        result.confidence = result.success ? 0.8 : 0.2;
      }
    } catch { /* fall through */ }
  }

  return result;
}

/**
 * Extract structured data from the visible screen content.
 */
export async function extractDataFromScreen(
  dataDescription: string,
): Promise<{ data: Record<string, unknown> | null; success: boolean }> {
  const screenshot = await captureScreen();
  if (!screenshot) {return { data: null, success: false };}

  if (!lmStudioAvailable) {return { data: null, success: false };}

  const response = await visionInference(
    screenshot,
    `Extract the following data from this screenshot: ${dataDescription}\n\nRespond with valid JSON containing the extracted data.`,
    "You are a data extraction assistant. Extract structured data from screenshots. Always respond with valid JSON.",
  );

  if (response) {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        return { data, success: true };
      }
    } catch { /* fall through */ }
  }

  return { data: null, success: false };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getVisionDiagnostics(): VisionDiagnostics {
  const avgLatency = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;

  return {
    lmStudioAvailable: lmStudioAvailable ?? false,
    visionModelLoaded: lmStudioAvailable ?? false,
    modelName: VISION_MODEL,
    totalAnalyses,
    successfulAnalyses,
    averageLatencyMs: Math.round(avgLatency),
    companionAvailable: false, // Will be updated on next check
  };
}

export function getRecentAnalyses(limit = 5): ScreenAnalysis[] {
  return analysisCache.slice(-limit);
}
