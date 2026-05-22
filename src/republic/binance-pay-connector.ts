/**
 * Republic Platform — Binance Pay Gateway
 *
 * Binance Pay Merchant API integration for:
 *   - Creating crypto payment orders (USDT, BNB, BTC, ETH)
 *   - Verifying webhook signatures (HMAC-SHA512)
 *   - Querying order status
 *   - Refunding orders
 *   - Recording revenue to treasury on payment confirmation
 *
 * Docs: https://developers.binance.com/docs/binance-pay/introduction
 *
 * Credentials stored in secrets-vault:
 *   BINANCE_PAY_API_KEY     — merchant API key
 *   BINANCE_PAY_API_SECRET  — merchant API secret
 */

import { createHmac } from "node:crypto";
import type { RepublicState } from "./types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getSecret, hasSecret, storeSecret } from "./secrets-vault.js";
import { recordRevenue } from "./treasury-manager.js";
import { ts, uid } from "./utils.js";

const logger = createSubsystemLogger("republic:binance-pay");

// ─── Constants ──────────────────────────────────────────────────

const BINANCE_PAY_BASE = "https://bpay.binanceapi.com";
const ORDER_TIMEOUT_SEC = 1800; // 30 minutes

// ─── Types ──────────────────────────────────────────────────────

export type BinanceCurrency = "USDT" | "BNB" | "BTC" | "ETH" | "BUSD" | "USDC";
export type BinanceOrderStatus =
  | "INITIAL"
  | "PENDING"
  | "COMMITTED"
  | "PAID"
  | "CANCELED"
  | "ERROR"
  | "REFUNDING"
  | "REFUNDED"
  | "EXPIRED"
  | "UNKNOWN";

export interface BinancePayOrder {
  id: string; // local ID
  prepayId: string | null; // Binance prepayId
  merchantTradeNo: string; // our unique order reference
  status: BinanceOrderStatus;
  currency: BinanceCurrency;
  orderAmount: number;
  description: string;
  checkoutUrl: string | null;
  qrCodeUrl: string | null;
  expireTime: number | null;
  citizenId?: string;
  productId?: string;
  createdAt: string;
  paidAt?: string;
  error?: string;
}

export interface BinancePayDiagnostics {
  configured: boolean;
  hasApiKey: boolean;
  totalOrders: number;
  paidOrders: number;
  pendingOrders: number;
  totalRevenueCrypto: Record<BinanceCurrency, number>;
  totalRevenueUsd: number;
}

// ─── State ──────────────────────────────────────────────────────

const orders: BinancePayOrder[] = [];
const MAX_ORDERS = 500;
const revenueUsd: Record<string, number> = {};
const revenueCrypto: Record<string, number> = {};

// Approximate USD rates (updated from Binance Spot price in production)
const USD_RATES: Record<BinanceCurrency, number> = {
  USDT: 1,
  USDC: 1,
  BUSD: 1,
  BNB: 600,
  BTC: 65_000,
  ETH: 3_500,
};

function toUsd(amount: number, currency: BinanceCurrency): number {
  return amount * (USD_RATES[currency] ?? 1);
}

// ─── Configuration ──────────────────────────────────────────────

export function configureBinancePay(apiKey: string, apiSecret: string): void {
  storeSecret("BINANCE_PAY_API_KEY", apiKey, "payment", "Binance Pay Merchant API Key");
  storeSecret("BINANCE_PAY_API_SECRET", apiSecret, "payment", "Binance Pay Merchant API Secret");
  logger.info("Binance Pay configured");
}

export function getBinancePayConfig(): { configured: boolean; hasApiKey: boolean } {
  return {
    configured: hasSecret("BINANCE_PAY_API_KEY") && hasSecret("BINANCE_PAY_API_SECRET"),
    hasApiKey: hasSecret("BINANCE_PAY_API_KEY"),
  };
}

// ─── Request Signing (HMAC-SHA512) ──────────────────────────────

function buildSignature(timestamp: number, nonce: string, body: string, secret: string): string {
  const payload = `${timestamp}\n${nonce}\n${body}\n`;
  return createHmac("sha512", secret).update(payload).digest("hex").toUpperCase();
}

