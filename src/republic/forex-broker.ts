/**
 * Republic Platform — Forex Broker Connector (OANDA v20)
 *
 * Provides paper and live Forex order execution.
 *
 * Modes:
 *   paper — internal simulation with realistic fills, spread, and swap
 *   live  — OANDA REST API (requires OANDA_API_KEY env var)
 *
 * Safety: live mode requires explicit config opt-in AND env var.
 *         Paper mode is the default and always safe.
 */
// oxlint-disable eslint(curly)

import { createSubsystemLogger } from "../logging/subsystem.js";
import { getForexRate, pipSize, pipsToUSD } from "./forex-data.js";
import { getConfig } from "./republic-config.js";
import { randFloat } from "./utils.js";
import { uid, ts } from "./utils.js";

const logger = createSubsystemLogger("republic:forex-broker");

// ─── Types ──────────────────────────────────────────────────────

export type ForexOrderSide = "buy" | "sell";

export interface ForexOrder {
  id: string;
  pair: string;
  side: ForexOrderSide;
  units: number;          // Positive = buy, negative = sell (OANDA convention)
  requestedAt: string;
  filledAt: string | null;
  fillPrice: number | null;
  status: "pending" | "filled" | "rejected";
  stopLossPips?: number;
  takeProfitPips?: number;
  citizenId?: string;
}

export interface ForexPosition {
  id: string;
  pair: string;
  side: ForexOrderSide;
  units: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnLPips: number;
  unrealizedPnLUSD: number;
  openedAt: string;
  strategyId?: string;
  citizenId?: string;
  stopLoss?: number;
  takeProfit?: number;
}

export interface ForexTrade {
  id: string;
  pair: string;
  side: ForexOrderSide;
  units: number;
  entryPrice: number;
  exitPrice: number;
  pnlPips: number;
  pnlUSD: number;
  openedAt: string;
  closedAt: string;
  strategyId?: string;
  citizenId?: string;
  holdDurationMinutes: number;
}

export interface ForexBrokerStatus {
  mode: "paper" | "live";
  oandaConfigured: boolean;
  balance: number;        // USD equivalent
  equity: number;         // balance + unrealized PnL
  freeMargin: number;
  marginUsed: number;
  openPositions: number;
  totalTradesThisSession: number;
  unrealizedPnLUSD: number;
}

// ─── State ──────────────────────────────────────────────────────

const openPositions = new Map<string, ForexPosition>();
const closedTrades: ForexTrade[] = [];
const MAX_TRADE_HISTORY = 1000;

let paperBalance = 10_000;   // Paper account: start with $10k
let marginUsed = 0;
let sessionTradeCount = 0;

// ─── Mode Detection ─────────────────────────────────────────────

function getBrokerMode(): "paper" | "live" {
  const config = getConfig();
  const forexConfig = (config as Record<string, unknown>).forex as Record<string, unknown> | undefined;
  const isLive = forexConfig?.mode === "live" && process.env["OANDA_API_KEY"];
  return isLive ? "live" : "paper";
}

function isOandaConfigured(): boolean {
  return Boolean(process.env["OANDA_API_KEY"]);
}

// ─── OANDA Live Execution (stub for now — activates with API key) ─

