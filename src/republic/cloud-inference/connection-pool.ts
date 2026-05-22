/**
 * Cloud Inference — HTTP Connection Pool
 *
 * Provides keep-alive HTTP agents for LLM provider REST APIs.
 * Eliminates TLS handshake overhead (150-300ms) on subsequent requests
 * by reusing connections to the same origin.
 *
 * Node.js 18+ native fetch uses undici internally, which already does
 * connection pooling per-origin. But we can help by pre-configuring
 * optimal dispatcher settings and warming connections.
 *
 * For Node.js fetch(), we configure the global dispatcher to enable
 * persistent connections with sensible limits.
 */

import { Agent, setGlobalDispatcher } from "undici";

// ─── Global Connection Pool ──────────────────────────────────────
// Replaces the default undici agent with one tuned for LLM API workloads:
// - keepAliveTimeout: 30s (keep idle connections warm for rapid reuse)
// - connections: 6 per origin (max concurrent connections to one host)
// - pipelining: 1 (LLM APIs don't support pipelining, safe default)
// - connect.rejectUnauthorized: true (enforce TLS verification)

let _initialized = false;

export function initConnectionPool(): void {
  if (_initialized) {
    return;
  }
  _initialized = true;

  const agent = new Agent({
    keepAliveTimeout: 30_000, // 30s idle before closing
    keepAliveMaxTimeout: 120_000, // 2 min absolute max
    connections: 6, // per-origin concurrency
    pipelining: 1, // safe for REST APIs
    bodyTimeout: 120_000, // 2 min body read (LLM streaming)
    headersTimeout: 30_000, // 30s to get headers back
    connect: {
      rejectUnauthorized: true, // enforce TLS
    },
  });

  setGlobalDispatcher(agent);
}

// ─── Connection Warming ─────────────────────────────────────────
// Pre-establishes TLS connections to known LLM provider endpoints.
// Called once at boot — subsequent fetch() calls reuse the warm socket.

const PROVIDER_ORIGINS = [
  "https://api.openai.com",
  "https://api.anthropic.com",
  "https://api.groq.com",
  "https://generativelanguage.googleapis.com",
  "https://integrate.api.nvidia.com",
  "https://api.deepseek.com",
  "https://openrouter.ai",
];

/**
 * Fire-and-forget HEAD requests to warm TLS connections.
 * Failures are silently ignored — this is purely opportunistic.
 */
export async function warmConnections(): Promise<void> {
  const results = await Promise.allSettled(
    PROVIDER_ORIGINS.map((origin) =>
      fetch(origin, {
        method: "HEAD",
        signal: AbortSignal.timeout(5_000),
      }).catch(() => {
        /* expected — many origins 404 on HEAD */
      }),
    ),
  );
  const warmed = results.filter((r) => r.status === "fulfilled").length;
  if (warmed > 0) {
    // Silently warmed — no log spam. The benefit is measured in lower
    // first-request latency to each provider.
  }
}
