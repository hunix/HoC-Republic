/**
 * Republic Platform — LM Studio Autonomous Control
 *
 * Programmatic LM Studio management via REST API + CLI:
 *  1. listModels()         — list available models
 *  2. downloadModel(id)    — download a model
 *  3. loadModel(id)        — load model into memory
 *  4. unloadModel(id)      — unload model from memory
 *  5. chat(model, msgs)    — OpenAI-compatible chat
 *  6. isAvailable()        — check if LM Studio is running
 *
 * Based on LM Studio REST API v1 (localhost:1234).
 */

import { exec } from "child_process";

// ─── Configuration ──────────────────────────────────────────────

const LMS_BASE = "http://127.0.0.1:1234";
const LMS_TIMEOUT = 10_000;
const DOWNLOAD_TIMEOUT = 600_000;

// ─── Types ──────────────────────────────────────────────────────

export interface LMStudioModel {
  id: string;
  object: string;
  owned_by: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  id: string;
  model: string;
  content: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// ─── State ──────────────────────────────────────────────────────

let lmsAvailable: boolean | null = null;
let lastCheck = 0;

// ─── 1. Check Availability ──────────────────────────────────────

/**
 * Check if LM Studio server is running.
 * Caches result for 30 seconds to avoid hammering.
 */
export async function isAvailable(): Promise<boolean> {
  const now = Date.now();
  if (lmsAvailable !== null && now - lastCheck < 30_000) {
    return lmsAvailable;
  }

  try {
    const res = await fetch(`${LMS_BASE}/v1/models`, {
      signal: AbortSignal.timeout(LMS_TIMEOUT),
    });
    lmsAvailable = res.ok;
  } catch {
    lmsAvailable = false;
  }
  lastCheck = now;
  return lmsAvailable;
}

// ─── 2. List Models ─────────────────────────────────────────────

/**
 * List all models available in LM Studio.
 */
export async function listModels(): Promise<LMStudioModel[]> {
  try {
    const res = await fetch(`${LMS_BASE}/v1/models`, {
      signal: AbortSignal.timeout(LMS_TIMEOUT),
    });
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as { data: LMStudioModel[] };
    return data.data ?? [];
  } catch {
    return [];
  }
}

// ─── 3. Download Model ──────────────────────────────────────────

/**
 * Download a model via LM Studio REST API or CLI.
 */
export async function downloadModel(
  modelId: string,
): Promise<{ success: boolean; error?: string }> {
  // Try REST API first
  try {
    const res = await fetch(`${LMS_BASE}/api/v1/models/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId }),
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT),
    });
    if (res.ok) {
      return { success: true };
    }
  } catch {
    // REST not available
  }

  // Fallback to CLI
  return new Promise((resolve) => {
    exec(`lms get "${modelId}"`, { timeout: DOWNLOAD_TIMEOUT }, (error) => {
      if (!error) {
        resolve({ success: true });
      } else {
        resolve({
          success: false,
          error: "LM Studio not available. Ensure it is running or lms CLI is installed.",
        });
      }
    });
  });
}

// ─── 4. Load / Unload Model ─────────────────────────────────────

/**
 * Load a model into LM Studio memory.
 */
export async function loadModel(modelId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${LMS_BASE}/api/v1/models/load`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId }),
      signal: AbortSignal.timeout(60_000),
    });
    return { success: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Unload a model from LM Studio memory.
 */
export async function unloadModel(modelId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${LMS_BASE}/api/v1/models/unload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId }),
      signal: AbortSignal.timeout(LMS_TIMEOUT),
    });
    return { success: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── 5. Chat Completions ────────────────────────────────────────

/**
 * Send a chat completion request to LM Studio.
 * Uses OpenAI-compatible endpoint.
 */
export async function chat(
  model: string,
  messages: ChatMessage[],
  options?: { temperature?: number; max_tokens?: number },
): Promise<ChatResponse> {
  const res = await fetch(`${LMS_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 1024,
      stream: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    throw new Error(`LM Studio chat failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    id: string;
    model: string;
    choices: { message: { content: string } }[];
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  return {
    id: data.id,
    model: data.model,
    content: data.choices?.[0]?.message?.content ?? "",
    usage: data.usage,
  };
}

// ─── 6. Embeddings ──────────────────────────────────────────────

/**
 * Generate embeddings using LM Studio.
 */
export async function embed(model: string, input: string): Promise<number[]> {
  const res = await fetch(`${LMS_BASE}/v1/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`LM Studio embeddings failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    data: { embedding: number[] }[];
  };

  return data.data?.[0]?.embedding ?? [];
}

// ─── 7. Server Control ──────────────────────────────────────────

/**
 * Start LM Studio server via CLI.
 */
export async function startServer(): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    exec("lms server start", { timeout: 15_000 }, (error) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      resolve({ success: !error, error: error ? String(error) : undefined });
    });
  });
}

/**
 * Stop LM Studio server via CLI.
 */
export async function stopServer(): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    exec("lms server stop", { timeout: 10_000 }, (error) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      resolve({ success: !error, error: error ? String(error) : undefined });
    });
  });
}

// ─── 8. Diagnostics ─────────────────────────────────────────────

export async function getLMStudioDiagnostics(): Promise<{
  available: boolean;
  models: LMStudioModel[];
  serverUrl: string;
}> {
  const available = await isAvailable();
  const models = available ? await listModels() : [];
  return {
    available,
    models,
    serverUrl: LMS_BASE,
  };
}
