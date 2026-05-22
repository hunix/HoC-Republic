/**
 * billing.ts — Stripe + Revenue Metering Infrastructure
 *
 * Shared billing module for all 7 revenue streams:
 *   - Stripe subscription management (Stream 1: intelligence subscriptions)
 *   - Per-call usage metering (Stream 2: AaaS API)
 *   - Sale recording from marketplace (Stream 3: content sales)
 *   - Gig payment tracking (Stream 4: freelance)
 *   - License checks (Stream 5: SaaS)
 *   - Simulation billing (Stream 6: research API)
 *   - Alpaca P&L tracking (Stream 7: forex bridge)
 *
 * Architecture: Stripe SDK is loaded lazily (only if STRIPE_SECRET_KEY is set).
 * Without Stripe the system still tracks all revenue internally in a JSON ledger
 * (republic-output/revenue-ledger.json) which can be reconciled later.
 *
 * All monetary values in USD cents (integer).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { createSubsystemLogger } from "../logging/subsystem.js";

const _require = createRequire(import.meta.url);

/** Lazily load Stripe — returns null if not installed */
function loadStripe(): unknown | null {
  try { return _require("stripe"); } catch { return null; }
}

const logger = createSubsystemLogger("republic:billing");

// ─── Revenue Ledger (file-persisted) ──────────────────────────────────────────

const LEDGER_PATH = path.join(process.cwd(), "republic-output", "revenue-ledger.json");

export interface LedgerEntry {
  id: string;
  stream: 1 | 2 | 3 | 4 | 5 | 6 | 7;       // which revenue stream
  streamName: string;
  amountCentsUsd: number;                     // in USD cents
  customerId?: string;                        // Stripe customer ID or email
  description: string;
  metadata: Record<string, string>;
  status: "pending" | "succeeded" | "failed" | "refunded";
  stripePaymentIntentId?: string;
  stripeSubscriptionId?: string;
  createdAt: string;                          // ISO timestamp
}

export interface RevenueLedger {
  totalCollectedCentsUsd: number;
  totalPendingCentsUsd: number;
  entries: LedgerEntry[];
  lastUpdated: string;
}

function loadLedger(): RevenueLedger {
  try {
    if (fs.existsSync(LEDGER_PATH)) {
      return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf-8")) as RevenueLedger;
    }
  } catch { /* ignore */ }
  return {
    totalCollectedCentsUsd: 0,
    totalPendingCentsUsd: 0,
    entries: [],
    lastUpdated: new Date().toISOString(),
  };
}

function saveLedger(ledger: RevenueLedger): void {
  try {
    fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2), "utf-8");
  } catch (err) {
    logger.warn(`Failed to save revenue ledger: ${String(err)}`);
  }
}

let _ledger: RevenueLedger | null = null;

function getLedger(): RevenueLedger {
  if (!_ledger) { _ledger = loadLedger(); }
  return _ledger;
}

function mutLedger(fn: (l: RevenueLedger) => void): void {
  const l = getLedger();
  fn(l);
  l.lastUpdated = new Date().toISOString();
  saveLedger(l);
}

// ─── Core Billing Functions ────────────────────────────────────────────────────

/**
 * Record a new revenue event. Returns the entry ID.
 * Status starts as "pending" until confirmed by Stripe webhook or external confirmation.
 */
export function recordRevenue(entry: Omit<LedgerEntry, "id" | "createdAt">): LedgerEntry {
  const full: LedgerEntry = {
    ...entry,
    id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };

  mutLedger((l) => {
    l.entries.push(full);
    if (full.status === "succeeded") {
      l.totalCollectedCentsUsd += full.amountCentsUsd;
    } else if (full.status === "pending") {
      l.totalPendingCentsUsd += full.amountCentsUsd;
    }
  });

  logger.info(`Revenue recorded: ${full.streamName} $${(full.amountCentsUsd / 100).toFixed(2)} [${full.status}]`, {
    id: full.id, stream: full.stream,
  });

  return full;
}