async function oandaPlaceOrder(order: ForexOrder): Promise<ForexOrder> {
  const apiKey = process.env["OANDA_API_KEY"];
  const accountId = process.env["OANDA_ACCOUNT_ID"];
  if (!apiKey || !accountId) throw new Error("OANDA_API_KEY and OANDA_ACCOUNT_ID required for live trading");

  const baseUrl = process.env["OANDA_ENV"] === "production"
    ? "https://api-fxtrade.oanda.com"
    : "https://api-fxpractice.oanda.com";

  const units = order.side === "buy" ? order.units : -order.units;

  const body: Record<string, unknown> = {
    order: {
      type: "MARKET",
      instrument: order.pair.slice(0, 3) + "_" + order.pair.slice(3),
      units: String(units),
      timeInForce: "FOK",
      positionFill: "DEFAULT",
    },
  };

  const res = await fetch(`${baseUrl}/v3/accounts/${accountId}/orders`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OANDA order failed: ${res.status} ${text}`);
  }

  const data = await res.json() as Record<string, unknown>;
  const fill = data["orderFillTransaction"] as Record<string, unknown> | undefined;

  return {
    ...order,
    status: "filled",
    filledAt: ts(),
    fillPrice: fill ? parseFloat(String(fill["price"])) : null,
  };
}

// ─── Paper Execution ─────────────────────────────────────────────

function paperPlaceOrder(order: ForexOrder): ForexOrder {
  const rate = getForexRate(order.pair);
  if (!rate) throw new Error(`No rate data for ${order.pair}`);

  // Simulate slippage ±0.2 pips
  const slippage = pipSize(order.pair) * randFloat(-0.2, 0.2);
  const fillPrice = order.side === "buy"
    ? rate.ask + slippage
    : rate.bid - slippage;

  return {
    ...order,
    status: "filled",
    filledAt: ts(),
    fillPrice: parseFloat(fillPrice.toFixed(order.pair.includes("JPY") ? 3 : 5)),
  };
}

// ─── Public Order API ────────────────────────────────────────────

/**
 * Place a Forex order (paper or live).
 * units: number of units (1 standard lot = 100,000 units)
 */
export async function placeForexOrder(
  pair: string,
  side: ForexOrderSide,
  units: number,
  options: {
    stopLossPips?: number;
    takeProfitPips?: number;
    strategyId?: string;
    citizenId?: string;
  } = {},
): Promise<ForexOrder> {
  const order: ForexOrder = {
    id: uid(),
    pair: pair.toUpperCase(),
    side,
    units,
    requestedAt: ts(),
    filledAt: null,
    fillPrice: null,
    status: "pending",
    ...options,
  };

  try {
    const mode = getBrokerMode();
    const filled = mode === "live" ? await oandaPlaceOrder(order) : paperPlaceOrder(order);

    if (filled.status === "filled" && filled.fillPrice) {
      // Track position
      const pip = pipSize(pair);
      const marginReq = (units * (filled.fillPrice ?? 1)) / 50; // 50:1 leverage

      // Deduct margin in paper mode
      if (mode === "paper") {
        marginUsed += marginReq;
      }

      openPositions.set(filled.id, {
        id: filled.id,
        pair: pair.toUpperCase(),
        side,
        units,
        entryPrice: filled.fillPrice,
        currentPrice: filled.fillPrice,
        unrealizedPnLPips: 0,
        unrealizedPnLUSD: 0,
        openedAt: ts(),
        strategyId: options.strategyId,
        citizenId: options.citizenId,
        stopLoss: options.stopLossPips
          ? (side === "buy"
              ? filled.fillPrice - options.stopLossPips * pip
              : filled.fillPrice + options.stopLossPips * pip)
          : undefined,
        takeProfit: options.takeProfitPips
          ? (side === "buy"
              ? filled.fillPrice + options.takeProfitPips * pip
              : filled.fillPrice - options.takeProfitPips * pip)
          : undefined,
      });

      sessionTradeCount++;
      logger.info(`Forex order filled: ${side.toUpperCase()} ${units} ${pair} @ ${filled.fillPrice} (${mode})`);
    }

    return filled;
  } catch (err) {
    logger.warn(`Forex order failed: ${pair}`, { error: err instanceof Error ? err.message : String(err) });
    return { ...order, status: "rejected" };
  }
}

/**
 * Close a Forex position by its ID.
 */
export async function closeForexPosition(positionId: string): Promise<ForexTrade | null> {
  const position = openPositions.get(positionId);
  if (!position) return null;

  const rate = getForexRate(position.pair);
  if (!rate) return null;

  const exitPrice = position.side === "buy" ? rate.bid : rate.ask;
  const pip = pipSize(position.pair);
  const pnlPips = position.side === "buy"
    ? (exitPrice - position.entryPrice) / pip
    : (position.entryPrice - exitPrice) / pip;
  const pnlUSD = pipsToUSD(pnlPips, position.pair, position.units);

  const openMs = Date.now() - new Date(position.openedAt).getTime();

  const trade: ForexTrade = {
    id: uid(),
    pair: position.pair,
    side: position.side,
    units: position.units,
    entryPrice: position.entryPrice,
    exitPrice,
    pnlPips: parseFloat(pnlPips.toFixed(1)),
    pnlUSD: parseFloat(pnlUSD.toFixed(2)),
    openedAt: position.openedAt,
    closedAt: ts(),
    strategyId: position.strategyId,
    citizenId: position.citizenId,
    holdDurationMinutes: Math.round(openMs / 60000),
  };

  // Update paper balance
  if (getBrokerMode() === "paper") {
    paperBalance += pnlUSD;
    const marginReq = (position.units * position.entryPrice) / 50;
    marginUsed = Math.max(0, marginUsed - marginReq);
  }

  openPositions.delete(positionId);
  closedTrades.push(trade);
  if (closedTrades.length > MAX_TRADE_HISTORY) {
    closedTrades.splice(0, closedTrades.length - MAX_TRADE_HISTORY);
  }

  logger.info(`Forex position closed: ${position.pair} PnL: ${pnlPips.toFixed(1)} pips / $${pnlUSD.toFixed(2)}`);
  return trade;
}

// ─── Position Mark-to-Market ─────────────────────────────────────

/**
 * Update unrealized PnL for all open positions. Call every tick.
 */
export function markToMarket(): void {
  for (const [, pos] of openPositions) {
    const rate = getForexRate(pos.pair);
    if (!rate) continue;

    pos.currentPrice = pos.side === "buy" ? rate.bid : rate.ask;
    const pip = pipSize(pos.pair);
    pos.unrealizedPnLPips = pos.side === "buy"
      ? (pos.currentPrice - pos.entryPrice) / pip
      : (pos.entryPrice - pos.currentPrice) / pip;
    pos.unrealizedPnLUSD = parseFloat(pipsToUSD(pos.unrealizedPnLPips, pos.pair, pos.units).toFixed(2));

    // Auto-close on stop loss or take profit
    if (pos.stopLoss && pos.side === "buy" && pos.currentPrice <= pos.stopLoss) {
      closeForexPosition(pos.id).catch(() => null);
    } else if (pos.stopLoss && pos.side === "sell" && pos.currentPrice >= pos.stopLoss) {
      closeForexPosition(pos.id).catch(() => null);
    } else if (pos.takeProfit && pos.side === "buy" && pos.currentPrice >= pos.takeProfit) {
      closeForexPosition(pos.id).catch(() => null);
    } else if (pos.takeProfit && pos.side === "sell" && pos.currentPrice <= pos.takeProfit) {
      closeForexPosition(pos.id).catch(() => null);
    }
  }
}

// ─── Query Functions ─────────────────────────────────────────────

export function getForexPositions(): ForexPosition[] {
  return Array.from(openPositions.values());
}

export function getForexPositionsByCitizen(citizenId: string): ForexPosition[] {
  return Array.from(openPositions.values()).filter((p) => p.citizenId === citizenId);
}

export function getClosedTrades(limit = 100): ForexTrade[] {
  return closedTrades.slice(-limit);
}

export function getForexBrokerStatus(): ForexBrokerStatus {
  const unrealizedPnLUSD = Array.from(openPositions.values())
    .reduce((sum, p) => sum + p.unrealizedPnLUSD, 0);

  return {
    mode: getBrokerMode(),
    oandaConfigured: isOandaConfigured(),
    balance: parseFloat(paperBalance.toFixed(2)),
    equity: parseFloat((paperBalance + unrealizedPnLUSD).toFixed(2)),
    freeMargin: parseFloat((paperBalance - marginUsed + unrealizedPnLUSD).toFixed(2)),
    marginUsed: parseFloat(marginUsed.toFixed(2)),
    openPositions: openPositions.size,
    totalTradesThisSession: sessionTradeCount,
    unrealizedPnLUSD: parseFloat(unrealizedPnLUSD.toFixed(2)),
  };
}
