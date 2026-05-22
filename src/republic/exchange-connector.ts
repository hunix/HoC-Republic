/**
 * Republic Platform — Exchange Connector
 *
 * Unified exchange API for placing orders. Supports Binance REST API
 * and a paper-trading mode for risk-free testing against real prices.
 *
 * All trades go through the risk manager before execution.
 * Reads API keys from republic-config.ts.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { getPrice } from "./market-data.js";
import { getConfig } from "./republic-config.js";
import { ts, uid } from "./utils.js";

const logger = createSubsystemLogger("republic:exchange");

// ─── Types ──────────────────────────────────────────────────────

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus = "pending" | "filled" | "partially_filled" | "cancelled" | "rejected";

export interface ExchangeOrder {
  id: string;
  exchange: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price: number;
  filledQuantity: number;
  filledPrice: number;
  status: OrderStatus;
  fee: number;
  createdAt: string;
  filledAt?: string;
  error?: string;
}

export interface ExchangeBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  valueUSD: number;
}

export interface ExchangeDiagnostics {
  mode: "paper" | "live";
  exchange: string;
  totalOrders: number;
  filledOrders: number;
  cancelledOrders: number;
  totalVolumeUSD: number;
  paperBalances: Record<string, number>;
  isConfigured: boolean;
}

// ─── State ──────────────────────────────────────────────────────

const orderHistory: ExchangeOrder[] = [];
const MAX_ORDER_HISTORY = 500;

// Paper trading balances
const paperBalances: Record<string, number> = {
  USD: 100_000, // Start with $100K paper money
  BTC: 0,
  ETH: 0,
  SOL: 0,
  BNB: 0,
  XRP: 0,
  ADA: 0,
  DOGE: 0,
  DOT: 0,
  AVAX: 0,
  MATIC: 0,
  LINK: 0,
  UNI: 0,
  ATOM: 0,
  LTC: 0,
};

// ─── Binance API Helpers ────────────────────────────────────────

const BINANCE_BASE = "https://api.binance.com";

function createBinanceSignature(queryString: string, secret: string): string {
  // Uses Web Crypto for HMAC-SHA256
  // For Node.js, we use the crypto module
  const crypto = globalThis.crypto;
  if (!crypto?.subtle) {
    // Fallback: we'll use node's crypto
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodeCrypto = require("node:crypto");
      return nodeCrypto.createHmac("sha256", secret).update(queryString).digest("hex");
    } catch {
      throw new Error("No crypto module available for Binance signing");
    }
  }
  // Web Crypto path would be async, but for simplicity we use Node path
  throw new Error("Web Crypto not supported synchronously — use Node.js");
}

async function binanceRequest<T>(
  endpoint: string,
  params: Record<string, string> = {},
  method: "GET" | "POST" | "DELETE" = "GET",
  signed = false,
): Promise<T> {
  const config = getConfig();
  const apiKey = config.trading?.binanceApiKey;
  const secret = config.trading?.binanceSecret;

  if (!apiKey || !secret) {
    throw new Error("Binance API key/secret not configured");
  }

  const searchParams = new URLSearchParams(params);

  if (signed) {
    searchParams.set("timestamp", Date.now().toString());
    searchParams.set("recvWindow", "5000");
    const queryString = searchParams.toString();
    const signature = createBinanceSignature(queryString, secret);
    searchParams.set("signature", signature);
  }

  const url =
    method === "GET"
      ? `${BINANCE_BASE}${endpoint}?${searchParams.toString()}`
      : `${BINANCE_BASE}${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      "X-MBX-APIKEY": apiKey,
      ...(method !== "GET" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(method !== "GET" ? { body: searchParams.toString() } : {}),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Binance API error ${response.status}: ${error}`);
  }

  return (await response.json()) as T;
}

// ─── Core Operations ────────────────────────────────────────────

/**
 * Place an order on an exchange.
 * In paper mode, simulates the trade against real market prices.
 * In live mode, executes via Binance API.
 */