/** Mark a pending entry as succeeded (e.g., on Stripe webhook) */
export function confirmRevenue(entryId: string, stripePaymentIntentId?: string): boolean {
  let found = false;
  mutLedger((l) => {
    const entry = l.entries.find((e) => e.id === entryId);
    if (entry && entry.status === "pending") {
      entry.status = "succeeded";
      entry.stripePaymentIntentId = stripePaymentIntentId ?? entry.stripePaymentIntentId;
      l.totalPendingCentsUsd = Math.max(0, l.totalPendingCentsUsd - entry.amountCentsUsd);
      l.totalCollectedCentsUsd += entry.amountCentsUsd;
      found = true;
    }
  });
  return found;
}

/** Get current revenue summary */
export function getRevenueSummary(): {
  totalCollectedUsd: number;
  totalPendingUsd: number;
  byStream: Record<string, { collectedUsd: number; count: number }>;
  recentEntries: LedgerEntry[];
} {
  const l = getLedger();
  const byStream: Record<string, { collectedUsd: number; count: number }> = {};

  for (const e of l.entries) {
    if (!byStream[e.streamName]) {
      byStream[e.streamName] = { collectedUsd: 0, count: 0 };
    }
    if (e.status === "succeeded") {
      byStream[e.streamName]!.collectedUsd += e.amountCentsUsd / 100;
      byStream[e.streamName]!.count++;
    }
  }

  return {
    totalCollectedUsd: l.totalCollectedCentsUsd / 100,
    totalPendingUsd: l.totalPendingCentsUsd / 100,
    byStream,
    recentEntries: l.entries.slice(-20),
  };
}

// ─── API Key Management (shared by Stream 1 + 2) ──────────────────────────────

const KEYS_PATH = path.join(process.cwd(), "republic-output", "api-keys.json");

export interface ExternalApiKey {
  key: string;                          // hoc_live_xxxx or hoc_test_xxxx
  customerId: string;                   // email or Stripe customer ID
  plan: "free" | "starter" | "pro" | "enterprise";
  tier: 1 | 2 | 3;                      // 1=intel, 2=AaaS, 3=full
  callsThisMonth: number;
  callLimitPerMonth: number;
  revenueStreamFlags: number[];         // which streams this key grants access to
  stripeSubscriptionId?: string;
  createdAt: string;
  lastUsedAt?: string;
  active: boolean;
}

function loadKeys(): Map<string, ExternalApiKey> {
  try {
    if (fs.existsSync(KEYS_PATH)) {
      const arr = JSON.parse(fs.readFileSync(KEYS_PATH, "utf-8")) as ExternalApiKey[];
      return new Map(arr.map((k) => [k.key, k]));
    }
  } catch { /* ignore */ }
  return new Map();
}

function saveKeys(keys: Map<string, ExternalApiKey>): void {
  try {
    fs.mkdirSync(path.dirname(KEYS_PATH), { recursive: true });
    fs.writeFileSync(KEYS_PATH, JSON.stringify([...keys.values()], null, 2));
  } catch (err) {
    logger.warn(`Failed to save API keys: ${String(err)}`);
  }
}

let _keys: Map<string, ExternalApiKey> | null = null;

function getKeys(): Map<string, ExternalApiKey> {
  if (!_keys) { _keys = loadKeys(); }
  return _keys;
}

