/**
 * Republic Platform — Premium AI App Controller
 *
 * Control ChatGPT, Google Gemini, and Claude desktop/web apps
 * via companion-bridge for high-quality AI assistance.
 *
 * These premium AI subscriptions are only accessible through the
 * physical screen — no API keys available. Citizens use the
 * screen queue to take turns interacting with these apps.
 *
 * Flow: Request screen → Open/focus app → Type prompt →
 *       Wait for response → Extract via vision model → Release screen
 *
 * Available subscriptions:
 *   - ChatGPT Pro (GPT-4o, o1, etc.)
 *   - Google Gemini Ultra
 *   - Anthropic Claude ($200/mo Max plan)
 */

import { getCompanionBridge, isCompanionAvailable } from "../infra/companion-bridge.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { withScreenAccess } from "./screen-queue.js";
import { ts, uid } from "./utils.js";
import { captureAndAnalyze, extractAIResponse } from "./vision-analyzer.js";

const logger = createSubsystemLogger("republic:premium-ai");

// ─── Types ──────────────────────────────────────────────────────

export type PremiumAIProvider = "chatgpt" | "gemini" | "claude";

export type AITaskType =
  | "code_generation"
  | "code_review"
  | "research"
  | "analysis"
  | "writing"
  | "planning"
  | "debugging"
  | "design"
  | "general";

export interface PremiumAIApp {
  provider: PremiumAIProvider;
  name: string;
  /** Window title patterns to identify the app */
  windowPatterns: string[];
  /** URL patterns (for browser-based access) */
  urlPatterns: string[];
  /** How to launch the app */
  launchMethod: "desktop_app" | "browser_url";
  launchTarget: string;
  /** Provider strengths for intelligent routing */
  strengths: AITaskType[];
  /** Estimated response time in ms */
  avgResponseTimeMs: number;
  /** Whether this provider is enabled */
  enabled: boolean;
}

export interface PremiumAIRequest {
  id: string;
  citizenId: string;
  citizenName: string;
  provider: PremiumAIProvider;
  taskType: AITaskType;
  prompt: string;
  systemContext?: string;
  status: "queued" | "sending" | "waiting" | "extracting" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
  response?: string;
  error?: string;
  latencyMs?: number;
}

export interface PremiumAIDiagnostics {
  availableProviders: PremiumAIProvider[];
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  requestsByProvider: Record<string, number>;
  averageLatencyMs: number;
  companionAvailable: boolean;
}

// ─── App Registry ───────────────────────────────────────────────

const AI_APPS: Record<PremiumAIProvider, PremiumAIApp> = {
  chatgpt: {
    provider: "chatgpt",
    name: "ChatGPT",
    windowPatterns: ["ChatGPT"],
    urlPatterns: ["chat.openai.com", "chatgpt.com"],
    launchMethod: "desktop_app",
    launchTarget: "ChatGPT",
    strengths: ["general", "writing", "planning", "research"],
    avgResponseTimeMs: 15_000,
    enabled: true,
  },
  gemini: {
    provider: "gemini",
    name: "Google Gemini",
    windowPatterns: ["Gemini", "Google AI Studio"],
    urlPatterns: ["gemini.google.com", "aistudio.google.com"],
    launchMethod: "browser_url",
    launchTarget: "https://gemini.google.com",
    strengths: ["research", "analysis", "code_generation", "general"],
    avgResponseTimeMs: 12_000,
    enabled: true,
  },
  claude: {
    provider: "claude",
    name: "Anthropic Claude",
    windowPatterns: ["Claude"],
    urlPatterns: ["claude.ai"],
    launchMethod: "browser_url",
    launchTarget: "https://claude.ai",
    strengths: ["code_generation", "code_review", "debugging", "analysis", "writing"],
    avgResponseTimeMs: 20_000,
    enabled: true,
  },
};

// ─── State ──────────────────────────────────────────────────────

const requestHistory: PremiumAIRequest[] = [];
const MAX_HISTORY = 200;
let totalRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;
const latencies: number[] = [];

// ─── Provider Selection ─────────────────────────────────────────

/**
 * Select the best provider for a given task type.
 * Considers provider strengths and availability.
 */
export function selectProvider(taskType: AITaskType): PremiumAIProvider {
  const scored: Array<{ provider: PremiumAIProvider; score: number }> = [];

  for (const [provider, app] of Object.entries(AI_APPS) as Array<[PremiumAIProvider, PremiumAIApp]>) {
    if (!app.enabled) {continue;}

    let score = 0;
    // +3 if this is a primary strength
    if (app.strengths.includes(taskType)) {score += 3;}
    // +1 base score for being available
    score += 1;
    // Faster response time = higher score
    score += (30_000 - app.avgResponseTimeMs) / 10_000;

    scored.push({ provider, score });
  }

  scored.sort((a, b) => b.score - a.score);

  return scored[0]?.provider ?? "chatgpt";
}