export async function placeOrder(
  exchange: string,
  symbol: string,
  side: OrderSide,
  quantity: number,
  type: OrderType = "market",
  limitPrice?: number,
): Promise<ExchangeOrder> {
  const config = getConfig();
  const mode = config.trading?.mode ?? "paper";

  const order: ExchangeOrder = {
    id: uid(),
    exchange,
    symbol: symbol.toUpperCase(),
    side,
    type,
    quantity,
    price: limitPrice ?? 0,
    filledQuantity: 0,
    filledPrice: 0,
    status: "pending",
    fee: 0,
    createdAt: ts(),
  };

  try {
    if (mode === "paper") {
      await executePaperTrade(order);
    } else if (exchange === "binance") {
      await executeBinanceTrade(order);
    } else {
      order.status = "rejected";
      order.error = `Unsupported exchange: ${exchange}`;
    }
  } catch (err) {
    order.status = "rejected";
    order.error = err instanceof Error ? err.message : String(err);
    logger.warn(`Order rejected: ${order.error}`, { orderId: order.id });
  }

  // Store in history
  orderHistory.push(order);
  if (orderHistory.length > MAX_ORDER_HISTORY) {
    orderHistory.splice(0, orderHistory.length - MAX_ORDER_HISTORY);
  }

  logger.info(
    `Order ${order.status}: ${order.side} ${order.quantity} ${order.symbol} @ $${order.filledPrice.toFixed(2)}`,
    { orderId: order.id, mode },
  );

  return order;
}

/**
 * Get current portfolio balances.
 */
export async function getBalances(exchange?: string): Promise<ExchangeBalance[]> {
  const config = getConfig();
  const mode = config.trading?.mode ?? "paper";

  if (mode === "paper") {
    return Object.entries(paperBalances)
      .filter(([, amount]) => amount > 0)
      .map(([asset, amount]) => {
        const price = asset === "USD" ? 1 : (getPrice(asset)?.priceUSD ?? 0);
        return {
          asset,
          free: amount,
          locked: 0,
          total: amount,
          valueUSD: amount * price,
        };
      });
  }

  // Live Binance balances
  if (!exchange || exchange === "binance") {
    const data = await binanceRequest<{
      balances: Array<{ asset: string; free: string; locked: string }>;
    }>("/api/v3/account", {}, "GET", true);

    return data.balances
      .filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map((b) => {
        const free = parseFloat(b.free);
        const locked = parseFloat(b.locked);
        const total = free + locked;
        const price = b.asset === "USDT" || b.asset === "USD" ? 1 : (getPrice(b.asset)?.priceUSD ?? 0);
        return {
          asset: b.asset,
          free,
          locked,
          total,
          valueUSD: total * price,
        };
      });
  }

  return [];
}

/**
 * Get open orders.
 */
export async function getOpenOrders(exchange?: string): Promise<ExchangeOrder[]> {
  const config = getConfig();
  const mode = config.trading?.mode ?? "paper";

  if (mode === "paper") {
    return orderHistory.filter((o) => o.status === "pending" || o.status === "partially_filled");
  }

  if (!exchange || exchange === "binance") {
    const data = await binanceRequest<
      Array<{
        orderId: number;
        symbol: string;
        side: string;
        type: string;
        origQty: string;
        executedQty: string;
        price: string;
        status: string;
        time: number;
      }>
    >("/api/v3/openOrders", {}, "GET", true);

    return data.map((o) => ({
      id: String(o.orderId),
      exchange: "binance",
      symbol: o.symbol,
      side: o.side.toLowerCase() as OrderSide,
      type: o.type.toLowerCase() as OrderType,
      quantity: parseFloat(o.origQty),
      price: parseFloat(o.price),
      filledQuantity: parseFloat(o.executedQty),
      filledPrice: parseFloat(o.price),
      status: mapBinanceStatus(o.status),
      fee: 0,
      createdAt: new Date(o.time).toISOString(),
    }));
  }

  return [];
}

/**
 * Cancel an order.
 */