/** Generate a new external API key for a customer */
export function issueApiKey(opts: {
  customerId: string;
  plan: ExternalApiKey["plan"];
  tier: ExternalApiKey["tier"];
  streams: number[];
  stripeSubscriptionId?: string;
}): ExternalApiKey {
  const LIMITS = { free: 100, starter: 1000, pro: 10000, enterprise: 999999 };
  const raw = `hoc_live_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
  const newKey: ExternalApiKey = {
    key: raw,
    customerId: opts.customerId,
    plan: opts.plan,
    tier: opts.tier,
    callsThisMonth: 0,
    callLimitPerMonth: LIMITS[opts.plan],
    revenueStreamFlags: opts.streams,
    stripeSubscriptionId: opts.stripeSubscriptionId,
    createdAt: new Date().toISOString(),
    active: true,
  };
  const keys = getKeys();
  keys.set(raw, newKey);
  saveKeys(keys);
  logger.info(`API key issued: ${opts.plan} plan, tier=${opts.tier}, customer=${opts.customerId}`);
  return newKey;
}

/** Validate an incoming API key. Returns the key record or null if invalid/exceeded */
export function validateApiKey(key: string): ExternalApiKey | null {
  const keys = getKeys();
  const record = keys.get(key);
  if (!record || !record.active) { return null; }
  if (record.callsThisMonth >= record.callLimitPerMonth) { return null; }
  return record;
}

/** Increment call counter for a key and optionally record metered revenue */
export function meterApiCall(key: string, stream: 1 | 2 | 3 | 4 | 5 | 6 | 7, description: string): void {
  const keys = getKeys();
  const record = keys.get(key);
  if (!record) { return; }
  record.callsThisMonth++;
  record.lastUsedAt = new Date().toISOString();
  keys.set(key, record);
  saveKeys(keys);

  // Record per-call revenue based on plan
  const RATE_CENTS: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 5 };
  const cents = RATE_CENTS[record.plan] ?? 0;
  if (cents > 0) {
    recordRevenue({
      stream,
      streamName: `stream-${stream}-api-call`,
      amountCentsUsd: cents,
      customerId: record.customerId,
      description,
      metadata: { key: key.slice(0, 12) + "...", plan: record.plan },
      status: "succeeded",   // usage-based: collect on normal billing cycle
    });
  }
}

// ─── Stripe Integration (lazy — only when STRIPE_SECRET_KEY set) ──────────────

let _stripeConfigured = false;

export function isStripeConfigured(): boolean {
  return _stripeConfigured || !!process.env["STRIPE_SECRET_KEY"];
}

export async function createStripeCheckoutSession(opts: {
  priceId: string;
  customerId?: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}): Promise<{ url: string | null; sessionId: string } | { error: string }> {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) {
    return { error: "Stripe not configured. Set STRIPE_SECRET_KEY env var." };
  }

  try {
    const StripeModule = loadStripe();
    if (!StripeModule) {
      return { error: "stripe npm package not installed. Run: pnpm add stripe" };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Stripe = (StripeModule as any).default ?? StripeModule;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = new (Stripe as any)(key, { apiVersion: "2025-01-27.acacia" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = await (stripe as any).checkout.sessions.create({
      mode: "subscription",
      ...(opts.customerId ? { customer: opts.customerId } : {}),
      ...(opts.customerEmail && !opts.customerId ? { customer_email: opts.customerEmail } : {}),
      line_items: [{ price: opts.priceId, quantity: 1 }],
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      metadata: opts.metadata ?? {},
    });

    _stripeConfigured = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    return { url: (session as any).url as string | null, sessionId: (session as any).id as string };
  } catch (err) {
    return { error: String(err) };
  }
}

export async function createStripePaymentLink(opts: {
  amountCents: number;
  description: string;
  currency?: string;
  metadata?: Record<string, string>;
}): Promise<{ url: string } | { error: string }> {
  const key = process.env["STRIPE_SECRET_KEY"];
  if (!key) { return { error: "Stripe not configured" }; }

  try {
    const StripeModule = loadStripe();
    if (!StripeModule) { return { error: "stripe package not installed" }; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Stripe = (StripeModule as any).default ?? StripeModule;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = new (Stripe as any)(key, { apiVersion: "2025-01-27.acacia" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const product = await (stripe as any).products.create({ name: opts.description });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const price = await (stripe as any).prices.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      product: (product as any).id,
      unit_amount: opts.amountCents,
      currency: opts.currency ?? "usd",
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const link = await (stripe as any).paymentLinks.create({ line_items: [{ price: (price as any).id, quantity: 1 }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    return { url: (link as any).url as string };
  } catch (err) {
    return { error: String(err) };
  }
}
