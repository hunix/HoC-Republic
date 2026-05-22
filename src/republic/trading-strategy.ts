/**
 * Republic Platform — Trading Strategy Engine
 *
 * Technical analysis indicators and strategy definitions.
 * Generates buy/sell/hold signals based on price data.
 * Supports backtesting against historical data.
 */

import type { OHLC } from "./market-data.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { uid } from "./utils.js";

const logger = createSubsystemLogger("republic:trading-strategy");

// ─── Types ──────────────────────────────────────────────────────

export type SignalAction = "buy" | "sell" | "hold";

export interface TradingSignal {
  id: string;
  strategyId: string;
  symbol: string;
  action: SignalAction;
  confidence: number; // 0-1
  reason: string;
  price: number;
  suggestedSize: number; // fraction of portfolio (0-1)
  timestamp: string;
}

export type StrategyType =
  | "momentum"
  | "mean_reversion"
  | "breakout"
  | "dca"
  | "macd_crossover"
  | "rsi_reversal";

export interface TradingStrategy {
  id: string;
  name: string;
  type: StrategyType;
  symbol: string;
  enabled: boolean;
  parameters: Record<string, number>;
  createdAt: string;
  lastSignal?: TradingSignal;
  totalSignals: number;
  winCount: number;
  lossCount: number;
}

export interface BacktestResult {
  strategyId: string;
  symbol: string;
  periods: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  profitFactor: number;
}

export interface StrategyDiagnostics {
  totalStrategies: number;
  activeStrategies: number;
  recentSignals: TradingSignal[];
  bestStrategy: string | null;
}

// ─── Indicator Functions ────────────────────────────────────────

/** Simple Moving Average */
export function sma(prices: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    const slice = prices.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

/** Exponential Moving Average */
export function ema(prices: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);

  for (let i = 0; i < prices.length; i++) {
    if (i === 0) {
      result.push(prices[0]);
    } else if (i < period - 1) {
      // Use SMA for initial period
      const slice = prices.slice(0, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / (i + 1));
    } else if (i === period - 1) {
      // First EMA = SMA of first N periods
      const slice = prices.slice(0, period);
      result.push(slice.reduce((a, b) => a + b, 0) / period);
    } else {
      result.push((prices[i] - result[i - 1]) * multiplier + result[i - 1]);
    }
  }
  return result;
}

/** Relative Strength Index (14 periods default) */
export function rsi(prices: number[], period = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (i === 0) {
      result.push(NaN);
      continue;
    }

    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);

    if (i < period) {
      result.push(NaN);
      continue;
    }

    if (i === period) {
      const avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        result.push(100 - 100 / (1 + rs));
      }
    } else {
      // Smoothed RSI
      const prevRSI = result[i - 1];
      if (isNaN(prevRSI)) {
        result.push(NaN);
        continue;
      }
      const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;
      if (avgLoss === 0) {
        result.push(100);
      } else {
        const rs = avgGain / avgLoss;
        result.push(100 - 100 / (1 + rs));
      }
    }
  }
  return result;
}

/** MACD (12, 26, 9 default) */
export function macd(
  prices: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  const fastEMA = ema(prices, fastPeriod);
  const slowEMA = ema(prices, slowPeriod);

  const macdLine: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (isNaN(fastEMA[i]) || isNaN(slowEMA[i])) {
      macdLine.push(NaN);
    } else {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }
  }

  const validMACD = macdLine.filter((v) => !isNaN(v));
  const signalLine = ema(validMACD, signalPeriod);

  // Align signal line with MACD line
  const alignedSignal: number[] = [];
  let validIdx = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (isNaN(macdLine[i])) {
      alignedSignal.push(NaN);
    } else {
      alignedSignal.push(validIdx < signalLine.length ? signalLine[validIdx] : NaN);
      validIdx++;
    }
  }

  const histogram: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (isNaN(macdLine[i]) || isNaN(alignedSignal[i])) {
      histogram.push(NaN);
    } else {
      histogram.push(macdLine[i] - alignedSignal[i]);
    }
  }

  return { macdLine, signalLine: alignedSignal, histogram };
}

/** Bollinger Bands (20 periods, 2 std dev default) */
export function bollingerBands(
  prices: number[],
  period = 20,
  stdDev = 2,
): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = sma(prices, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < prices.length; i++) {
    if (isNaN(middle[i])) {
      upper.push(NaN);
      lower.push(NaN);
      continue;
    }

    const slice = prices.slice(Math.max(0, i - period + 1), i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((sum, p) => sum + (p - mean) ** 2, 0) / slice.length;
    const sd = Math.sqrt(variance);

    upper.push(middle[i] + stdDev * sd);
    lower.push(middle[i] - stdDev * sd);
  }

  return { upper, middle, lower };
}

