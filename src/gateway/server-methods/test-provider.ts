/**
 * config.test-provider — Real API Key Validation
 *
 * Makes lightweight, zero-token API calls to each provider's
 * model-listing endpoint to verify that the configured API key
 * is valid and working.
 *
 * Returns: { ok, provider, models?, latencyMs?, error? }
 */

import type { GatewayRequestHandlers } from "./types.js";

// ─── Provider Test Endpoints ────────────────────────────────────

interface TestResult {
  ok: boolean;
  provider: string;
  models?: string[];
  latencyMs?: number;
  error?: string;
}

const TIMEOUT_MS = 10_000;

async function testOpenAI(apiKey: string): Promise<TestResult> {
  const start = Date.now();
  const resp = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return { ok: false, provider: "openai", error: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
  }
  const data = (await resp.json()) as { data?: { id: string }[] };
  const models = (data.data ?? []).map((m) => m.id).slice(0, 10);
  return { ok: true, provider: "openai", models, latencyMs: Date.now() - start };
}

async function testAnthropic(apiKey: string): Promise<TestResult> {
  const start = Date.now();
  // Anthropic doesn't have a /models endpoint; use a minimal message
  // with max_tokens=1 to validate the key with near-zero cost
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-20250514",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    // 401 = invalid key, 429 = rate limited (key is valid but rate limited)
    if (resp.status === 429) {
      return {
        ok: true,
        provider: "anthropic",
        models: ["claude-haiku-4", "claude-sonnet-4", "claude-opus-4"],
        latencyMs: Date.now() - start,
      };
    }
    return { ok: false, provider: "anthropic", error: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
  }
  return {
    ok: true,
    provider: "anthropic",
    models: ["claude-haiku-4", "claude-sonnet-4", "claude-opus-4"],
    latencyMs: Date.now() - start,
  };
}

async function testGemini(apiKey: string): Promise<TestResult> {
  const start = Date.now();
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return { ok: false, provider: "google", error: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
  }
  const data = (await resp.json()) as { models?: { name: string }[] };
  const models = (data.models ?? [])
    .map((m) => m.name.replace("models/", ""))
    .filter((n) => n.includes("gemini"))
    .slice(0, 10);
  return { ok: true, provider: "google", models, latencyMs: Date.now() - start };
}

async function testGroq(apiKey: string): Promise<TestResult> {
  const start = Date.now();
  const resp = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return { ok: false, provider: "groq", error: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
  }
  const data = (await resp.json()) as { data?: { id: string }[] };
  const models = (data.data ?? []).map((m) => m.id).slice(0, 10);
  return { ok: true, provider: "groq", models, latencyMs: Date.now() - start };
}

async function testNvidiaNim(apiKey: string): Promise<TestResult> {
  const start = Date.now();
  const resp = await fetch("https://integrate.api.nvidia.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return { ok: false, provider: "nvidia", error: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
  }
  const data = (await resp.json()) as { data?: { id: string }[] };
  const models = (data.data ?? [])
    .map((m) => m.id)
    .filter((id) => id.includes("nemotron") || id.includes("llama"))
    .slice(0, 10);
  return { ok: true, provider: "nvidia", models, latencyMs: Date.now() - start };
}

async function testOpenRouter(apiKey: string): Promise<TestResult> {
  const start = Date.now();
  const resp = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return { ok: false, provider: "openrouter", error: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
  }
  const data = (await resp.json()) as { data?: { id: string }[] };
  const models = (data.data ?? []).map((m) => m.id).slice(0, 10);
  return { ok: true, provider: "openrouter", models, latencyMs: Date.now() - start };
}

async function testDeepSeek(apiKey: string): Promise<TestResult> {
  const start = Date.now();
  const resp = await fetch("https://api.deepseek.com/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    return { ok: false, provider: "deepseek", error: `HTTP ${resp.status}: ${body.slice(0, 200)}` };
  }
  const data = (await resp.json()) as { data?: { id: string }[] };
  const models = (data.data ?? []).map((m) => m.id).slice(0, 10);
  return { ok: true, provider: "deepseek", models, latencyMs: Date.now() - start };
}

// ─── Provider Dispatch Map ──────────────────────────────────────

const PROVIDER_TESTERS: Record<string, { envKey: string; testFn: (key: string) => Promise<TestResult> }> = {
  openai: { envKey: "OPENAI_API_KEY", testFn: testOpenAI },
  anthropic: { envKey: "ANTHROPIC_API_KEY", testFn: testAnthropic },
  google: { envKey: "GEMINI_API_KEY", testFn: testGemini },
  groq: { envKey: "GROQ_API_KEY", testFn: testGroq },
  nvidia: { envKey: "NVIDIA_API_KEY", testFn: testNvidiaNim },
  openrouter: { envKey: "OPENROUTER_API_KEY", testFn: testOpenRouter },
  deepseek: { envKey: "DEEPSEEK_API_KEY", testFn: testDeepSeek },
};

// ─── Handler ────────────────────────────────────────────────────

export const testProviderHandlers: GatewayRequestHandlers = {
  "config.test-provider": async ({ params, respond }) => {
    const { provider } = params as { provider: string };
    if (!provider) {
      respond(true, { ok: false, provider: "", error: "Missing required field: provider" });
      return;
    }

    const tester = PROVIDER_TESTERS[provider.toLowerCase()];
    if (!tester) {
      respond(true, {
        ok: false,
        provider,
        error: `Unknown provider: "${provider}". Valid: ${Object.keys(PROVIDER_TESTERS).join(", ")}`,
      });
      return;
    }

    const apiKey = process.env[tester.envKey] ?? "";
    if (!apiKey) {
      respond(true, {
        ok: false,
        provider,
        error: `No API key configured. Set ${tester.envKey} in your .env file or API Keys page.`,
      });
      return;
    }

    try {
      const result = await tester.testFn(apiKey);
      respond(true, result);
    } catch (err) {
      respond(true, {
        ok: false,
        provider,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
};
