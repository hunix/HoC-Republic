/**
 * Republic Platform — Autonomous Trading Engine
 *
 * The main trading loop that ties together market data, strategies,
 * risk management, and exchange execution. Runs on the simulation tick.
 *
 * Flow per tick:
 *   1. Refresh market data (via market-data.ts)
 *   2. Run active strategies → generate signals
 *   3. Check signals against risk manager
 *   4. Execute approved trades via exchange connector
 *   5. Track positions, P&L, and trade history
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import {
    getBalances, getPortfolioValue, placeOrder
} from "./exchange-connector.js";
import { fetchOHLC, getClosePrices, getPrice, marketDataTick } from "./market-data.js";
import { getConfig } from "./republic-config.js";
import {
    checkRisk, isCircuitBroken, recordTrade,
    updatePortfolioValue
} from "./risk-manager.js";
import {
    createStrategy,
    evaluateStrategy,
    getActiveStrategies,
    getAllStrategies
} from "./trading-strategy.js";
import { recordRevenue } from "./treasury-manager.js";
import type { RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";

const logger = createSubsystemLogger("republic:trading-engine");

// ─── Types ──────────────────────────────────────────────────────

export interface Position {
  id: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  quantity: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  openedAt: string;
  strategyId: string;
}

export interface TradeRecord {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnlUSD: number;
  pnlPct: number;
  strategyId: string;
  strategyName: string;
  riskScore: number;
  timestamp: string;
}

export interface TradingStatus {
  enabled: boolean;
  mode: "paper" | "live";
  portfolioValueUSD: number;
  positions: Position[];
  dailyPnL: number;
  totalPnL: number;
  winRate: number;
  totalTrades: number;
  activeStrategies: number;
  circuitBroken: boolean;
  lastTradeAt: string | null;
}

export interface TradingDiagnostics {
  enabled: boolean;
  mode: string;
  totalTicks: number;
  totalSignals: number;
  tradesExecuted: number;
  tradesBlocked: number;
  portfolioValueUSD: number;
  openPositions: number;
  dailyPnL: number;
  totalPnL: number;
}

// ─── State ──────────────────────────────────────────────────────

const openPositions = new Map<string, Position>();
const tradeHistory: TradeRecord[] = [];
const MAX_TRADE_HISTORY = 500;

let tradingEnabled = false;
let totalTicks = 0;
let totalSignals = 0;
let tradesExecuted = 0;
let tradesBlocked = 0;
let totalPnL = 0;
let lastTradeAt: string | null = null;
let strategiesInitialized = false;

// ─── Initialization ─────────────────────────────────────────────

/**
 * Initialize default strategies if none exist.
 */
