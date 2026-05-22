/**
 * Republic Platform — PayPal Connector
 *
 * PayPal REST API v2 integration for:
 *   - Creating and sending invoices
 *   - Checking payment status
 *   - Receiving webhook notifications
 *   - Recording revenue to treasury
 *
 * Supports both Sandbox and Live modes.
 * Credentials stored in secrets-vault or env vars.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { getSecret, hasSecret, storeSecret } from "./secrets-vault.js";
import { recordRevenue } from "./treasury-manager.js";
import type { RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";

const logger = createSubsystemLogger("republic:paypal");

// ─── Configuration ──────────────────────────────────────────────

const PAYPAL_SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
const PAYPAL_LIVE_BASE = "https://api-m.paypal.com";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry

// ─── Types ──────────────────────────────────────────────────────

export type PayPalMode = "sandbox" | "live";

export interface PayPalConfig {
  mode: PayPalMode;
  clientId: string | null;
  clientSecret: string | null;
  webhookId: string | null;
  configured: boolean;
}

export interface PayPalInvoice {
  id: string;
  paypalInvoiceId: string | null;
  status: "draft" | "sent" | "paid" | "cancelled" | "refunded" | "error";
  customerEmail: string;
  customerName: string;
  items: PayPalInvoiceItem[];
  totalAmount: number;
  currency: string;
  description: string;
  projectId?: string;
  citizenId?: string;
  createdAt: string;
  sentAt?: string;
  paidAt?: string;
  paypalLink?: string;
  error?: string;
}

export interface PayPalInvoiceItem {
  name: string;
  description: string;
  quantity: number;
  unitAmount: number;
}

export interface PayPalDiagnostics {
  mode: PayPalMode;
  configured: boolean;
  hasAccessToken: boolean;
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  totalRevenue: number;
}

// ─── State ──────────────────────────────────────────────────────

let currentMode: PayPalMode = "sandbox";
let accessToken: string | null = null;
let tokenExpiresAt = 0;

const invoices: PayPalInvoice[] = [];
const MAX_INVOICES = 500;
let totalRevenuePP = 0;

// ─── Credential Management ─────────────────────────────────────

/**
 * Configure PayPal credentials.
 */
export function configurePayPal(
  clientId: string,
  clientSecret: string,
  mode: PayPalMode = "sandbox",
): void {
  storeSecret("PAYPAL_CLIENT_ID", clientId, "payment", "PayPal REST API Client ID");
  storeSecret("PAYPAL_CLIENT_SECRET", clientSecret, "payment", "PayPal REST API Client Secret");
  currentMode = mode;

  logger.info(`PayPal configured in ${mode} mode`);
}

/**
 * Get current PayPal configuration status.
 */
export function getPayPalConfig(): PayPalConfig {
  return {
    mode: currentMode,
    clientId: hasSecret("PAYPAL_CLIENT_ID") ? "***configured***" : null,
    clientSecret: hasSecret("PAYPAL_CLIENT_SECRET") ? "***configured***" : null,
    webhookId: hasSecret("PAYPAL_WEBHOOK_ID")
      ? getSecret("PAYPAL_WEBHOOK_ID", "system")
      : null,
    configured: hasSecret("PAYPAL_CLIENT_ID") && hasSecret("PAYPAL_CLIENT_SECRET"),
  };
}

function getBaseUrl(): string {
  return currentMode === "live" ? PAYPAL_LIVE_BASE : PAYPAL_SANDBOX_BASE;
}

// ─── OAuth2 Token ───────────────────────────────────────────────

/**
 * Get a valid access token, refreshing if needed.
 */
async function getAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (accessToken && Date.now() < tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return accessToken;
  }

  const clientId = getSecret("PAYPAL_CLIENT_ID", "system");
  const clientSecret = getSecret("PAYPAL_CLIENT_SECRET", "system");

  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials not configured — call configurePayPal() first");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${getBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`PayPal OAuth2 failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;

  logger.info("PayPal access token refreshed", { expiresIn: data.expires_in });
  return accessToken;
}

// ─── API Request Helper ─────────────────────────────────────────