/** Average True Range */
export function atr(candles: OHLC[], period = 14): number[] {
  const trueRanges: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trueRanges.push(candles[i].high - candles[i].low);
    } else {
      const prevClose = candles[i - 1].close;
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - prevClose),
        Math.abs(candles[i].low - prevClose),
      );
      trueRanges.push(tr);
    }
  }

  return sma(trueRanges, period);
}

// ─── State ──────────────────────────────────────────────────────

const strategies = new Map<string, TradingStrategy>();
const recentSignals: TradingSignal[] = [];
const MAX_RECENT_SIGNALS = 100;

// ─── Strategy Management ────────────────────────────────────────

/**
 * Create a new trading strategy.
 */
export function createStrategy(
  name: string,
  type: StrategyType,
  symbol: string,
  parameters: Record<string, number> = {},
): TradingStrategy {
  const defaults: Record<StrategyType, Record<string, number>> = {
    momentum: { fastPeriod: 10, slowPeriod: 30, threshold: 0.02 },
    mean_reversion: { period: 20, stdDev: 2, entryThreshold: -1.5, exitThreshold: 0.5 },
    breakout: { period: 20, atrMultiplier: 2, minVolume: 1.5 },
    dca: { intervalTicks: 100, amountUSD: 100 },
    macd_crossover: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    rsi_reversal: { period: 14, oversold: 30, overbought: 70 },
  };

  const strategy: TradingStrategy = {
    id: uid(),
    name,
    type,
    symbol: symbol.toUpperCase(),
    enabled: true,
    parameters: { ...defaults[type], ...parameters },
    createdAt: new Date().toISOString(),
    totalSignals: 0,
    winCount: 0,
    lossCount: 0,
  };

  strategies.set(strategy.id, strategy);
  logger.info(`Strategy created: ${name} (${type}) for ${symbol}`);
  return strategy;
}

/**
 * Evaluate a strategy against price data and generate a signal.
 */