export async function cancelOrder(
  exchange: string,
  orderId: string,
  symbol?: string,
): Promise<boolean> {
  const config = getConfig();
  const mode = config.trading?.mode ?? "paper";

  if (mode === "paper") {
    const order = orderHistory.find((o) => o.id === orderId);
    if (order && (order.status === "pending" || order.status === "partially_filled")) {
      order.status = "cancelled";
      return true;
    }
    return false;
  }

  if (exchange === "binance" && symbol) {
    try {
      await binanceRequest(
        "/api/v3/order",
        { symbol, orderId },
        "DELETE",
        true,
      );
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Get order history.
 */
export function getOrderHistory(limit = 50): ExchangeOrder[] {
  return orderHistory.slice(-limit);
}

/**
 * Get total portfolio value in USD.
 */
export async function getPortfolioValue(): Promise<number> {
  const balances = await getBalances();
  return balances.reduce((sum, b) => sum + b.valueUSD, 0);
}

// ─── Paper Trading Execution ────────────────────────────────────

async function executePaperTrade(order: ExchangeOrder): Promise<void> {
  const priceData = getPrice(order.symbol);
  if (!priceData) {
    throw new Error(`No price data for ${order.symbol}`);
  }

  const currentPrice = priceData.priceUSD;
  const FEE_RATE = 0.001; // 0.1% fee (simulates exchange fees)

  if (order.side === "buy") {
    const cost = order.quantity * currentPrice;
    const fee = cost * FEE_RATE;
    const totalCost = cost + fee;

    if ((paperBalances.USD ?? 0) < totalCost) {
      throw new Error(`Insufficient USD balance: have $${(paperBalances.USD ?? 0).toFixed(2)}, need $${totalCost.toFixed(2)}`);
    }

    paperBalances.USD = (paperBalances.USD ?? 0) - totalCost;
    paperBalances[order.symbol] = (paperBalances[order.symbol] ?? 0) + order.quantity;

    order.filledQuantity = order.quantity;
    order.filledPrice = currentPrice;
    order.fee = fee;
    order.status = "filled";
    order.filledAt = ts();
  } else {
    // sell
    if ((paperBalances[order.symbol] ?? 0) < order.quantity) {
      throw new Error(
        `Insufficient ${order.symbol} balance: have ${(paperBalances[order.symbol] ?? 0).toFixed(6)}, need ${order.quantity}`,
      );
    }

    const proceeds = order.quantity * currentPrice;
    const fee = proceeds * FEE_RATE;

    paperBalances[order.symbol] = (paperBalances[order.symbol] ?? 0) - order.quantity;
    paperBalances.USD = (paperBalances.USD ?? 0) + proceeds - fee;

    order.filledQuantity = order.quantity;
    order.filledPrice = currentPrice;
    order.fee = fee;
    order.status = "filled";
    order.filledAt = ts();
  }
}

// ─── Binance Live Execution ─────────────────────────────────────

async function executeBinanceTrade(order: ExchangeOrder): Promise<void> {
  // Map symbol to Binance pair format (e.g., BTC → BTCUSDT)
  const pair = `${order.symbol}USDT`;

  const params: Record<string, string> = {
    symbol: pair,
    side: order.side.toUpperCase(),
    type: order.type.toUpperCase(),
    quantity: order.quantity.toString(),
  };

  if (order.type === "limit" && order.price > 0) {
    params.price = order.price.toString();
    params.timeInForce = "GTC";
  }

  if (order.type === "market") {
    // Binance market orders use MARKET type
    params.type = "MARKET";
  }

  const result = await binanceRequest<{
    orderId: number;
    executedQty: string;
    cummulativeQuoteQty: string;
    status: string;
    fills: Array<{ price: string; qty: string; commission: string }>;
  }>("/api/v3/order", params, "POST", true);

  order.id = String(result.orderId);
  order.filledQuantity = parseFloat(result.executedQty);
  order.status = mapBinanceStatus(result.status);

  // Calculate average fill price and total fees
  if (result.fills && result.fills.length > 0) {
    const totalQty = result.fills.reduce((s, f) => s + parseFloat(f.qty), 0);
    const weightedPrice = result.fills.reduce(
      (s, f) => s + parseFloat(f.price) * parseFloat(f.qty),
      0,
    );
    order.filledPrice = totalQty > 0 ? weightedPrice / totalQty : 0;
    order.fee = result.fills.reduce((s, f) => s + parseFloat(f.commission), 0);
  }

  if (order.status === "filled") {
    order.filledAt = ts();
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function mapBinanceStatus(status: string): OrderStatus {
  switch (status) {
    case "NEW":
      return "pending";
    case "PARTIALLY_FILLED":
      return "partially_filled";
    case "FILLED":
      return "filled";
    case "CANCELED":
    case "EXPIRED":
      return "cancelled";
    case "REJECTED":
      return "rejected";
    default:
      return "pending";
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getExchangeDiagnostics(): ExchangeDiagnostics {
  const config = getConfig();
  const mode = config.trading?.mode ?? "paper";

  return {
    mode,
    exchange: "binance",
    totalOrders: orderHistory.length,
    filledOrders: orderHistory.filter((o) => o.status === "filled").length,
    cancelledOrders: orderHistory.filter((o) => o.status === "cancelled").length,
    totalVolumeUSD: orderHistory
      .filter((o) => o.status === "filled")
      .reduce((sum, o) => sum + o.filledQuantity * o.filledPrice, 0),
    paperBalances: { ...paperBalances },
    isConfigured: !!(config.trading?.binanceApiKey && config.trading?.binanceSecret),
  };
}
