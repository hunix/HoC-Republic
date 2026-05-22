/**
 * Republic Gateway Handlers â€” finance
 * Auto-extracted from republic.ts for maintainability.
 */

/**
 * Republic Platform — Gateway RPC Handlers
 *
 * Thin adapter layer that maps JSON-RPC methods to the modular
 * Republic engine. All logic lives in src/republic/*.ts.
 *
 * This file ONLY contains the handler wiring — no types, no business
 * logic, no state management. Just delegation.
 */

import type { GatewayRequestHandlers } from "../types.js";
// Phase 36: Dynamic Compute Scaling
// Phase 35: Docker Orchestration Engine
import {
    capturePayment, createPayPalInvoice, getBtcBalance, getEthBalance, getFinancialGatewayDiagnostics, getPayPalBalance, sendBtc, sendEth, sendPayout
} from "../../../republic/financial-gateway.js";
// ─── Module Imports ─────────────────────────────────────────────
// Phase 33: Infrastructure Control Plane
import {
    acceptOrder, cancelOrder, completeOrder, createOrder, delistService, deliverOrder, getAllListings,
    getCitizenOrders, getCitizenReputation, getInternalListings, getMarketplaceDiagnostics, getPublicListings, listService, rateOrder, toggleMarketplace, updateListing
} from "../../../republic/marketplace.js";
// Phase 34: HuggingFace Model Provisioner
// Phase 37: Database Persistence Layer
import {
    divorce, expressEmotion, formRelationship, getCompatibility, getConversation, getMarried, getSocialLifeDiagnostics, proposeDate, sendMessage, throwParty
} from "../../../republic/social-life.js";
import {
    getState
} from "../../../republic/state.js";
import {
    allocateBudget, calculateROI, forecastRevenue, getAuditTrail, getFinancialReport, getTreasuryDiagnostics, recordRevenue, recordSpending
} from "../../../republic/treasury-manager.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

// Phase 6+8: New infrastructure module imports
import {
    citizenScrapeUrl,
    getCitizenN8nDiagnostics, provisionWorkflow as citizenProvisionWorkflow, type WorkflowTemplateType
} from "../../../republic/citizen-n8n.js";
import {
    askPremiumAI, getPremiumAIDiagnostics,
    type AITaskType
} from "../../../republic/premium-ai-controller.js";
import {
    getAffiliateLinks, getContentItems, getFreelanceGigs, getHarvester, getHarvesterDiagnostics, getHarvesters, getSaaSSubscriptions
} from "../../../republic/revenue-harvesters.js";
import {
    getRecentEarnings, getRevenueActivities, getRevenueConfig, getRevenueLoopDiagnostics, setRevenueConfig,
    setRevenueMode, type RevenueMode as RevenueModeType,
    type RevenueStreamType
} from "../../../republic/revenue-loop.js";
import {
    getQueueLength, getScreenQueueDiagnostics, isScreenAvailable
} from "../../../republic/screen-queue.js";
import {
    captureAndAnalyze, checkVisionAvailability, getVisionDiagnostics as getVisionAnalyzerDiagnostics
} from "../../../republic/vision-analyzer.js";