export function evaluateStrategy(
  strategy: TradingStrategy,
  closePrices: number[],
  _candles?: OHLC[],
): TradingSignal {
  const currentPrice = closePrices[closePrices.length - 1];

  let action: SignalAction = "hold";
  let confidence = 0;
  let reason = "";

  switch (strategy.type) {
    case "momentum": {
      const fast = sma(closePrices, strategy.parameters.fastPeriod ?? 10);
      const slow = sma(closePrices, strategy.parameters.slowPeriod ?? 30);
      const lastFast = fast[fast.length - 1];
      const lastSlow = slow[slow.length - 1];
      const prevFast = fast[fast.length - 2];
      const prevSlow = slow[slow.length - 2];

      if (!isNaN(lastFast) && !isNaN(lastSlow)) {
        if (lastFast > lastSlow && prevFast <= prevSlow) {
          action = "buy";
          confidence = Math.min(1, (Math.abs(lastFast - lastSlow) / lastSlow) * 10);
          reason = `Golden cross: fast SMA(${strategy.parameters.fastPeriod}) crossed above slow SMA(${strategy.parameters.slowPeriod})`;
        } else if (lastFast < lastSlow && prevFast >= prevSlow) {
          action = "sell";
          confidence = Math.min(1, (Math.abs(lastFast - lastSlow) / lastSlow) * 10);
          reason = `Death cross: fast SMA crossed below slow SMA`;
        } else {
          reason = `No crossover. Fast: ${lastFast.toFixed(2)}, Slow: ${lastSlow.toFixed(2)}`;
        }
      }
      break;
    }

    case "rsi_reversal": {
      const rsiValues = rsi(closePrices, strategy.parameters.period ?? 14);
      const lastRSI = rsiValues[rsiValues.length - 1];
      const oversold = strategy.parameters.oversold ?? 30;
      const overbought = strategy.parameters.overbought ?? 70;

      if (!isNaN(lastRSI)) {
        if (lastRSI < oversold) {
          action = "buy";
          confidence = Math.min(1, (oversold - lastRSI) / oversold);
          reason = `RSI oversold at ${lastRSI.toFixed(1)} (threshold: ${oversold})`;
        } else if (lastRSI > overbought) {
          action = "sell";
          confidence = Math.min(1, (lastRSI - overbought) / (100 - overbought));
          reason = `RSI overbought at ${lastRSI.toFixed(1)} (threshold: ${overbought})`;
        } else {
          reason = `RSI neutral at ${lastRSI.toFixed(1)}`;
        }
      }
      break;
    }

    case "macd_crossover": {
      const {
        macdLine: macdL,
        signalLine: sigL,
        histogram: hist,
      } = macd(
        closePrices,
        strategy.parameters.fastPeriod ?? 12,
        strategy.parameters.slowPeriod ?? 26,
        strategy.parameters.signalPeriod ?? 9,
      );
      const lastHist = hist[hist.length - 1];
      const prevHist = hist[hist.length - 2];

      if (!isNaN(lastHist) && !isNaN(prevHist)) {
        if (lastHist > 0 && prevHist <= 0) {
          action = "buy";
          confidence = Math.min(1, Math.abs(lastHist) / (Math.abs(macdL[macdL.length - 1]) || 1));
          reason = `MACD histogram crossed above zero (bullish crossover)`;
        } else if (lastHist < 0 && prevHist >= 0) {
          action = "sell";
          confidence = Math.min(1, Math.abs(lastHist) / (Math.abs(macdL[macdL.length - 1]) || 1));
          reason = `MACD histogram crossed below zero (bearish crossover)`;
        } else {
          const lastMACD = macdL[macdL.length - 1];
          const lastSig = sigL[sigL.length - 1];
          reason = `MACD: ${isNaN(lastMACD) ? "N/A" : lastMACD.toFixed(2)}, Signal: ${isNaN(lastSig) ? "N/A" : lastSig.toFixed(2)}`;
        }
      }
      break;
    }

    case "mean_reversion": {
      const bb = bollingerBands(
        closePrices,
        strategy.parameters.period ?? 20,
        strategy.parameters.stdDev ?? 2,
      );
      const lastUpper = bb.upper[bb.upper.length - 1];
      const lastLower = bb.lower[bb.lower.length - 1];
      const lastMiddle = bb.middle[bb.middle.length - 1];

      if (!isNaN(lastUpper) && !isNaN(lastLower)) {
        const bandwidth = lastUpper - lastLower;
        const position = (currentPrice - lastLower) / bandwidth;

        if (position < 0.1) {
          action = "buy";
          confidence = Math.min(1, 1 - position * 5);
          reason = `Price near lower Bollinger Band (position: ${(position * 100).toFixed(1)}%)`;
        } else if (position > 0.9) {
          action = "sell";
          confidence = Math.min(1, (position - 0.9) * 10);
          reason = `Price near upper Bollinger Band (position: ${(position * 100).toFixed(1)}%)`;
        } else {
          reason = `Price within bands (position: ${(position * 100).toFixed(1)}%, mid: $${lastMiddle.toFixed(2)})`;
        }
      }
      break;
    }

    case "breakout": {
      const period = strategy.parameters.period ?? 20;
      if (closePrices.length >= period) {
        const recentPrices = closePrices.slice(-period);
        const high = Math.max(...recentPrices);
        const low = Math.min(...recentPrices);
        const range = high - low;

        if (currentPrice > high * 0.99 && range > 0) {
          action = "buy";
          confidence = Math.min(1, (currentPrice - high * 0.99) / (range * 0.1));
          reason = `Breakout above ${period}-period high ($${high.toFixed(2)})`;
        } else if (currentPrice < low * 1.01 && range > 0) {
          action = "sell";
          confidence = Math.min(1, (low * 1.01 - currentPrice) / (range * 0.1));
          reason = `Breakdown below ${period}-period low ($${low.toFixed(2)})`;
        } else {
          reason = `Price within range. High: $${high.toFixed(2)}, Low: $${low.toFixed(2)}`;
        }
      }
      break;
    }

    case "dca": {
      // DCA always buys on schedule
      action = "buy";
      confidence = 0.5;
      reason = `DCA: scheduled buy of $${strategy.parameters.amountUSD ?? 100}`;
      break;
    }
  }

  const signal: TradingSignal = {
    id: uid(),
    strategyId: strategy.id,
    symbol: strategy.symbol,
    action,
    confidence: parseFloat(confidence.toFixed(3)),
    reason,
    price: currentPrice,
    suggestedSize: action === "hold" ? 0 : Math.min(0.1, confidence * 0.15),
    timestamp: new Date().toISOString(),
  };

  strategy.lastSignal = signal;
  strategy.totalSignals++;

  recentSignals.push(signal);
  if (recentSignals.length > MAX_RECENT_SIGNALS) {
    recentSignals.splice(0, recentSignals.length - MAX_RECENT_SIGNALS);
  }

  if (action !== "hold") {
    logger.info(
      `Signal: ${action.toUpperCase()} ${strategy.symbol} (${strategy.name}) — ${reason}`,
    );
  }

  return signal;
}

