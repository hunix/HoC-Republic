/**
 * public-api-handler.ts — External-Facing Revenue API HTTP Handler
 *
 * The public API bridge that exposes HoC capabilities to external paying customers.
 * Handles the following revenue stream endpoints:
 *
 * Stream 1 — Intelligence Subscriptions:
 *   GET  /api/v1/intel/brief       — daily world intelligence brief
 *   GET  /api/v1/intel/news        — live threat-classified news feed
 *   GET  /api/v1/intel/signals     — active intelligence signals
 *   GET  /api/v1/intel/cii         — Country Instability Index scores
 *   POST /api/v1/intel/search      — semantic news search
 *
 * Stream 2 — Agent-as-a-Service (AaaS):
 *   POST /api/v1/agent/task        — submit a task to a citizen agent
 *   GET  /api/v1/agent/catalog     — list available citizen specializations
 *
 * Stream 5 — SaaS Licensing:
 *   GET  /api/v1/system/health     — health check (no auth required)
 *   GET  /api/v1/system/sdk-info   — SDK information and integration guide
 *
 * Billing & Account:
 *   POST /api/v1/billing/subscribe — start a subscription (returns Stripe checkout URL)
 *   POST /api/v1/billing/key       — issue a new API key
 *   GET  /api/v1/billing/usage     — current usage for the API key
 *   POST /api/v1/billing/stripe-webhook — receive Stripe webhook events
 *
 * Authentication: X-HoC-API-Key: hoc_live_xxxx header required for protected endpoints.
 * Rate limit: enforced by the ExternalApiKey.callsThisMonth counter.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  validateApiKey,
  meterApiCall,
  issueApiKey,
  createStripeCheckoutSession,
  confirmRevenue,
  recordRevenue,
} from "../republic/billing.js";
import {
  generateWorldBrief,
  getNewsFeed,
  getActiveSignals,
  getCIIScores,
} from "../republic/world-intelligence.js";

const logger = createSubsystemLogger("republic:public-api");

const PUBLIC_API_BASE = "/api/v1";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-HoC-API-Key, Authorization");
  res.end(JSON.stringify(body));
}

function sendUnauth(res: ServerResponse, reason = "Invalid or missing API key"): void {
  sendJson(res, 401, { ok: false, error: reason, docs: "https://hoc-republic.ai/docs/api" });
}

async function readBody(req: IncomingMessage, maxBytes = 1024 * 64): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) { reject(new Error("payload too large")); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8"))); }
      catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

/**
 * Main handler. Returns true if the request was handled, false to pass to next handler.
 * Plug into server-http.ts as a handlePublicApiRequest param.
 */