export const financeHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Phase 11: Financial Gateway ────────────────────────────────

  "republic.finance.createInvoice": async ({ params, respond }) => {
    const p = params as
      | { clientName?: string; clientEmail?: string; items?: unknown[]; currency?: string }
      | undefined;
    if (!p?.clientEmail || !p?.items) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "clientEmail and items required"),
      );
      return;
    }
    try {
      const result = await createPayPalInvoice(
        p.clientName ?? "Client",
        p.clientEmail,
        p.items as { description: string; quantity: number; unitPrice: number }[],
        p.currency ?? "USD",
      );
      respond(true, { ok: true, invoice: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.finance.capturePayment": async ({ params, respond }) => {
    const p = params as { orderId?: string } | undefined;
    if (!p?.orderId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "orderId required"));
      return;
    }
    try {
      const result = await capturePayment(p.orderId);
      respond(true, { ok: true, capture: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.finance.sendPayout": async ({ params, respond }) => {
    const p = params as { recipientEmail?: string; amount?: number; currency?: string } | undefined;
    if (!p?.recipientEmail || !p?.amount) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "recipientEmail and amount required"),
      );
      return;
    }
    try {
      const result = await sendPayout(p.recipientEmail, p.amount, p.currency ?? "USD");
      respond(true, { ok: true, payout: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.finance.balance": async ({ params, respond }) => {
    const p = params as { type?: string } | undefined;
    try {
      const type = p?.type ?? "paypal";
      let balance: unknown;
      if (type === "eth") {
        balance = await getEthBalance();
      } else if (type === "btc") {
        balance = await getBtcBalance();
      } else {
        balance = getPayPalBalance();
      }
      respond(true, { ok: true, type, balance }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.finance.sendEth": async ({ params, respond }) => {
    const p = params as { to?: string; amount?: number } | undefined;
    if (!p?.to || !p?.amount) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "to and amount required"));
      return;
    }
    try {
      const result = await sendEth(p.to, String(p.amount));
      respond(true, { ok: true, tx: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.finance.sendBtc": async ({ params, respond }) => {
    const p = params as { to?: string; amount?: number } | undefined;
    if (!p?.to || !p?.amount) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "to and amount required"));
      return;
    }
    try {
      const result = await sendBtc(p.to, String(p.amount));
      respond(true, { ok: true, tx: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.finance.diagnostics": ({ respond }) => {
    respond(true, getFinancialGatewayDiagnostics(), undefined);
  },

  // ─── Phase 11: Treasury Manager ─────────────────────────────────

  "republic.treasury.recordRevenue": ({ params, respond }) => {
    const p = params as { source?: string; amount?: number; currency?: string } | undefined;
    if (!p?.source || !p?.amount) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "source and amount required"),
      );
      return;
    }
    const entry = recordRevenue(
      p.amount,
      p.currency ?? "USD",
      p.source as "paypal" | "crypto" | "marketplace" | "harvester" | "other",
      p.source,
    );
    respond(true, { ok: true, entry }, undefined);
  },

  "republic.treasury.allocateBudget": ({ params, respond }) => {
    const p = params as
      | { department?: string; amount?: number; period?: string; currency?: string }
      | undefined;
    if (!p?.department || !p?.amount) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "department and amount required"),
      );
      return;
    }
    const result = allocateBudget(
      p.department,
      p.amount,
      p.currency ?? "USD",
      "system",
      p.period ?? "monthly",
    );
    respond(true, { ok: true, budget: result }, undefined);
  },

  "republic.treasury.recordSpending": ({ params, respond }) => {
    const p = params as { department?: string; amount?: number; description?: string } | undefined;
    if (!p?.department || !p?.amount) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "department and amount required"),
      );
      return;
    }
    const entry = recordSpending(p.department, p.amount, p.description ?? "");
    respond(true, { ok: true, entry }, undefined);
  },

  "republic.treasury.report": ({ respond }) => {
    const report = getFinancialReport();
    respond(true, { ok: true, report }, undefined);
  },

  "republic.treasury.forecast": ({ params, respond }) => {
    const p = params as { months?: number } | undefined;
    const forecast = forecastRevenue(p?.months ?? 3);
    respond(true, { ok: true, forecast }, undefined);
  },

  "republic.treasury.roi": ({ params, respond }) => {
    const p = params as { projectId?: string } | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    const roi = calculateROI(p.projectId);
    respond(true, { ok: true, roi }, undefined);
  },

  "republic.treasury.auditTrail": ({ params, respond }) => {
    const p = params as { limit?: number } | undefined;
    const s = getState();
    const trail = getAuditTrail(s, p?.limit ?? 50);
    respond(true, { ok: true, trail }, undefined);
  },

  "republic.treasury.diagnostics": ({ respond }) => {
    respond(true, getTreasuryDiagnostics(), undefined);
  },

  // ─── Phase 11: Marketplace ──────────────────────────────────────

  "republic.marketplace.listService": ({ params, respond }) => {
    const p = params as
      | {
          citizenId?: string;
          title?: string;
          description?: string;
          price?: number;
          currency?: string;
          category?: string;
          visibility?: "public" | "internal" | "both";
        }
      | undefined;
    if (!p?.citizenId || !p?.title || !p?.description || p?.price == null) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId, title, description, and price required"),
      );
      return;
    }
    const s = getState();
    const listing = listService(
      s,
      p.citizenId,
      p.title,
      p.description,
      p.price,
      p.currency,
      p.category,
      p.visibility,
    );
    respond(true, { ok: true, listing }, undefined);
  },

  "republic.marketplace.delistService": ({ params, respond }) => {
    const p = params as { listingId?: string; citizenId?: string } | undefined;
    if (!p?.listingId || !p?.citizenId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "listingId and citizenId required"),
      );
      return;
    }
    const s = getState();
    const result = delistService(s, p.listingId, p.citizenId);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.error ? errorShape(ErrorCodes.INVALID_REQUEST, result.error) : undefined,
    );
  },

  "republic.marketplace.updateListing": ({ params, respond }) => {
    const p = params as
      | { listingId?: string; citizenId?: string; updates?: Record<string, unknown> }
      | undefined;
    if (!p?.listingId || !p?.citizenId || !p?.updates) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "listingId, citizenId, and updates required"),
      );
      return;
    }
    const s = getState();
    const result = updateListing(
      s,
      p.listingId,
      p.citizenId,
      p.updates as Parameters<typeof updateListing>[3],
    );
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.error ? errorShape(ErrorCodes.INVALID_REQUEST, result.error) : undefined,
    );
  },

  "republic.marketplace.createOrder": ({ params, respond }) => {
    const p = params as { listingId?: string; buyerId?: string } | undefined;
    if (!p?.listingId || !p?.buyerId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "listingId and buyerId required"),
      );
      return;
    }
    const s = getState();
    const result = createOrder(s, p.listingId, p.buyerId);
    if ("error" in result) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error));
    } else {
      respond(true, { ok: true, order: result }, undefined);
    }
  },

  "republic.marketplace.acceptOrder": ({ params, respond }) => {
    const p = params as { orderId?: string; sellerId?: string } | undefined;
    if (!p?.orderId || !p?.sellerId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "orderId and sellerId required"),
      );
      return;
    }
    const s = getState();
    const result = acceptOrder(s, p.orderId, p.sellerId);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.error ? errorShape(ErrorCodes.INVALID_REQUEST, result.error) : undefined,
    );
  },

  "republic.marketplace.deliverOrder": ({ params, respond }) => {
    const p = params as { orderId?: string; sellerId?: string; artifacts?: string[] } | undefined;
    if (!p?.orderId || !p?.sellerId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "orderId and sellerId required"),
      );
      return;
    }
    const s = getState();
    const result = deliverOrder(s, p.orderId, p.sellerId, p.artifacts ?? []);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.error ? errorShape(ErrorCodes.INVALID_REQUEST, result.error) : undefined,
    );
  },

  "republic.marketplace.completeOrder": ({ params, respond }) => {
    const p = params as { orderId?: string; buyerId?: string } | undefined;
    if (!p?.orderId || !p?.buyerId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "orderId and buyerId required"),
      );
      return;
    }
    const s = getState();
    const result = completeOrder(s, p.orderId, p.buyerId);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.error ? errorShape(ErrorCodes.INVALID_REQUEST, result.error) : undefined,
    );
  },

  "republic.marketplace.cancelOrder": ({ params, respond }) => {
    const p = params as { orderId?: string; userId?: string } | undefined;
    if (!p?.orderId || !p?.userId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "orderId and userId required"),
      );
      return;
    }
    const s = getState();
    const result = cancelOrder(s, p.orderId, p.userId);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.error ? errorShape(ErrorCodes.INVALID_REQUEST, result.error) : undefined,
    );
  },

  "republic.marketplace.rateOrder": ({ params, respond }) => {
    const p = params as
      | { orderId?: string; buyerId?: string; rating?: number; review?: string }
      | undefined;
    if (!p?.orderId || !p?.buyerId || p?.rating == null) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "orderId, buyerId, and rating required"),
      );
      return;
    }
    const s = getState();
    const result = rateOrder(s, p.orderId, p.buyerId, p.rating, p.review ?? "");
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.error ? errorShape(ErrorCodes.INVALID_REQUEST, result.error) : undefined,
    );
  },

  "republic.marketplace.listings": ({ params, respond }) => {
    const p = params as { type?: string; citizenId?: string; limit?: number } | undefined;
    const s = getState();
    const type = p?.type ?? "all";
    let listings;
    if (p?.citizenId) {
      listings = getCitizenOrders(s, p.citizenId);
    } else if (type === "public") {
      listings = getPublicListings(s, p?.limit);
    } else if (type === "internal") {
      listings = getInternalListings(s, p?.limit);
    } else {
      listings = getAllListings(s, p?.limit);
    }
    respond(true, { ok: true, listings }, undefined);
  },

  "republic.marketplace.reputation": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const s = getState();
    const rep = getCitizenReputation(s, p.citizenId);
    respond(true, { ok: true, reputation: rep }, undefined);
  },

  "republic.marketplace.toggle": ({ params, respond }) => {
    const p = params as { target?: "public" | "internal"; enabled?: boolean } | undefined;
    if (!p?.target || p?.enabled == null) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "target and enabled required"),
      );
      return;
    }
    const s = getState();
    toggleMarketplace(s, p.target, p.enabled);
    respond(true, { ok: true }, undefined);
  },

  "republic.marketplace.diagnostics": ({ respond }) => {
    const s = getState();
    respond(true, getMarketplaceDiagnostics(s), undefined);
  },

  // ─── Phase 11: Social Life ──────────────────────────────────────

  "republic.social.addRelationship": ({ params, respond }) => {
    const p = params as { citizenId?: string; targetId?: string; type?: string } | undefined;
    if (!p?.citizenId || !p?.targetId || !p?.type) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId, targetId, and type required"),
      );
      return;
    }
    const s = getState();
    formRelationship(s, p.citizenId, p.targetId, p.type as Parameters<typeof formRelationship>[3]);
    respond(true, { ok: true }, undefined);
  },

  "republic.social.startDating": ({ params, respond }) => {
    const p = params as { citizenId?: string; targetId?: string } | undefined;
    if (!p?.citizenId || !p?.targetId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and targetId required"),
      );
      return;
    }
    const s = getState();
    const result = proposeDate(s, p.citizenId, p.targetId);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.error ? errorShape(ErrorCodes.INVALID_REQUEST, result.error) : undefined,
    );
  },

  "republic.social.marry": ({ params, respond }) => {
    const p = params as { citizenId?: string; targetId?: string } | undefined;
    if (!p?.citizenId || !p?.targetId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and targetId required"),
      );
      return;
    }
    const s = getState();
    const result = getMarried(s, p.citizenId);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.error ? errorShape(ErrorCodes.INVALID_REQUEST, result.error) : undefined,
    );
  },

  "republic.social.divorce": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const s = getState();
    const result = divorce(s, p.citizenId);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.error ? errorShape(ErrorCodes.INVALID_REQUEST, result.error) : undefined,
    );
  },

  "republic.social.sendMessage": ({ params, respond }) => {
    const p = params as { fromId?: string; toId?: string; content?: string } | undefined;
    if (!p?.fromId || !p?.toId || !p?.content) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "fromId, toId, and content required"),
      );
      return;
    }
    const s = getState();
    const msg = sendMessage(s, p.fromId, p.toId, p.content);
    respond(true, { ok: true, message: msg }, undefined);
  },

  "republic.social.conversation": ({ params, respond }) => {
    const p = params as { citizenId?: string; otherId?: string; limit?: number } | undefined;
    if (!p?.citizenId || !p?.otherId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and otherId required"),
      );
      return;
    }
    const s = getState();
    const messages = getConversation(s, p.citizenId, p.otherId, p.limit);
    respond(true, { ok: true, messages }, undefined);
  },

  "republic.social.throwParty": ({ params, respond }) => {
    const p = params as { hostId?: string; guestIds?: string[] } | undefined;
    if (!p?.hostId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "hostId required"));
      return;
    }
    const s = getState();
    throwParty(s, p.hostId, p.guestIds);
    respond(true, { ok: true }, undefined);
  },

  "republic.social.setMood": ({ params, respond }) => {
    const p = params as { citizenId?: string; mood?: string } | undefined;
    if (!p?.citizenId || !p?.mood) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and mood required"),
      );
      return;
    }
    const s = getState();
    expressEmotion(s, p.citizenId, p.mood);
    respond(true, { ok: true }, undefined);
  },

  "republic.social.compatibility": ({ params, respond }) => {
    const p = params as { citizenId?: string; targetId?: string } | undefined;
    if (!p?.citizenId || !p?.targetId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and targetId required"),
      );
      return;
    }
    const s = getState();
    const compat = getCompatibility(s, p.citizenId, p.targetId);
    respond(true, { ok: true, compatibility: compat }, undefined);
  },

  "republic.social.diagnostics": ({ respond }) => {
    const s = getState();
    respond(true, getSocialLifeDiagnostics(s), undefined);
  },

  // ─── Phase 6: Infrastructure Control RPCs ─────────────────────────

  "republic.infra.screenQueue.status": ({ respond }) => {
    respond(true, {
      ok: true,
      available: isScreenAvailable(),
      queueLength: getQueueLength(),
      diagnostics: getScreenQueueDiagnostics(),
    }, undefined);
  },

  "republic.infra.n8n.provision": async ({ params, respond }) => {
    const p = params as { citizenId?: string; citizenName?: string; templateId?: string; config?: Record<string, string> } | undefined;
    if (!p?.citizenId || !p?.templateId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and templateId required"));
      return;
    }
    try {
      const result = await citizenProvisionWorkflow(
        p.citizenId,
        p.citizenName ?? "Citizen",
        p.templateId as WorkflowTemplateType,
        p.config,
      );
      respond(true, { ok: true, workflow: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.infra.n8n.scrape": async ({ params, respond }) => {
    const p = params as { citizenId?: string; citizenName?: string; url?: string } | undefined;
    if (!p?.citizenId || !p?.url) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and url required"));
      return;
    }
    try {
      const result = await citizenScrapeUrl(p.citizenId, p.citizenName ?? "Citizen", p.url);
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.infra.n8n.diagnostics": ({ respond }) => {
    respond(true, getCitizenN8nDiagnostics(), undefined);
  },

  "republic.infra.vision.analyze": async ({ params, respond }) => {
    const p = params as { prompt?: string } | undefined;
    if (!p?.prompt) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "prompt required"));
      return;
    }
    try {
      const result = await captureAndAnalyze(p.prompt);
      respond(true, { ok: true, analysis: result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.infra.vision.check": async ({ respond }) => {
    try {
      const available = await checkVisionAvailability();
      respond(true, { ok: true, available }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.infra.vision.diagnostics": ({ respond }) => {
    respond(true, getVisionAnalyzerDiagnostics(), undefined);
  },

  "republic.infra.premiumAI.ask": async ({ params, respond }) => {
    const p = params as { citizenId?: string; citizenName?: string; prompt?: string; taskType?: string; preferredProvider?: string } | undefined;
    if (!p?.citizenId || !p?.prompt) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and prompt required"));
      return;
    }
    try {
      const result = await askPremiumAI(
        p.citizenId,
        p.citizenName ?? "Citizen",
        p.prompt,
        (p.taskType as AITaskType) ?? undefined,
        p.preferredProvider as "chatgpt" | "gemini" | "claude" | undefined,
      );
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.infra.premiumAI.diagnostics": ({ respond }) => {
    respond(true, getPremiumAIDiagnostics(), undefined);
  },

  // ─── Phase 8: Revenue Config & Dashboard RPCs ──────────────────────

  "republic.revenue.config.get": ({ respond }) => {
    respond(true, { ok: true, config: getRevenueConfig() }, undefined);
  },

  "republic.revenue.config.set": ({ params, respond }) => {
    const p = params as {
      mode?: RevenueModeType;
      enabledStreams?: RevenueStreamType[];
      maxUsdPerTrade?: number;
      maxUsdPerProject?: number;
      requireApprovalAbove?: number;
      autoResearchEnabled?: boolean;
      autoProjectsEnabled?: boolean;
      autoTradingEnabled?: boolean;
    } | undefined;
    if (!p) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "config updates required"));
      return;
    }
    setRevenueConfig(p);
    respond(true, { ok: true, config: getRevenueConfig() }, undefined);
  },

  "republic.revenue.mode": ({ params, respond }) => {
    const p = params as { mode?: RevenueModeType } | undefined;
    if (!p?.mode || (p.mode !== "simulated" && p.mode !== "live")) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "mode must be 'simulated' or 'live'"));
      return;
    }
    setRevenueMode(p.mode);
    respond(true, { ok: true, mode: p.mode }, undefined);
  },

  "republic.revenue.activities": ({ params, respond }) => {
    const p = params as { limit?: number; type?: string } | undefined;
    const activities = getRevenueActivities(
      p?.limit ?? 50,
      p?.type as "scan" | "research" | "project" | "harvest" | "payment" | "trade" | "error" | undefined,
    );
    respond(true, { ok: true, activities }, undefined);
  },

  "republic.revenue.earnings": ({ params, respond }) => {
    const p = params as { hours?: number } | undefined;
    const earnings = getRecentEarnings(p?.hours ?? 24);
    respond(true, { ok: true, earnings, period: `${p?.hours ?? 24}h` }, undefined);
  },

  "republic.revenue.harvesters": ({ respond }) => {
    respond(true, { ok: true, harvesters: getHarvesters() }, undefined);
  },

  "republic.revenue.harvester": ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const harvester = getHarvester(p.id);
    if (!harvester) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Harvester not found"));
      return;
    }
    respond(true, { ok: true, harvester }, undefined);
  },

  "republic.revenue.gigs": ({ params, respond }) => {
    const p = params as { status?: string } | undefined;
    const gigs = getFreelanceGigs(
      p?.status as "available" | "applied" | "in_progress" | "completed" | "cancelled" | undefined,
    );
    respond(true, { ok: true, gigs }, undefined);
  },

  "republic.revenue.content": ({ params, respond }) => {
    const p = params as { status?: string } | undefined;
    const content = getContentItems(
      p?.status as "draft" | "published" | "monetized" | undefined,
    );
    respond(true, { ok: true, content }, undefined);
  },

  "republic.revenue.affiliates": ({ respond }) => {
    const links = getAffiliateLinks();
    respond(true, { ok: true, links }, undefined);
  },

  "republic.revenue.subscriptions": ({ respond }) => {
    const subs = getSaaSSubscriptions();
    respond(true, { ok: true, subscriptions: subs }, undefined);
  },

  "republic.revenue.dashboard": ({ respond }) => {
    const s = getState();
    const diag = getRevenueLoopDiagnostics(s);
    respond(true, { ok: true, dashboard: diag }, undefined);
  },

  "republic.revenue.diagnostics": ({ respond }) => {
    respond(true, getHarvesterDiagnostics(), undefined);
  },

};