/**
 * Enable or disable a provider.
 */
export function setProviderEnabled(provider: PremiumAIProvider, enabled: boolean): void {
  AI_APPS[provider].enabled = enabled;
  logger.info(`Provider ${provider} ${enabled ? "enabled" : "disabled"}`);
}

// ─── App Control ────────────────────────────────────────────────

/**
 * Focus or launch a premium AI app.
 */
async function focusOrLaunchApp(app: PremiumAIApp): Promise<boolean> {
  const available = await isCompanionAvailable();
  if (!available) {return false;}

  const bridge = getCompanionBridge();

  // Try to find and focus existing window
  for (const pattern of app.windowPatterns) {
    try {
      const result = await bridge.executeCommand("powershell", [
        "-Command",
        `$w = Get-Process | Where-Object { $_.MainWindowTitle -like '*${pattern}*' } | Select-Object -First 1; ` +
        `if ($w) { $w.Id } else { 'NOT_FOUND' }`,
      ]);

      if (result?.stdout?.trim() && result.stdout.trim() !== "NOT_FOUND") {
        // Window found, bring to front
        await bridge.executeCommand("powershell", [
          "-Command",
          `$p = Get-Process -Id ${result.stdout.trim()}; ` +
          `[void][System.Reflection.Assembly]::LoadWithPartialName('Microsoft.VisualBasic'); ` +
          `[Microsoft.VisualBasic.Interaction]::AppActivate($p.Id)`,
        ]);

        await new Promise((r) => setTimeout(r, 1000));
        return true;
      }
    } catch { /* continue */ }
  }

  // App not found, try to launch
  if (app.launchMethod === "desktop_app") {
    try {
      await bridge.executeCommand("powershell", [
        "-Command",
        `Start-Process "${app.launchTarget}"`,
      ]);
      await new Promise((r) => setTimeout(r, 3000));
      return true;
    } catch {
      return false;
    }
  } else {
    // Browser-based: open URL
    try {
      await bridge.executeCommand("powershell", [
        "-Command",
        `Start-Process "${app.launchTarget}"`,
      ]);
      await new Promise((r) => setTimeout(r, 3000));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Type a prompt into the active AI app.
 * Assumes the app is focused and prompt input is visible.
 */
async function typePrompt(prompt: string): Promise<boolean> {
  try {
    const bridge = getCompanionBridge();

    // Click in the message input area (usually bottom-center)
    // This is a best-effort approach; vision model can help locate it
    await bridge.moveMouse(960, 900);
    await new Promise((r) => setTimeout(r, 200));
    await bridge.clickMouse("left");
    await new Promise((r) => setTimeout(r, 500));

    // Type the prompt using keyboard
    await bridge.typeText(prompt);
    await new Promise((r) => setTimeout(r, 300));

    // Press Enter to send
    await bridge.pressKey("Enter");
    await new Promise((r) => setTimeout(r, 500));

    return true;
  } catch (err) {
    logger.error("Failed to type prompt", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Wait for the AI to finish generating its response.
 * Polls the screen via vision analyzer.
 */
async function waitForResponse(
  maxWaitMs: number = 60_000,
): Promise<string | null> {
  const startTime = Date.now();
  const pollInterval = 3_000;

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const extraction = await extractAIResponse();

    if (extraction.success && !extraction.isGenerating) {
      return extraction.responseText;
    }

    // If still generating, keep waiting
    if (extraction.isGenerating) {
      logger.info("AI still generating response...");
      continue;
    }
  }

  // Timeout — try one last extraction
  const finalExtraction = await extractAIResponse();
  return finalExtraction.success ? finalExtraction.responseText : null;
}

// ─── Main API ───────────────────────────────────────────────────

/**
 * Send a prompt to a premium AI app and get the response.
 * Handles the full lifecycle: queue screen → focus app → type → wait → extract.
 */
export async function askPremiumAI(
  citizenId: string,
  citizenName: string,
  prompt: string,
  taskType: AITaskType = "general",
  preferredProvider?: PremiumAIProvider,
): Promise<PremiumAIRequest> {
  const provider = preferredProvider ?? selectProvider(taskType);
  const app = AI_APPS[provider];
  const startTime = Date.now();

  const request: PremiumAIRequest = {
    id: uid(),
    citizenId,
    citizenName,
    provider,
    taskType,
    prompt,
    status: "queued",
    createdAt: ts(),
  };

  totalRequests++;

  logger.info(`Premium AI request: ${citizenName} → ${provider} [${taskType}]`, {
    promptLength: prompt.length,
  });

  try {
    // Use screen queue for exclusive access
    const response = await withScreenAccess(
      citizenId,
      citizenName,
      "premium_ai",
      `Ask ${app.name}: ${prompt.slice(0, 50)}...`,
      async () => {
        // Step 1: Focus/launch the app
        request.status = "sending";
        const focused = await focusOrLaunchApp(app);
        if (!focused) {
          throw new Error(`Failed to focus/launch ${app.name}`);
        }

        // Step 2: Verify we're on the right app
        const analysis = await captureAndAnalyze(`Verifying ${app.name} is active`);
        logger.info(`Screen analysis: ${analysis.activeApp} — ${analysis.title}`);

        // Step 3: Type the prompt
        const typed = await typePrompt(prompt);
        if (!typed) {
          throw new Error("Failed to type prompt");
        }

        // Step 4: Wait for response
        request.status = "waiting";
        const maxWait = app.avgResponseTimeMs * 3;
        const aiResponse = await waitForResponse(maxWait);

        // Step 5: Extract response
        request.status = "extracting";
        if (aiResponse) {
          return aiResponse;
        }

        // If direct extraction failed, try a broader screen read
        const fullAnalysis = await captureAndAnalyze(`Reading ${app.name} response`);
        return fullAnalysis.textContent || null;
      },
      "high",
      180_000, // 3 minute max screen hold
    );

    if (response) {
      request.status = "completed";
      request.response = response;
      request.completedAt = ts();
      request.latencyMs = Date.now() - startTime;

      latencies.push(request.latencyMs);
      if (latencies.length > 100) {latencies.shift();}

      successfulRequests++;
      logger.info(`Premium AI response received: ${provider} — ${response.length} chars in ${request.latencyMs}ms`);
    } else {
      request.status = "failed";
      request.error = "No response extracted";
      failedRequests++;
    }
  } catch (err) {
    request.status = "failed";
    request.error = err instanceof Error ? err.message : String(err);
    request.completedAt = ts();
    failedRequests++;

    logger.error(`Premium AI request failed: ${request.error}`);
  }

  requestHistory.push(request);
  if (requestHistory.length > MAX_HISTORY) {
    requestHistory.splice(0, requestHistory.length - MAX_HISTORY);
  }

  return request;
}

/**
 * Ask the best available premium AI for code-related tasks.
 * Prefers Claude for code, falls back to others.
 */
export async function askForCode(
  citizenId: string,
  citizenName: string,
  codePrompt: string,
): Promise<PremiumAIRequest> {
  return askPremiumAI(citizenId, citizenName, codePrompt, "code_generation", "claude");
}

/**
 * Ask the best available premium AI for research.
 * Prefers Gemini for research, falls back to others.
 */
export async function askForResearch(
  citizenId: string,
  citizenName: string,
  researchPrompt: string,
): Promise<PremiumAIRequest> {
  return askPremiumAI(citizenId, citizenName, researchPrompt, "research", "gemini");
}

// ─── Query & Diagnostics ────────────────────────────────────────

export function getRequestHistory(
  limit = 20,
  provider?: PremiumAIProvider,
): PremiumAIRequest[] {
  let filtered = requestHistory;
  if (provider) {filtered = requestHistory.filter((r) => r.provider === provider);}
  return filtered.slice(-limit);
}

export function getProviderInfo(): Record<PremiumAIProvider, { name: string; enabled: boolean; strengths: AITaskType[] }> {
  const result = {} as Record<PremiumAIProvider, { name: string; enabled: boolean; strengths: AITaskType[] }>;
  for (const [key, app] of Object.entries(AI_APPS) as Array<[PremiumAIProvider, PremiumAIApp]>) {
    result[key] = { name: app.name, enabled: app.enabled, strengths: app.strengths };
  }
  return result;
}

export function getPremiumAIDiagnostics(): PremiumAIDiagnostics {
  const byProvider: Record<string, number> = {};
  for (const r of requestHistory) {
    byProvider[r.provider] = (byProvider[r.provider] ?? 0) + 1;
  }

  const avgLatency = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;

  return {
    availableProviders: (Object.entries(AI_APPS) as Array<[PremiumAIProvider, PremiumAIApp]>)
      .filter(([, app]) => app.enabled)
      .map(([key]) => key),
    totalRequests,
    successfulRequests,
    failedRequests,
    requestsByProvider: byProvider,
    averageLatencyMs: Math.round(avgLatency),
    companionAvailable: false, // Updated on check
  };
}