async function paypalRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  try {
    const token = await getAccessToken();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };

    const options: RequestInit = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${getBaseUrl()}${path}`, options);
    const responseData = response.ok ? ((await response.json()) as T) : null;

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      return {
        ok: false,
        status: response.status,
        data: null,
        error: `PayPal API error (${response.status}): ${errBody}`,
      };
    }

    return { ok: true, status: response.status, data: responseData };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Invoice Operations ─────────────────────────────────────────

/**
 * Create a PayPal invoice.
 */
export async function createInvoice(
  customerEmail: string,
  customerName: string,
  items: PayPalInvoiceItem[],
  currency = "USD",
  description = "",
  projectId?: string,
  citizenId?: string,
): Promise<PayPalInvoice> {
  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitAmount, 0);

  const invoice: PayPalInvoice = {
    id: uid(),
    paypalInvoiceId: null,
    status: "draft",
    customerEmail,
    customerName,
    items,
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    currency,
    description,
    projectId,
    citizenId,
    createdAt: ts(),
  };

  // Build PayPal invoice payload
  const payload = {
    detail: {
      currency_code: currency,
      note: description,
      payment_term: { term_type: "NET_30" },
    },
    invoicer: {
      name: { given_name: "Republic", surname: "Platform" },
    },
    primary_recipients: [
      {
        billing_info: {
          name: { given_name: customerName.split(" ")[0], surname: customerName.split(" ").slice(1).join(" ") || customerName },
          email_address: customerEmail,
        },
      },
    ],
    items: items.map((item) => ({
      name: item.name,
      description: item.description,
      quantity: String(item.quantity),
      unit_amount: { currency_code: currency, value: String(item.unitAmount.toFixed(2)) },
    })),
  };

  const result = await paypalRequest<{ id: string; status: string; detail: { metadata: { recipient_view_url: string } } }>(
    "POST",
    "/v2/invoicing/invoices",
    payload,
  );

  if (result.ok && result.data) {
    invoice.paypalInvoiceId = result.data.id;
    invoice.paypalLink = result.data.detail?.metadata?.recipient_view_url;
    logger.info(`Invoice created: ${invoice.paypalInvoiceId} — $${totalAmount.toFixed(2)}`);
  } else {
    invoice.status = "error";
    invoice.error = result.error;
    logger.error(`Invoice creation failed: ${result.error}`);
  }

  invoices.push(invoice);
  if (invoices.length > MAX_INVOICES) {
    invoices.splice(0, invoices.length - MAX_INVOICES);
  }

  return invoice;
}

/**
 * Send a draft invoice to the customer.
 */
export async function sendInvoice(invoiceLocalId: string): Promise<boolean> {
  const invoice = invoices.find((i) => i.id === invoiceLocalId);
  if (!invoice || !invoice.paypalInvoiceId) {return false;}

  const result = await paypalRequest<void>(
    "POST",
    `/v2/invoicing/invoices/${invoice.paypalInvoiceId}/send`,
    { send_to_invoicer: true },
  );

  if (result.ok) {
    invoice.status = "sent";
    invoice.sentAt = ts();
    logger.info(`Invoice sent: ${invoice.paypalInvoiceId}`);
    return true;
  }

  invoice.error = result.error;
  logger.error(`Invoice send failed: ${result.error}`);
  return false;
}

/**
 * Check payment status of an invoice.
 */
export async function checkInvoiceStatus(
  invoiceLocalId: string,
  s?: RepublicState,
): Promise<string> {
  const invoice = invoices.find((i) => i.id === invoiceLocalId);
  if (!invoice || !invoice.paypalInvoiceId) {return "not_found";}

  const result = await paypalRequest<{ status: string }>(
    "GET",
    `/v2/invoicing/invoices/${invoice.paypalInvoiceId}`,
  );

  if (result.ok && result.data) {
    const ppStatus = result.data.status.toLowerCase();

    if (ppStatus === "paid" && invoice.status !== "paid") {
      invoice.status = "paid";
      invoice.paidAt = ts();
      totalRevenuePP += invoice.totalAmount;

      // Record in treasury
      recordRevenue(
        invoice.totalAmount,
        invoice.currency,
        "paypal",
        `PayPal Invoice: ${invoice.description || invoice.items.map((i) => i.name).join(", ")}`,
        s,
        invoice.citizenId,
        invoice.projectId,
      );

      logger.info(`Invoice PAID: ${invoice.paypalInvoiceId} — $${invoice.totalAmount.toFixed(2)}`);
    } else if (ppStatus === "cancelled") {
      invoice.status = "cancelled";
    } else if (ppStatus === "refunded") {
      invoice.status = "refunded";
    }

    return ppStatus;
  }

  return invoice.status;
}

// ─── Batch Operations ───────────────────────────────────────────

/**
 * Check all outstanding invoices for payment updates.
 */
export async function checkAllPendingInvoices(s?: RepublicState): Promise<number> {
  const pending = invoices.filter((i) => i.status === "sent");
  let paidCount = 0;

  for (const invoice of pending) {
    const status = await checkInvoiceStatus(invoice.id, s);
    if (status === "paid") {paidCount++;}

    // Rate limit: don't hit PayPal too fast
    await new Promise((r) => setTimeout(r, 500));
  }

  if (paidCount > 0) {
    logger.info(`Payment check: ${paidCount} invoices paid out of ${pending.length} pending`);
  }

  return paidCount;
}

// ─── Query Functions ────────────────────────────────────────────

export function getInvoices(status?: PayPalInvoice["status"]): PayPalInvoice[] {
  if (status) {return invoices.filter((i) => i.status === status);}
  return [...invoices];
}

export function getInvoice(id: string): PayPalInvoice | undefined {
  return invoices.find((i) => i.id === id);
}

export function getTotalPayPalRevenue(): number {
  return parseFloat(totalRevenuePP.toFixed(2));
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getPayPalDiagnostics(): PayPalDiagnostics {
  return {
    mode: currentMode,
    configured: hasSecret("PAYPAL_CLIENT_ID") && hasSecret("PAYPAL_CLIENT_SECRET"),
    hasAccessToken: accessToken !== null && Date.now() < tokenExpiresAt,
    totalInvoices: invoices.length,
    paidInvoices: invoices.filter((i) => i.status === "paid").length,
    pendingInvoices: invoices.filter((i) => i.status === "sent").length,
    totalRevenue: parseFloat(totalRevenuePP.toFixed(2)),
  };
}