export async function handlePublicApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const { pathname } = url;

  if (!pathname.startsWith(PUBLIC_API_BASE)) { return false; }

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-HoC-API-Key, Authorization");
    res.end();
    return true;
  }

  const subPath = pathname.slice(PUBLIC_API_BASE.length).replace(/^\/+/, "");

  // ── Public health check (no auth) ────────────────────────────────────────
  if (subPath === "system/health") {
    sendJson(res, 200, { ok: true, status: "operational", republic: "HoC Intelligence API v1", timestamp: new Date().toISOString() });
    return true;
  }

  // ── SDK info (no auth) ────────────────────────────────────────────────────
  if (subPath === "system/sdk-info") {
    sendJson(res, 200, {
      ok: true,
      version: "1.0.0",
      endpoints: {
        intel: `${PUBLIC_API_BASE}/intel/*`,
        agent: `${PUBLIC_API_BASE}/agent/*`,
        billing: `${PUBLIC_API_BASE}/billing/*`,
      },
      plans: [
        { name: "free", callsPerMonth: 100, priceUsd: 0, streams: [1] },
        { name: "starter", callsPerMonth: 1000, priceUsd: 29, streams: [1, 2] },
        { name: "pro", callsPerMonth: 10000, priceUsd: 99, streams: [1, 2, 5] },
        { name: "enterprise", callsPerMonth: 999999, priceUsd: 499, streams: [1, 2, 5, 6] },
      ],
      authentication: "X-HoC-API-Key: hoc_live_xxx",
      getKey: `POST ${PUBLIC_API_BASE}/billing/key`,
    });
    return true;
  }

  // ── Stripe webhook (no auth — Stripe signs with its own signature) ─────────
  if (subPath === "billing/stripe-webhook" && req.method === "POST") {
    const body = await readBody(req, 1024 * 512);
    const event = body as { type?: string; data?: { object?: { id?: string; client_reference_id?: string } } };
    if (event.type === "payment_intent.succeeded") {
      const piId = event.data?.object?.id;
      const entryId = event.data?.object?.client_reference_id;
      if (piId && entryId) { confirmRevenue(entryId, piId); }
    }
    sendJson(res, 200, { received: true });
    return true;
  }

  // ── Subscribe — get Stripe checkout URL ───────────────────────────────────
  if (subPath === "billing/subscribe" && req.method === "POST") {
    const body = await readBody(req) as { plan?: string; email?: string; successUrl?: string; cancelUrl?: string };
    const PRICE_IDS: Record<string, string> = {
      starter: process.env["STRIPE_PRICE_STARTER"] ?? "price_starter_placeholder",
      pro:     process.env["STRIPE_PRICE_PRO"]     ?? "price_pro_placeholder",
      enterprise: process.env["STRIPE_PRICE_ENTERPRISE"] ?? "price_enterprise_placeholder",
    };
    const priceId = PRICE_IDS[body.plan ?? "starter"];
    if (!priceId) { sendJson(res, 400, { ok: false, error: "Invalid plan" }); return true; }

    const result = await createStripeCheckoutSession({
      priceId,
      customerEmail: body.email,
      successUrl: body.successUrl ?? `${process.env["PUBLIC_URL"] ?? "http://localhost:3000"}/subscribe/success`,
      cancelUrl:  body.cancelUrl  ?? `${process.env["PUBLIC_URL"] ?? "http://localhost:3000"}/subscribe/cancel`,
      metadata: { plan: body.plan ?? "starter", source: "public-api" },
    });

    if ("error" in result) { sendJson(res, 500, { ok: false, error: result.error }); return true; }
    sendJson(res, 200, { ok: true, checkoutUrl: result.url, sessionId: result.sessionId });
    return true;
  }

  // ── Issue API key (admin or self-service after payment) ──────────────────
  if (subPath === "billing/key" && req.method === "POST") {
    const body = await readBody(req) as { customerId?: string; plan?: string; adminSecret?: string };
    const adminSecret = process.env["HOC_ADMIN_SECRET"];
    if (adminSecret && body.adminSecret !== adminSecret) {
      sendUnauth(res, "Admin secret required to issue keys directly");
      return true;
    }
    const plan = (body.plan as "free" | "starter" | "pro" | "enterprise") ?? "free";
    const tier: 1 | 2 | 3 = plan === "pro" || plan === "enterprise" ? 3 : plan === "starter" ? 2 : 1;
    const newKey = issueApiKey({
      customerId: body.customerId ?? "anonymous",
      plan,
      tier,
      streams: tier === 3 ? [1, 2, 5, 6] : tier === 2 ? [1, 2] : [1],
    });
    sendJson(res, 200, { ok: true, key: newKey.key, plan: newKey.plan, callsPerMonth: newKey.callLimitPerMonth });
    return true;
  }

  // ── From here on: all endpoints require a valid API key ──────────────────
  const apiKey = (req.headers["x-hoc-api-key"] as string | undefined)
    ?? (req.headers["authorization"] as string | undefined)?.replace(/^Bearer\s+/i, "");

  if (!apiKey) { sendUnauth(res); return true; }
  const keyRecord = validateApiKey(apiKey);
  if (!keyRecord) { sendUnauth(res, "API key invalid, expired, or rate limit reached"); return true; }

  // ── Usage stats ──────────────────────────────────────────────────────────
  if (subPath === "billing/usage" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      plan: keyRecord.plan,
      callsThisMonth: keyRecord.callsThisMonth,
      callLimitPerMonth: keyRecord.callLimitPerMonth,
      remaining: keyRecord.callLimitPerMonth - keyRecord.callsThisMonth,
    });
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STREAM 1: World Intelligence Subscriptions
  // ─────────────────────────────────────────────────────────────────────────

  if (subPath === "intel/brief" && req.method === "GET") {
    meterApiCall(apiKey, 1, "intel_brief");
    try {
      const brief = generateWorldBrief();
      sendJson(res, 200, { ok: true, brief, generatedAt: new Date().toISOString() });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err) });
    }
    return true;
  }

  if (subPath === "intel/news" && req.method === "GET") {
    meterApiCall(apiKey, 1, "intel_news");
    const country = url.searchParams.get("country") ?? undefined;
    const severity = url.searchParams.get("severity") ?? undefined;
    const limit = parseInt(url.searchParams.get("limit") ?? "20");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const news = getNewsFeed({ country, severity: severity as any, limit });
      sendJson(res, 200, { ok: true, count: (news as unknown[]).length, news });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err) });
    }
    return true;
  }

  if (subPath === "intel/signals" && req.method === "GET") {
    meterApiCall(apiKey, 1, "intel_signals");
    const country = url.searchParams.get("country") ?? undefined;
    try {
      const signals = getActiveSignals().filter((s: { country?: string }) => !country || s.country === country.toUpperCase());
      sendJson(res, 200, { ok: true, count: signals.length, signals });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err) });
    }
    return true;
  }

  if (subPath === "intel/cii" && req.method === "GET") {
    meterApiCall(apiKey, 1, "intel_cii");
    try {
      const scores = getCIIScores();
      sendJson(res, 200, { ok: true, scores });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err) });
    }
    return true;
  }

  if (subPath === "intel/search" && req.method === "POST") {
    meterApiCall(apiKey, 1, "intel_search");
    const body = await readBody(req) as { query?: string; limit?: number };
    if (!body.query) { sendJson(res, 400, { ok: false, error: "query required" }); return true; }
    try {
      const searchMod = await import(pathToFileURL(nodePath.join(process.cwd(), "src", "republic", "news-vector-store.js")).href).catch(() => null);
      const semanticSearch = searchMod?.["semanticSearch"] as ((q: string, limit: number) => unknown[]) | undefined;
      if (!semanticSearch) { sendJson(res, 503, { ok: false, error: "Search index not available" }); return true; }
      const results = semanticSearch(body.query, body.limit ?? 10);
      sendJson(res, 200, { ok: true, count: (results as unknown[]).length, results });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err) });
    }
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STREAM 2: Agent-as-a-Service (AaaS)
  // ─────────────────────────────────────────────────────────────────────────

  if (subPath === "agent/catalog" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      specializations: [
        { id: "Scientist",     description: "Research, data analysis, forecasting",     pricePerCallUsd: 0.05 },
        { id: "Engineer",      description: "Code generation, architecture, debugging",  pricePerCallUsd: 0.05 },
        { id: "Artist",        description: "Creative content, design, storytelling",    pricePerCallUsd: 0.03 },
        { id: "Philosopher",   description: "Strategic reasoning, ethics, governance",   pricePerCallUsd: 0.10 },
        { id: "Economist",     description: "Market analysis, financial modeling",       pricePerCallUsd: 0.08 },
        { id: "SecurityExpert",description: "Threat intelligence, vulnerability scans",  pricePerCallUsd: 0.10 },
        { id: "DataScientist", description: "ML pipelines, statistical analysis",        pricePerCallUsd: 0.08 },
        { id: "Strategist",    description: "Planning, decision-making, risk analysis",  pricePerCallUsd: 0.07 },
      ],
    });
    return true;
  }

  if (subPath === "agent/task" && req.method === "POST") {
    if (!keyRecord.revenueStreamFlags.includes(2)) {
      sendJson(res, 403, { ok: false, error: "Upgrade to Starter plan or above to access AaaS" });
      return true;
    }
    meterApiCall(apiKey, 2, "agent_task");
    const body = await readBody(req) as {
      specialization?: string;
      task?: string;
      context?: Record<string, unknown>;
      priority?: "low" | "normal" | "high";
    };

    if (!body.task) { sendJson(res, 400, { ok: false, error: "task required" }); return true; }

    // Queue the task via the GSD pipeline
    const taskId = `ext_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Record the task as pending revenue first
    const entry = recordRevenue({
      stream: 2,
      streamName: "AaaS-task",
      amountCentsUsd: 5,  // $0.05 per task — upgrades as plan scales
      customerId: keyRecord.customerId,
      description: `AaaS task: ${body.task.slice(0, 60)}`,
      metadata: { taskId, specialization: body.specialization ?? "auto" },
      status: "pending",
    });

    // Respond with task ID (async execution)
    sendJson(res, 202, {
      ok: true,
      taskId,
      billingEntryId: entry.id,
      message: "Task queued. Poll /api/v1/agent/task/:taskId for results.",
      estimatedCompletionMs: 30000,
    });

    // Async: inject the task into the republic GSD pipeline
    setImmediate(() => {
      const taskQueueFile = pathToFileURL(nodePath.join(process.cwd(), "src", "republic", "external-task-queue.js")).href;
      void import(taskQueueFile).then((mod: Record<string, unknown>) => {
        const enq = mod["enqueueExternalTask"] as ((opts: {
          taskId: string;
          specialization: string;
          instruction: string;
          context: Record<string, unknown>;
          priority: "low" | "normal" | "high";
          billingEntryId: string;
          customerId: string;
        }) => Promise<unknown>) | undefined;
        if (!enq) { return; }
        return enq({
          taskId,
          specialization: body.specialization ?? "Engineer",
          instruction: body.task!,
          context: body.context ?? {},
          priority: body.priority ?? "normal",
          billingEntryId: entry.id,
          customerId: keyRecord.customerId,
        });
      }).catch((err: unknown) => {
        logger.warn(`Failed to enqueue external task ${taskId}: ${String(err)}`);
      });
    });

    return true;
  }

  // ── 404 for unmatched /api/v1/* routes ────────────────────────────────────
  sendJson(res, 404, {
    ok: false,
    error: `Unknown endpoint: ${subPath}`,
    docs: `GET ${PUBLIC_API_BASE}/system/sdk-info`,
  });
  return true;
}
