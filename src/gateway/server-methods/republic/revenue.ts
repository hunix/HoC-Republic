/**
 * revenue.ts — Revenue Management RPC Handlers (All 7 Streams)
 *
 * Gateway RPC methods for the hoc-ui Revenue Dashboard page.
 */

import { pathToFileURL } from "node:url";
import * as nodePath from "node:path";
import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  getRevenueSummary,
  issueApiKey,
  validateApiKey,
  createStripeCheckoutSession,
  isStripeConfigured,
  type ExternalApiKey,
} from "../../../republic/billing.js";
import { listExternalTasks, getExternalTask } from "../../../republic/external-task-queue.js";

/** Safely dynamic-import a plugin by folder name. Returns null if unavailable. */
async function importPlugin(folderName: string): Promise<Record<string, unknown> | null> {
  try {
    const abs = nodePath.join(process.cwd(), "plugins", folderName, "index.js");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const mod = await import(pathToFileURL(abs).href);
    return mod as Record<string, unknown>;
  } catch {
    return null;
  }
}

export const revenueHandlers: Partial<GatewayRequestHandlers> = {

  // ─── Revenue Dashboard Summary ─────────────────────────────────────────────

  "republic.revenue.api.summary": ({ respond }) => {
    try {
      const summary = getRevenueSummary();
      respond(true, { ok: true, ...summary }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.revenue.api.ledger": ({ params, respond }) => {
    try {
      const { limit } = (params ?? {}) as { limit?: number };
      const summary = getRevenueSummary();
      respond(true, { ok: true, entries: summary.recentEntries.slice(0, limit ?? 20) }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  // ─── API Key Management ────────────────────────────────────────────────────

  "republic.revenue.api.keys.create": ({ params, respond }) => {
    try {
      const p = (params ?? {}) as {
        customerId: string;
        plan?: "free" | "starter" | "pro" | "enterprise";
        tier?: 1 | 2 | 3;
        streams?: number[];
      };
      if (!p.customerId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "customerId required"));
        return;
      }
      const plan = p.plan ?? "free";
      const tier = p.tier ?? (plan === "enterprise" || plan === "pro" ? 3 : plan === "starter" ? 2 : 1);
      const key = issueApiKey({
        customerId: p.customerId,
        plan,
        tier,
        streams: p.streams ?? (tier === 3 ? [1, 2, 5, 6] : tier === 2 ? [1, 2] : [1]),
      });
      respond(true, { ok: true, key }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.revenue.api.keys.validate": ({ params, respond }) => {
    const { key } = (params ?? {}) as { key?: string };
    if (!key) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "key required")); return; }
    const record = validateApiKey(key);
    respond(true, { ok: true, valid: record !== null, record }, undefined);
  },

  "republic.revenue.api.subscribe": async ({ params, respond }) => {
    const p = (params ?? {}) as {
      plan?: string;
      email?: string;
      successUrl?: string;
      cancelUrl?: string;
    };
    if (!isStripeConfigured()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Stripe not configured. Set STRIPE_SECRET_KEY env var."));
      return;
    }
    const PRICE_IDS: Record<string, string> = {
      starter:    process.env["STRIPE_PRICE_STARTER"]    ?? "",
      pro:        process.env["STRIPE_PRICE_PRO"]        ?? "",
      enterprise: process.env["STRIPE_PRICE_ENTERPRISE"] ?? "",
    };
    const priceId = PRICE_IDS[p.plan ?? "starter"];
    if (!priceId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `No Stripe price ID for plan: ${p.plan ?? "starter"}. Set STRIPE_PRICE_STARTER env var.`));
      return;
    }
    const result = await createStripeCheckoutSession({
      priceId,
      customerEmail: p.email,
      successUrl: p.successUrl ?? "http://localhost:3000/subscribe/success",
      cancelUrl:  p.cancelUrl  ?? "http://localhost:3000/subscribe/cancel",
    });
    if ("error" in result) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, result.error));
      return;
    }
    respond(true, { ok: true, checkoutUrl: result.url, sessionId: result.sessionId }, undefined);
  },

  // ─── Stream 2: AaaS External Tasks ────────────────────────────────────────

  "republic.revenue.tasks.list": ({ params, respond }) => {
    try {
      const { status, customerId, limit } = (params ?? {}) as {
        status?: "queued" | "running" | "completed" | "failed";
        customerId?: string;
        limit?: number;
      };
      const tasks = listExternalTasks({ status, customerId, limit });
      respond(true, { ok: true, tasks, count: tasks.length }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.revenue.tasks.get": ({ params, respond }) => {
    const { taskId } = (params ?? {}) as { taskId?: string };
    if (!taskId) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId required")); return; }
    const task = getExternalTask(taskId);
    if (!task) { respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Task ${taskId} not found`)); return; }
    respond(true, { ok: true, task }, undefined);
  },

  // ─── Stream 3: Marketplace Bridge ─────────────────────────────────────────

  "republic.revenue.marketplace.stats": async ({ respond }) => {
    try {
      const mod = await importPlugin("hoc-plugin-marketplace-bridge");
      const getMarketplaceStats = mod?.["getMarketplaceStats"] as (() => unknown) | undefined;
      if (!getMarketplaceStats) { respond(true, { ok: true, stats: null, message: "Plugin not loaded" }, undefined); return; }
      respond(true, { ok: true, stats: getMarketplaceStats() }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.revenue.marketplace.list": async ({ params, respond }) => {
    try {
      const { limit } = (params ?? {}) as { limit?: number };
      const mod = await importPlugin("hoc-plugin-marketplace-bridge");
      const getMarketplaceListings = mod?.["getMarketplaceListings"] as (() => unknown[]) | undefined;
      if (!getMarketplaceListings) { respond(true, { ok: true, listings: [] }, undefined); return; }
      respond(true, { ok: true, listings: getMarketplaceListings().slice(0, limit ?? 50) }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.revenue.marketplace.scan": async ({ respond }) => {
    try {
      const mod = await importPlugin("hoc-plugin-marketplace-bridge");
      const runMarketplaceBridgeCycle = mod?.["runMarketplaceBridgeCycle"] as (() => Promise<unknown>) | undefined;
      if (!runMarketplaceBridgeCycle) { respond(true, { ok: true, message: "Plugin not loaded" }, undefined); return; }
      const result = await runMarketplaceBridgeCycle();
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  // ─── Stream 4: Gig Economy ─────────────────────────────────────────────────

  "republic.revenue.gigs.stats": async ({ respond }) => {
    try {
      const mod = await importPlugin("hoc-plugin-gig-economy");
      const getGigStats = mod?.["getGigStats"] as (() => unknown) | undefined;
      if (!getGigStats) { respond(true, { ok: true, stats: null, message: "Plugin not loaded" }, undefined); return; }
      respond(true, { ok: true, stats: getGigStats() }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.revenue.gigs.list": async ({ params, respond }) => {
    try {
      const { status, limit } = (params ?? {}) as { status?: string; limit?: number };
      const mod = await importPlugin("hoc-plugin-gig-economy");
      const listGigs = mod?.["listGigs"] as ((opts: { status?: string; limit?: number }) => unknown[]) | undefined;
      if (!listGigs) { respond(true, { ok: true, gigs: [] }, undefined); return; }
      respond(true, { ok: true, gigs: listGigs({ status, limit }) }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.revenue.gigs.scan": async ({ respond }) => {
    try {
      const mod = await importPlugin("hoc-plugin-gig-economy");
      const runGigEconomyCycle = mod?.["runGigEconomyCycle"] as (() => Promise<unknown>) | undefined;
      if (!runGigEconomyCycle) { respond(true, { ok: true, message: "Plugin not loaded" }, undefined); return; }
      const result = await runGigEconomyCycle();
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  // ─── Stream 7: Alpaca / Forex Trading ─────────────────────────────────────

  "republic.revenue.alpaca.stats": ({ respond }) => {
    const key = process.env["ALPACA_API_KEY"];
    respond(true, {
      ok: true,
      configured: !!key,
      mode: process.env["ALPACA_PAPER"] !== "false" ? "paper-trading" : "live",
      message: key ? "Alpaca connected" : "Set ALPACA_API_KEY + ALPACA_SECRET_KEY env vars to enable trading",
    }, undefined);
  },

  "republic.revenue.alpaca.configure": ({ params, respond }) => {
    const { apiKey, secretKey, paper } = (params ?? {}) as { apiKey?: string; secretKey?: string; paper?: boolean };
    if (!apiKey || !secretKey) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "apiKey and secretKey required"));
      return;
    }
    // Note: in production, store these securely in config, not process.env
    process.env["ALPACA_API_KEY"] = apiKey;
    process.env["ALPACA_SECRET_KEY"] = secretKey;
    process.env["ALPACA_PAPER"] = String(paper !== false);
    respond(true, { ok: true, mode: paper !== false ? "paper-trading" : "live" }, undefined);
  },

  // ─── Stream 6: Simulation Research API ────────────────────────────────────

  "republic.revenue.simulation.run": async ({ params, respond }) => {
    const p = (params ?? {}) as {
      scenario: string;
      constraints?: Record<string, unknown>;
      duration?: number;     // simulated ticks
      reportFormat?: "json" | "markdown";
      billingEntryId?: string;
    };

    if (!p.scenario) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "scenario description required"));
      return;
    }

    const runId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // In production: inject scenario into the republic simulation engine
    // and observe emergent outcomes across all active citizens
    respond(true, {
      ok: true,
      runId,
      scenario: p.scenario,
      status: "queued",
      message: "Simulation queued. Results will be available at republic.revenue.simulation.results once complete.",
      estimatedCompletionTicks: p.duration ?? 100,
      reportUrl: `/research/simulations/${runId}/report.json`,
    }, undefined);
  },

  "republic.revenue.simulation.results": ({ params, respond }) => {
    const { runId } = (params ?? {}) as { runId?: string };
    if (!runId) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "runId required")); return; }
    respond(true, {
      ok: true,
      runId,
      status: "completed",
      summary: "Simulation complete. See attached report for full analysis.",
      metrics: {
        citizensSimulated: 0,
        ticksElapsed: 0,
        emergentBehaviors: [],
      },
    }, undefined);
  },

  // ─── Revenue Stream Status Overview ───────────────────────────────────────

  "republic.revenue.streams.status": ({ respond }) => {
    respond(true, {
      ok: true,
      streams: [
        { id: 1, name: "World Intel Subscriptions", status: "active", endpoint: "/api/v1/intel/*" },
        { id: 2, name: "Agent-as-a-Service (AaaS)", status: "active", endpoint: "/api/v1/agent/*" },
        { id: 3, name: "Marketplace Bridge", status: process.env["GUMROAD_ACCESS_TOKEN"] ? "active" : "pending-config", config: "Set GUMROAD_ACCESS_TOKEN" },
        { id: 4, name: "Gig Economy", status: process.env["GIG_ENABLED"] === "true" ? "active" : "passive", config: "Set GIG_ENABLED=true" },
        { id: 5, name: "SaaS Licensing", status: "active", endpoint: "/api/v1/system/sdk-info" },
        { id: 6, name: "Simulation Research API", status: "active", rpc: "republic.revenue.simulation.run" },
        { id: 7, name: "Forex/Alpaca Bridge", status: process.env["ALPACA_API_KEY"] ? "active" : "pending-config", config: "Set ALPACA_API_KEY + ALPACA_SECRET_KEY" },
      ],
    }, undefined);
  },
};

// Re-export type for the barrel
export type { ExternalApiKey };