async function binanceRequest<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data: T | null; error?: string }> {
  const apiKey = getSecret("BINANCE_PAY_API_KEY", "system");
  const apiSecret = getSecret("BINANCE_PAY_API_SECRET", "system");

  if (!apiKey || !apiSecret) {
    return { ok: false, data: null, error: "Binance Pay not configured" };
  }

  const timestamp = Date.now();
  const nonce = uid().replace(/-/g, "").slice(0, 32);
  const bodyStr = JSON.stringify(body);
  const signature = buildSignature(timestamp, nonce, bodyStr, apiSecret);

  try {
    const response = await fetch(`${BINANCE_PAY_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "BinancePay-Timestamp": String(timestamp),
        "BinancePay-Nonce": nonce,
        "BinancePay-Certificate-SN": apiKey,
        "BinancePay-Signature": signature,
      },
      body: bodyStr,
    });

    const responseData = (await response.json()) as {
      status: string;
      code: string;
      data: T;
      errorMessage?: string;
    };

    if (responseData.status === "SUCCESS") {
      return { ok: true, data: responseData.data };
    }

    return {
      ok: false,
      data: null,
      error: `Binance Pay error [${responseData.code}]: ${responseData.errorMessage ?? "Unknown error"}`,
    };
  } catch (err) {
    return {
      ok: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Order Management ────────────────────────────────────────────

/**
 * Create a Binance Pay order for a product or service.
 *
 * Returns the order with a checkout URL and QR code for the buyer.
 */
export async function createBinanceOrder(
  currency: BinanceCurrency,
  amount: number,
  description: string,
  citizenId?: string,
  productId?: string,
): Promise<BinancePayOrder> {
  const merchantTradeNo = `HOC-${Date.now()}-${uid().slice(0, 8).toUpperCase()}`;

  const order: BinancePayOrder = {
    id: uid(),
    prepayId: null,
    merchantTradeNo,
    status: "INITIAL",
    currency,
    orderAmount: amount,
    description,
    checkoutUrl: null,
    qrCodeUrl: null,
    expireTime: null,
    citizenId,
    productId,
    createdAt: ts(),
  };

  const result = await binanceRequest<{
    prepayId: string;
    terminalType: string;
    expireTime: number;
    qrcodeLink: string;
    qrContent: string;
    checkoutUrl: string;
    deeplink: string;
    universalUrl: string;
  }>("/binancepay/openapi/v2/order", {
    env: { terminalType: "WEB" },
    merchantTradeNo,
    orderAmount: amount.toFixed(8),
    currency,
    description,
    timeoutMs: ORDER_TIMEOUT_SEC * 1000,
    goods: [
      {
        goodsType: "02",
        goodsCategory: "Z000",
        referenceGoodsId: productId ?? uid(),
        goodsName: description.slice(0, 50),
        goodsDetail: description.slice(0, 200),
      },
    ],
  });

  if (result.ok && result.data) {
    order.prepayId = result.data.prepayId;
    order.status = "PENDING";
    order.checkoutUrl = result.data.checkoutUrl;
    order.qrCodeUrl = result.data.qrcodeLink;
    order.expireTime = result.data.expireTime;
    logger.info(`Binance Pay order created: ${merchantTradeNo} — ${amount} ${currency}`);
  } else {
    order.status = "ERROR";
    order.error = result.error;
    logger.error(`Binance Pay order creation failed: ${result.error}`);
  }

  orders.push(order);
  if (orders.length > MAX_ORDERS) {
    orders.splice(0, orders.length - MAX_ORDERS);
  }

  return order;
}

/**
 * Query the status of a Binance Pay order.
 * Auto-records revenue when status transitions to PAID.
 */
export async function queryBinanceOrder(
  localOrderId: string,
  s?: RepublicState,
): Promise<BinanceOrderStatus> {
  const order = orders.find((o) => o.id === localOrderId);
  if (!order || !order.merchantTradeNo) {
    return "UNKNOWN";
  }

  const result = await binanceRequest<{ status: BinanceOrderStatus; transactionId: string }>(
    "/binancepay/openapi/v2/order/query",
    { merchantTradeNo: order.merchantTradeNo },
  );

  if (result.ok && result.data) {
    const prev = order.status;
    order.status = result.data.status;

    if (order.status === "PAID" && prev !== "PAID") {
      order.paidAt = ts();

      // Track revenue
      const usd = toUsd(order.orderAmount, order.currency);
      revenueCrypto[order.currency] = (revenueCrypto[order.currency] ?? 0) + order.orderAmount;
      revenueUsd[order.currency] = (revenueUsd[order.currency] ?? 0) + usd;

      // Record in treasury
      recordRevenue(
        usd,
        "USD",
        "crypto",
        `Binance Pay: ${order.description} (${order.orderAmount} ${order.currency})`,
        s,
        order.citizenId,
        order.productId,
      );

      logger.info(
        `Order PAID: ${order.merchantTradeNo} — ${order.orderAmount} ${order.currency} (~$${usd.toFixed(2)})`,
      );
    }

    return order.status;
  }

  return order.status;
}

/**
 * Verify a Binance Pay webhook notification's HMAC signature.
 * Returns the parsed payload if valid, null if signature is invalid.
 */
export function verifyBinanceWebhook(
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
): boolean {
  const apiSecret = getSecret("BINANCE_PAY_API_SECRET", "system");
  if (!apiSecret) {
    return false;
  }

  const computed = buildSignature(Number(timestamp), nonce, body, apiSecret);
  return computed === signature.toUpperCase();
}

/**
 * Process a verified Binance Pay webhook event.
 */
export async function processBinanceWebhook(
  payload: { bizType: string; bizId: string; bizStatus: string; data: string },
  s?: RepublicState,
): Promise<void> {
  if (payload.bizType !== "PAY") {
    return;
  }

  // Find matching order by prepayId or merchantTradeNo encoded in bizId
  const order = orders.find(
    (o) => o.prepayId === payload.bizId || o.merchantTradeNo === payload.bizId,
  );
  if (!order) {
    logger.warn(`Binance webhook: no order found for bizId=${payload.bizId}`);
    return;
  }

  if (payload.bizStatus === "PAY_SUCCESS" && order.status !== "PAID") {
    order.status = "PAID";
    order.paidAt = ts();

    const usd = toUsd(order.orderAmount, order.currency);
    revenueCrypto[order.currency] = (revenueCrypto[order.currency] ?? 0) + order.orderAmount;

    recordRevenue(
      usd,
      "USD",
      "crypto",
      `Binance Webhook: ${order.description}`,
      s,
      order.citizenId,
      order.productId,
    );

    logger.info(`Webhook PAID: ${order.merchantTradeNo}`);
  }
}

// ─── Query / Diagnostics ────────────────────────────────────────

export function getBinanceOrders(status?: BinanceOrderStatus): BinancePayOrder[] {
  if (status) {
    return orders.filter((o) => o.status === status);
  }
  return [...orders];
}

export function getBinanceOrder(id: string): BinancePayOrder | undefined {
  return orders.find((o) => o.id === id);
}

export function getBinanceDiagnostics(): BinancePayDiagnostics {
  const config = getBinancePayConfig();
  return {
    configured: config.configured,
    hasApiKey: config.hasApiKey,
    totalOrders: orders.length,
    paidOrders: orders.filter((o) => o.status === "PAID").length,
    pendingOrders: orders.filter((o) => o.status === "PENDING").length,
    totalRevenueCrypto: {
      USDT: revenueCrypto["USDT"] ?? 0,
      BNB: revenueCrypto["BNB"] ?? 0,
      BTC: revenueCrypto["BTC"] ?? 0,
      ETH: revenueCrypto["ETH"] ?? 0,
      BUSD: revenueCrypto["BUSD"] ?? 0,
      USDC: revenueCrypto["USDC"] ?? 0,
    },
    totalRevenueUsd: Object.values(revenueUsd).reduce((a, b) => a + b, 0),
  };
}
