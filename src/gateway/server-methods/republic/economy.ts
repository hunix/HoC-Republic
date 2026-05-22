/**
 * Economy Domain — Gateway RPC Handlers
 *
 * Exposes the full autonomous commercial republic engine via RPC:
 *   republic.store.*      — AI Store product management
 *   republic.trends.*     — Trend Intelligence Engine
 *   republic.marketing.*  — Autonomous Marketing Bureau
 *   republic.publish.*    — Cross-Platform Publisher
 *   republic.company.*    — Product Company Formation
 *   republic.backoffice.* — Backoffice Automation
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  createProduct, queueGeneration, completeGeneration, failGeneration,
  recordPurchase, listProducts, getProduct, getGenerationQueue,
  getPurchaseHistory, getStoreStats,
  type ProductCategory, type ContentRating,
} from "../../../republic/economy/ai-store-pipeline.js";
import {
  runTrendScan, listSignals, getSignal, assignSignal,
  injectManualSignal, generateStrategy, getTrendStats,
} from "../../../republic/economy/trend-intelligence.js";
import {
  generateMarketingPackage, getMarketingPackage, updateMediaUrls,
  listMarketingPackages, getMarketingStats,
} from "../../../republic/economy/marketing-bureau.js";
import {
  publishToPlatform, publishToAll, getPublications,
  listAllPublications, getPublisherStats, type PublishPlatform,
} from "../../../republic/economy/platform-publisher.js";
import {
  formCompany, getCompany, getCompanyByProduct, listCompanies,
  updateRevenue, getCompanyStats, type CitizenRef,
} from "../../../republic/economy/company-formation.js";
import {
  bumpVersion, generateAnalyticsReport, recordRefundIssued,
  generateReviewResponse, getChangelog, getAllChangelogs,
  getEvents, getBackofficeStats,
} from "../../../republic/economy/backoffice-engine.js";

export const economyHandlers: Partial<GatewayRequestHandlers> = {

  // ─── AI Store: Products ─────────────────────────────────────────────────────

  "republic.store.create": ({ params, respond }) => {
    const p = params as {
      title: string; description: string; category: ProductCategory;
      creatorIds: string[]; creatorNames: string[]; priceUsd: number;
      tags?: string[]; contentRating?: ContentRating;
    };
    const product = createProduct(p.title, p.description, p.category, p.creatorIds, p.creatorNames, p.priceUsd, { tags: p.tags, contentRating: p.contentRating });
    respond(true, { ok: true, product });
  },

  "republic.store.list": ({ params, respond }) => {
    const p = params as { category?: string; status?: string; creatorId?: string; limit?: number; sortBy?: string };
    const products = listProducts({ category: p.category as ProductCategory, status: p.status as never, creatorId: p.creatorId, limit: p.limit, sortBy: p.sortBy as never });
    respond(true, { ok: true, products, total: products.length });
  },

  "republic.store.get": ({ params, respond }) => {
    const { id } = params as { id: string };
    const product = getProduct(id);
    if (!product) { respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Product ${id} not found`)); return; }
    respond(true, { ok: true, product });
  },

  "republic.store.queue-generation": ({ params, respond }) => {
    const { productId, prompt, citizenId } = params as { productId: string; prompt: string; citizenId: string };
    const req = queueGeneration(productId, prompt, citizenId);
    respond(true, { ok: true, request: req });
  },

  "republic.store.complete-generation": ({ params, respond }) => {
    const p = params as { requestId: string; contentUrl: string; thumbnailUrl?: string; previewUrl?: string; providerUsed?: string };
    const product = completeGeneration(p.requestId, p.contentUrl, { thumbnailUrl: p.thumbnailUrl, previewUrl: p.previewUrl, providerUsed: p.providerUsed });
    if (!product) { respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Generation ${p.requestId} not found`)); return; }
    respond(true, { ok: true, product });
  },

  "republic.store.fail-generation": ({ params, respond }) => {
    const { requestId, error } = params as { requestId: string; error: string };
    failGeneration(requestId, error);
    respond(true, { ok: true });
  },

  "republic.store.purchase": ({ params, respond }) => {
    const p = params as { productId: string; amountUsd: number; paymentMethod: "paypal" | "binance" | "credits"; buyerEmail?: string; paymentRef?: string };
    const result = recordPurchase(p.productId, p.amountUsd, p.paymentMethod, { buyerEmail: p.buyerEmail, paymentRef: p.paymentRef });
    respond(true, { ok: true, purchase: result });
  },

  "republic.store.generation-queue": ({ params, respond }) => {
    const { status } = params as { status?: string };
    respond(true, { ok: true, queue: getGenerationQueue(status as never) });
  },

  "republic.store.purchase-history": ({ params, respond }) => {
    const { productId, limit } = params as { productId?: string; limit?: number };
    respond(true, { ok: true, history: getPurchaseHistory(productId, limit) });
  },

  "republic.store.stats": ({ respond }) => {
    respond(true, { ok: true, stats: getStoreStats() });
  },

  // ─── Trend Intelligence ─────────────────────────────────────────────────────

  "republic.trends.scan": async ({ respond }) => {
    const result = await runTrendScan();
    respond(true, { ok: true, ...result });
  },

  "republic.trends.list": ({ params, respond }) => {
    const p = params as { source?: string; minMomentum?: number; minMonetization?: number; productType?: string; status?: string; limit?: number };
    const signals = listSignals(p as Parameters<typeof listSignals>[0]);
    respond(true, { ok: true, signals, total: signals.length });
  },

  "republic.trends.get": ({ params, respond }) => {
    const { id } = params as { id: string };
    const signal = getSignal(id);
    if (!signal) { respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Signal ${id} not found`)); return; }
    respond(true, { ok: true, signal });
  },

  "republic.trends.assign": ({ params, respond }) => {
    const { signalId, citizenIds } = params as { signalId: string; citizenIds: string[] };
    const ok = assignSignal(signalId, citizenIds);
    respond(ok, { ok });
  },

  "republic.trends.inject": ({ params, respond }) => {
    const p = params as Parameters<typeof injectManualSignal>[0];
    const signal = injectManualSignal(p);
    respond(true, { ok: true, signal });
  },

  "republic.trends.strategy": ({ params, respond }) => {
    const { signalId } = params as { signalId: string };
    try {
      const strategy = generateStrategy(signalId);
      respond(true, { ok: true, strategy });
    } catch (e) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, String(e)));
    }
  },

  "republic.trends.stats": ({ respond }) => {
    respond(true, { ok: true, stats: getTrendStats() });
  },

  // ─── Marketing Bureau ───────────────────────────────────────────────────────

  "republic.marketing.generate": ({ params, respond }) => {
    const p = params as { productId: string; productTitle: string; productCategory: string; productDescription: string; creatorNames: string[]; priceUsd: number };
    const pkg = generateMarketingPackage(p.productId, p.productTitle, p.productCategory, p.productDescription, p.creatorNames, p.priceUsd);
    respond(true, { ok: true, package: pkg });
  },

  "republic.marketing.get": ({ params, respond }) => {
    const { productId } = params as { productId: string };
    const pkg = getMarketingPackage(productId);
    if (!pkg) { respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `No marketing package for ${productId}`)); return; }
    respond(true, { ok: true, package: pkg });
  },

  "republic.marketing.update-media": ({ params, respond }) => {
    const { productId, socialCardUrl, thumbnailUrl, promoVideoUrl } = params as { productId: string; socialCardUrl?: string; thumbnailUrl?: string; promoVideoUrl?: string };
    const ok = updateMediaUrls(productId, { socialCardUrl, thumbnailUrl, promoVideoUrl });
    respond(ok, { ok });
  },

  "republic.marketing.list": ({ params, respond }) => {
    const { limit } = params as { limit?: number };
    respond(true, { ok: true, packages: listMarketingPackages(limit), stats: getMarketingStats() });
  },

  // ─── Platform Publisher ─────────────────────────────────────────────────────

  "republic.publish.to-platform": async ({ params, respond }) => {
    const p = params as { productId: string; productTitle: string; productCategory: string; productDescription: string; priceUsd: number; platform: PublishPlatform; tweetText?: string; contentUrl?: string };
    const record = await publishToPlatform(p, p.platform);
    respond(true, { ok: true, record });
  },

  "republic.publish.all": async ({ params, respond }) => {
    const p = params as { productId: string; productTitle: string; productCategory: string; productDescription: string; priceUsd: number; tweetText?: string; contentUrl?: string };
    const records = await publishToAll(p);
    respond(true, { ok: true, records, published: records.filter(r => r.status === "published").length, skipped: records.filter(r => r.status === "skipped").length, failed: records.filter(r => r.status === "failed").length });
  },

  "republic.publish.status": ({ params, respond }) => {
    const { productId } = params as { productId: string };
    respond(true, { ok: true, publications: getPublications(productId) });
  },

  "republic.publish.list": ({ params, respond }) => {
    const { limit } = params as { limit?: number };
    respond(true, { ok: true, publications: listAllPublications(limit), stats: getPublisherStats() });
  },

  "republic.publish.stats": ({ respond }) => {
    respond(true, { ok: true, stats: getPublisherStats() });
  },

  // ─── Company Formation ──────────────────────────────────────────────────────

  "republic.company.form": ({ params, respond }) => {
    const p = params as { productId: string; productTitle: string; productCategory: string; productDescription: string; priceUsd: number; citizens: CitizenRef[] };
    const company = formCompany(p);
    respond(true, { ok: true, company });
  },

  "republic.company.get": ({ params, respond }) => {
    const { companyId, productId } = params as { companyId?: string; productId?: string };
    const company = companyId ? getCompany(companyId) : productId ? getCompanyByProduct(productId) : undefined;
    if (!company) { respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Company not found")); return; }
    respond(true, { ok: true, company });
  },

  "republic.company.list": ({ params, respond }) => {
    const { limit } = params as { limit?: number };
    respond(true, { ok: true, companies: listCompanies(limit), stats: getCompanyStats() });
  },

  "republic.company.update-revenue": ({ params, respond }) => {
    const { productId, amount } = params as { productId: string; amount: number };
    updateRevenue(productId, amount);
    respond(true, { ok: true });
  },

  "republic.company.stats": ({ respond }) => {
    respond(true, { ok: true, stats: getCompanyStats() });
  },

  // ─── Backoffice ─────────────────────────────────────────────────────────────

  "republic.backoffice.bump-version": ({ params, respond }) => {
    const { productId, productTitle, changes } = params as { productId: string; productTitle: string; changes: string[] };
    const entry = bumpVersion(productId, productTitle, changes);
    respond(true, { ok: true, entry });
  },

  "republic.backoffice.analytics": ({ params, respond }) => {
    const { products } = params as { products: Array<{ id: string; title: string; revenue: number; purchaseCount: number; category: string }> };
    const report = generateAnalyticsReport(products);
    respond(true, { ok: true, report });
  },

  "republic.backoffice.record-refund": ({ params, respond }) => {
    const { productId, productTitle, amountUsd, reason } = params as { productId: string; productTitle: string; amountUsd: number; reason: string };
    recordRefundIssued(productId, productTitle, amountUsd, reason);
    respond(true, { ok: true });
  },

  "republic.backoffice.review-response": ({ params, respond }) => {
    const { productId, productTitle, reviewText, rating } = params as { productId: string; productTitle: string; reviewText: string; rating: number };
    const response = generateReviewResponse(productId, productTitle, reviewText, rating);
    respond(true, { ok: true, response });
  },

  "republic.backoffice.changelog": ({ params, respond }) => {
    const { productId } = params as { productId?: string };
    const entries = productId ? getChangelog(productId) : getAllChangelogs();
    respond(true, { ok: true, entries });
  },

  "republic.backoffice.events": ({ params, respond }) => {
    const { limit } = params as { limit?: number };
    respond(true, { ok: true, events: getEvents(limit), stats: getBackofficeStats() });
  },

  "republic.backoffice.stats": ({ respond }) => {
    respond(true, { ok: true, stats: getBackofficeStats() });
  },
};