/**
 * Backtest a strategy against historical candle data.
 */
export function backtestStrategy(
  strategyType: StrategyType,
  closePrices: number[],
  parameters: Record<string, number> = {},
): BacktestResult {
  const tempStrategy = createStrategy("backtest", strategyType, "TEST", parameters);
  strategies.delete(tempStrategy.id); // Don't keep backtest strategies

  let portfolio = 10000; // $10K starting
  let position = 0;
  let entryPrice = 0;
  let wins = 0;
  let losses = 0;
  let totalTrades = 0;
  let peakPortfolio = portfolio;
  let maxDrawdown = 0;
  const returns: number[] = [];
  let totalProfit = 0;
  let totalLoss = 0;

  // Walk forward through price data
  const minData = 30; // Need enough data for indicators
  for (let i = minData; i < closePrices.length; i++) {
    const window = closePrices.slice(0, i + 1);
    const signal = evaluateStrategy(tempStrategy, window);

    if (signal.action === "buy" && position === 0) {
      // Enter long
      position = portfolio / closePrices[i];
      entryPrice = closePrices[i];
      portfolio = 0;
    } else if (signal.action === "sell" && position > 0) {
      // Exit long
      portfolio = position * closePrices[i];
      const trade_return = (closePrices[i] - entryPrice) / entryPrice;
      returns.push(trade_return);

      if (trade_return > 0) {
        wins++;
        totalProfit += trade_return;
      } else {
        losses++;
        totalLoss += Math.abs(trade_return);
      }
      totalTrades++;

      position = 0;
      entryPrice = 0;
    }

    // Track drawdown
    const currentValue = position > 0 ? position * closePrices[i] : portfolio;
    peakPortfolio = Math.max(peakPortfolio, currentValue);
    const dd = peakPortfolio > 0 ? (peakPortfolio - currentValue) / peakPortfolio : 0;
    maxDrawdown = Math.max(maxDrawdown, dd);
  }

  // Close any open position
  if (position > 0) {
    portfolio = position * closePrices[closePrices.length - 1];
  }

  const totalReturn = (portfolio - 10000) / 10000;

  // Sharpe ratio (annualized, assuming daily returns)
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance =
    returns.length > 1
      ? returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / (returns.length - 1)
      : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  return {
    strategyId: "backtest",
    symbol: "TEST",
    periods: closePrices.length,
    totalTrades,
    winningTrades: wins,
    losingTrades: losses,
    winRate: totalTrades > 0 ? wins / totalTrades : 0,
    totalReturn: parseFloat(totalReturn.toFixed(4)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(3)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(4)),
    profitFactor:
      totalLoss > 0
        ? parseFloat((totalProfit / totalLoss).toFixed(3))
        : totalProfit > 0
          ? Infinity
          : 0,
  };
}

// ─── Query Functions ────────────────────────────────────────────

export function getActiveStrategies(): TradingStrategy[] {
  return Array.from(strategies.values()).filter((s) => s.enabled);
}

export function getAllStrategies(): TradingStrategy[] {
  return Array.from(strategies.values());
}

export function getStrategy(id: string): TradingStrategy | undefined {
  return strategies.get(id);
}

export function toggleStrategy(id: string): boolean {
  const s = strategies.get(id);
  if (!s) {
    return false;
  }
  s.enabled = !s.enabled;
  return true;
}

export function deleteStrategy(id: string): boolean {
  return strategies.delete(id);
}

export function getRecentSignals(limit = 20): TradingSignal[] {
  return recentSignals.slice(-limit);
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getStrategyDiagnostics(): StrategyDiagnostics {
  const all = Array.from(strategies.values());
  const bestWinRate = all.reduce(
    (best, s) => {
      const total = s.winCount + s.lossCount;
      const rate = total > 0 ? s.winCount / total : 0;
      return rate > best.rate ? { name: s.name, rate } : best;
    },
    { name: "", rate: 0 },
  );

  return {
    totalStrategies: all.length,
    activeStrategies: all.filter((s) => s.enabled).length,
    recentSignals: recentSignals.slice(-5),
    bestStrategy: bestWinRate.name || null,
  };
}
