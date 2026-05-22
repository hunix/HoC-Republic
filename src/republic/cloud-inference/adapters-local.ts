/**
 * Cloud Inference — Local Provider Adapters
 *
 * Cluster-aware local inference adapters for Ollama, LM Studio, and Gemma 4.
 * These adapters route through LM Link cluster infrastructure for
 * node selection and report telemetry back to the compute router.
 */

import type { Citizen, RepublicState } from "../types.js";
import { buildDecisionPrompt, buildSystemPrompt } from "../citizen-prompt.js";
import { parseActionJSON } from "./parse.js";
import { key, TIMEOUT_MS } from "./providers.js";

// ─── Lazy Caches ────────────────────────────────────────────────

let _inferenceStrategy: typeof import("../inference-strategy.js") | null = null;
async function getInferenceStrategy() {
  return (_inferenceStrategy ??= await import("../inference-strategy.js"));
}

let _lmlinkCluster: typeof import("../lmlink-cluster.js") | null = null;
async function getLmlinkCluster() {
  return (_lmlinkCluster ??= await import("../lmlink-cluster.js"));
}

let _computeRouter: typeof import("../compute-router.js") | null = null;
async function getComputeRouter() {
  return (_computeRouter ??= await import("../compute-router.js"));
}

// ─── Shared: Cluster Node Selection ─────────────────────────────

interface NodeEndpoint {
  host: string;
  port: string;
  token: string;
  label: string;
}

async function selectNodeEndpoint(): Promise<NodeEndpoint> {
  const { selectBestLMLinkNode } = await getLmlinkCluster();
  const bestNode = selectBestLMLinkNode({ requireLoadedModel: true });

  if (bestNode) {
    return {
      host: bestNode.host,
      port: String(bestNode.port),
      token: bestNode.apiToken ?? key("LMSTUDIO_API_TOKEN"),
      label: bestNode.label,
    };
  }

  return {
    host: key("LMSTUDIO_HOST") || "localhost",
    port: key("LMSTUDIO_PORT") || "1234",
    token: key("LMSTUDIO_API_TOKEN"),
    label: "local",
  };
}

function buildUrl(host: string, port: string): string {
  const baseUrl = host.startsWith("http") ? host : `http://${host}`;
  return `${baseUrl}:${port}/v1/chat/completions`;
}

function buildHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// ─── Ollama ─────────────────────────────────────────────────────

/**
 * Ollama inference via OpenAI-compatible local API.
 * Uses Nemotron 3 Super by default — free, runs locally.
 */
export async function ollamaInference(
  citizen: Citizen,
  state: RepublicState,
): Promise<{ tool: string; params: Record<string, unknown> }> {
  const systemPrompt = await buildSystemPrompt({ citizen, state, includeTools: true });
  const userPrompt = buildDecisionPrompt(citizen);
  const host = key("OLLAMA_HOST") || "http://localhost:11434";
  const model = key("OLLAMA_MODEL") || "nemotron-super";

  const response = await fetch(`${host}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 256,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Empty Ollama response");
  }
  return parseActionJSON(text);
}

// ─── LM Studio ──────────────────────────────────────────────────

/**
 * LM Studio local inference via OpenAI-compatible API.
 * Uses buildMicroPrompt — ~400 tokens total, fits 8 parallel slots @ 4096 ctx.
 */
export async function lmStudioInference(
  citizen: Citizen,
  _state: RepublicState,
): Promise<{ tool: string; params: Record<string, unknown> }> {
  const { buildMicroPrompt } = await getInferenceStrategy();
  const { system, user } = buildMicroPrompt(citizen);

  const { host, port, token, label } = await selectNodeEndpoint();
  const model = key("LMSTUDIO_MODEL") || "local-model";
  const url = buildUrl(host, port);
  const headers = buildHeaders(token);

  const t0 = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
      max_tokens: 150,
      stream: false,
      stop: ["\n\n"],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`LM Studio API error [${label}]: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`Empty LM Studio response [${label}]`);
  }

  const latencyMs = Date.now() - t0;
  const { updateProviderTelemetry } = await getComputeRouter();
  updateProviderTelemetry(`local-lmstudio`, { timeToFirstTokenMs: latencyMs });

  return parseActionJSON(text);
}

// ─── Gemma 4 ────────────────────────────────────────────────────

/**
 * Gemma 4 inference via LM Studio / LM Link — the sovereign citizen brain.
 * Routes through LM Link cluster infrastructure with Gemini API cloud fallback.
 */
export async function gemma4Inference(
  citizen: Citizen,
  _state: RepublicState,
): Promise<{ tool: string; params: Record<string, unknown> }> {
  const model = key("GEMMA4_MODEL") || "gemma4:26b-a4b";
  const isEdge = model.includes("e2b") || model.includes("e4b");
  const strategyKey = isEdge ? "gemma4_edge" : "gemma4";

  const { buildPromptForProvider } = await getInferenceStrategy();
  const { system, user, maxTokens } = buildPromptForProvider(strategyKey, citizen);

  const { host, port, token, label } = await selectNodeEndpoint();
  const url = buildUrl(host, port);
  const headers = buildHeaders(token);

  const t0 = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Gemma 4 LM Studio [${label}] API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("Empty Gemma 4 response from LM Studio");
    }

    const latencyMs = Date.now() - t0;
    const { updateProviderTelemetry } = await getComputeRouter();
    updateProviderTelemetry("local-gemma4", { timeToFirstTokenMs: latencyMs });

    return parseActionJSON(text);
  } catch (localErr) {
    // ── Gemini API free cloud fallback ──────────────────────────────
    const { isGeminiAvailable } = await import("./providers.js");
    if (isGeminiAvailable()) {
      const geminiModel = key("GEMMA4_CLOUD_MODEL") || "gemma-4-27b-it";
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${key("GEMINI_API_KEY")}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );

      const data = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (text) {
        return parseActionJSON(text);
      }
    }
    throw localErr;
  }
}