function initDefaultStrategies(): void {
  if (strategiesInitialized) {return;}
  strategiesInitialized = true;

  const existing = getAllStrategies();
  if (existing.length > 0) {return;}

  // Create a balanced set of strategies for major assets
  createStrategy("BTC Momentum", "momentum", "BTC", { fastPeriod: 10, slowPeriod: 30 });
  createStrategy("ETH RSI", "rsi_reversal", "ETH", { period: 14, oversold: 30, overbought: 70 });
  createStrategy("BTC MACD", "macd_crossover", "BTC", { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
  createStrategy("SOL Breakout", "breakout", "SOL", { period: 20, atrMultiplier: 2 });
  createStrategy("ETH Mean Rev", "mean_reversion", "ETH", { period: 20, stdDev: 2 });
  createStrategy("BTC DCA", "dca", "BTC", { intervalTicks: 500, amountUSD: 100 });

  logger.info("Default trading strategies initialized (6 strategies)");
}

// ─── Main Trading Tick ──────────────────────────────────────────

const STRATEGY_EVAL_INTERVAL = 5; // Evaluate strategies every 5 ticks
const _DCA_CHECK_INTERVAL = 100;    // Check DCA schedules every 100 ticks

/**
 * Main trading tick function — registered in the simulation loop.
 */
export function tradingTick(s: RepublicState): void {
  totalTicks++;

  const config = getConfig();
  const tradingConfig = config.trading;

  // Only run if trading is enabled
  if (!tradingConfig?.enabled && !tradingEnabled) {return;}
  tradingEnabled = tradingConfig?.enabled ?? tradingEnabled;
  if (!tradingEnabled) {return;}

  // Initialize strategies on first tick
  initDefaultStrategies();

  // Step 1: Refresh market data (handled by marketDataTick separately)
  marketDataTick(s.currentTick);

  // Step 2: Evaluate strategies periodically
  if (s.currentTick % STRATEGY_EVAL_INTERVAL !== 0) {return;}

  // Don't trade if circuit breaker is active
  if (isCircuitBroken()) {
    if (s.currentTick % 100 === 0) {
      logger.warn("Trading halted: circuit breaker active");
    }
    return;
  }

  // Run strategy evaluation asynchronously
  evaluateAndTrade(s).catch((err) => {
    logger.warn("Trading tick failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

/**
 * Core strategy evaluation and trade execution loop.
 */
async function evaluateAndTrade(s: RepublicState): Promise<void> {
  const strategies = getActiveStrategies();
  if (strategies.length === 0) {return;}

  // Get current balances for risk checks
  const balances = await getBalances();
  const portfolioValue = balances.reduce((sum, b) => sum + b.valueUSD, 0);
  updatePortfolioValue(portfolioValue);

  // Update open position prices
  for (const [symbol, pos] of openPositions) {
    const price = getPrice(symbol);
    if (price) {
      pos.currentPrice = price.priceUSD;
      pos.unrealizedPnL = (pos.currentPrice - pos.entryPrice) * pos.quantity;
      pos.unrealizedPnLPct = (pos.currentPrice - pos.entryPrice) / pos.entryPrice;
    }
  }

  // Evaluate each active strategy
  for (const strategy of strategies) {
    try {
      // Get price data for this symbol
      const candles = await fetchOHLC(strategy.symbol, 30);
      if (candles.length < 15) {continue;} // Need minimum data

      const closePrices = getClosePrices(candles);
      const signal = evaluateStrategy(strategy, closePrices, candles);
      totalSignals++;

      if (signal.action === "hold") {continue;}

      // DCA strategies have special scheduling
      if (strategy.type === "dca" && s.currentTick % (strategy.parameters.intervalTicks ?? 500) !== 0) {
        continue;
      }

      // Calculate order quantity
      const price = getPrice(signal.symbol)?.priceUSD ?? signal.price;
      if (price <= 0) {continue;}

      let quantity: number;
      if (strategy.type === "dca") {
        quantity = (strategy.parameters.amountUSD ?? 100) / price;
      } else {
        // Position size = portfolio fraction * confidence
        const positionSize = signal.suggestedSize * portfolioValue;
        quantity = positionSize / price;
      }

      if (quantity <= 0) {continue;}

      // Step 3: Risk check
      const riskCheck = checkRisk(signal.action, signal.symbol, quantity, price, balances);

      if (riskCheck.decision === "reject") {
        tradesBlocked++;
        logger.info(`Trade blocked: ${signal.action} ${signal.symbol} — ${riskCheck.reason}`);
        continue;
      }

      // Use adjusted quantity if modified
      const finalQuantity = riskCheck.adjustedQuantity;
      if (finalQuantity <= 0) {continue;}

      // Step 4: Execute trade
      const order = await placeOrder(
        "binance",
        signal.symbol,
        signal.action,
        finalQuantity,
        "market",
      );

      if (order.status === "filled") {
        tradesExecuted++;
        lastTradeAt = ts();
        recordTrade(signal.symbol, signal.action, 0); // Initial PnL is 0

        if (signal.action === "buy") {
          // Open or add to position
          const existing = openPositions.get(signal.symbol);
          if (existing) {
            // Average in
            const totalQty = existing.quantity + order.filledQuantity;
            existing.entryPrice =
              (existing.entryPrice * existing.quantity + order.filledPrice * order.filledQuantity) / totalQty;
            existing.quantity = totalQty;
          } else {
            openPositions.set(signal.symbol, {
              id: uid(),
              symbol: signal.symbol,
              side: "long",
              entryPrice: order.filledPrice,
              quantity: order.filledQuantity,
              currentPrice: order.filledPrice,
              unrealizedPnL: 0,
              unrealizedPnLPct: 0,
              openedAt: ts(),
              strategyId: strategy.id,
            });
          }
        } else {
          // Sell — close position
          const position = openPositions.get(signal.symbol);
          if (position) {
            const pnlUSD = (order.filledPrice - position.entryPrice) * order.filledQuantity;
            const pnlPct = (order.filledPrice - position.entryPrice) / position.entryPrice;
            totalPnL += pnlUSD;

            // Record trade
            const record: TradeRecord = {
              id: uid(),
              symbol: signal.symbol,
              side: "sell",
              quantity: order.filledQuantity,
              entryPrice: position.entryPrice,
              exitPrice: order.filledPrice,
              pnlUSD: parseFloat(pnlUSD.toFixed(2)),
              pnlPct: parseFloat(pnlPct.toFixed(4)),
              strategyId: strategy.id,
              strategyName: strategy.name,
              riskScore: riskCheck.riskScore,
              timestamp: ts(),
            };
            tradeHistory.push(record);

            // Update strategy win/loss
            if (pnlUSD > 0) {
              strategy.winCount++;
            } else {
              strategy.lossCount++;
            }

            // Record revenue to treasury if profitable
            if (pnlUSD > 0) {
              recordRevenue(pnlUSD, "USD", "other", `Trading profit: ${signal.symbol}`, s);
            }

            // Remove or reduce position
            if (order.filledQuantity >= position.quantity) {
              openPositions.delete(signal.symbol);
            } else {
              position.quantity -= order.filledQuantity;
            }

            logger.info(
              `Trade closed: ${signal.symbol} PnL: $${pnlUSD.toFixed(2)} (${(pnlPct * 100).toFixed(2)}%)`,
            );
          }
        }

        // Cap trade history
        if (tradeHistory.length > MAX_TRADE_HISTORY) {
          tradeHistory.splice(0, tradeHistory.length - MAX_TRADE_HISTORY);
        }
      }
    } catch (err) {
      logger.warn(`Strategy ${strategy.name} evaluation failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Sync real prices back to republic state
  const btcPrice = getPrice("BTC")?.priceUSD;
  const ethPrice = getPrice("ETH")?.priceUSD;
  if (btcPrice && btcPrice > 0) {s.priceIndex.BTC = btcPrice;}
  if (ethPrice && ethPrice > 0) {s.priceIndex.ETH = ethPrice;}
}

// ─── Control Functions ──────────────────────────────────────────

/**
 * Enable autonomous trading.
 */
export function enableTrading(): void {
  tradingEnabled = true;
  initDefaultStrategies();
  logger.info("Autonomous trading ENABLED");
}

/**
 * Disable autonomous trading.
 */
export function disableTrading(): void {
  tradingEnabled = false;
  logger.info("Autonomous trading DISABLED");
}

/**
 * Check if trading is enabled.
 */
export function isTradingEnabled(): boolean {
  return tradingEnabled;
}

// ─── Query Functions ────────────────────────────────────────────

/**
 * Get full trading status for UI.
 */
export async function getTradingStatus(): Promise<TradingStatus> {
  const config = getConfig();
  const mode = config.trading?.mode ?? "paper";

  let portfolioValueUSD = 0;
  try {
    portfolioValueUSD = await getPortfolioValue();
  } catch {
    // ignore
  }

  const allTrades = tradeHistory;
  const winCount = allTrades.filter((t) => t.pnlUSD > 0).length;
  const totalTradeCount = allTrades.length;

  return {
    enabled: tradingEnabled,
    mode,
    portfolioValueUSD: parseFloat(portfolioValueUSD.toFixed(2)),
    positions: Array.from(openPositions.values()),
    dailyPnL: parseFloat(
      tradeHistory
        .filter((t) => {
          const tradeDate = new Date(t.timestamp).toDateString();
          return tradeDate === new Date().toDateString();
        })
        .reduce((sum, t) => sum + t.pnlUSD, 0)
        .toFixed(2),
    ),
    totalPnL: parseFloat(totalPnL.toFixed(2)),
    winRate: totalTradeCount > 0 ? parseFloat((winCount / totalTradeCount).toFixed(3)) : 0,
    totalTrades: totalTradeCount,
    activeStrategies: getActiveStrategies().length,
    circuitBroken: isCircuitBroken(),
    lastTradeAt,
  };
}

/**
 * Get trade history.
 */
export function getTradeHistory(limit = 50): TradeRecord[] {
  return tradeHistory.slice(-limit);
}

/**
 * Get open positions.
 */
export function getOpenPositions(): Position[] {
  return Array.from(openPositions.values());
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getTradingDiagnostics(): TradingDiagnostics {
  return {
    enabled: tradingEnabled,
    mode: getConfig().trading?.mode ?? "paper",
    totalTicks,
    totalSignals,
    tradesExecuted,
    tradesBlocked,
    portfolioValueUSD: 0, // Async; use getTradingStatus for real value
    openPositions: openPositions.size,
    dailyPnL: 0,
    totalPnL: parseFloat(totalPnL.toFixed(2)),
  };
}
