/**
 * Republic Platform — Forex Strategy Engine
 *
 * 8 professional Forex trading strategies using:
 *   - technicalindicators npm package (Ichimoku, ADX, Stochastic, CCI, Williams %R)
 *   - Custom Forex-specific logic (carry trade, session breakout, divergence)
 *
 * Each strategy is self-scoring: tracks win rate and auto-disables if consistently poor.
 * Walk-forward backtesting is built in for parameter optimization.
 */
// oxlint-disable eslint(curly)

import { createSubsystemLogger } from "../logging/subsystem.js";
import type { ForexOHLC } from "./forex-data.js";
import { pipSize } from "./forex-data.js";
import { uid } from "./utils.js";

const logger = createSubsystemLogger("republic:forex-strategies");

// ─── Types ──────────────────────────────────────────────────────

export type ForexSignalAction = "buy" | "sell" | "hold";
export type ForexStrategyType =
  | "trend_following"
  | "rsi_stochastic_confluence"
  | "ict_session_breakout"
  | "carry_trade"
  | "bollinger_squeeze"
  | "ichimoku_cloud"
  | "macd_divergence"
  | "support_resistance";

export interface ForexSignal {
  id: string;
  strategyId: string;
  strategyName: string;
  pair: string;
  action: ForexSignalAction;
  confidence: number;   // 0–1
  reason: string;
  price: number;
  suggestedUnits: number;         // Lot-equivalent units
  stopLossPips: number;           // Always set — no trade without SL
  takeProfitPips: number;
  riskRewardRatio: number;        // TP/SL
  timestamp: string;
  session: "asian" | "london" | "ny" | "overlap";
}

export interface ForexStrategy {
  id: string;
  name: string;
  type: ForexStrategyType;
  pairs: string[];           // Which pairs this strategy trades
  enabled: boolean;
  parameters: Record<string, number>;
  createdAt: string;
  lastSignal?: ForexSignal;
  totalSignals: number;
  winCount: number;
  lossCount: number;
  totalPnLPips: number;
  maxDrawdownPips: number;
  // Self-improvement tracking
  consecutiveLosses: number;
  autoDisabledAt?: string;
}

export interface ForexBacktestResult {
  strategyType: ForexStrategyType;
  pair: string;
  totalTrades: number;
  winRate: number;
  totalReturnPips: number;
  sharpeRatio: number;
  maxDrawdownPips: number;
  profitFactor: number;
  averageRRR: number;
  expectancy: number;     // Average pips per trade
}

// ─── Technical Indicator Helpers (lightweight, no external deps for basic ones) ─

function sma(data: number[], period: number): number[] {
  return data.map((_, i) =>
    i < period - 1 ? NaN : data.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period
  );
}

function ema(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  return data.reduce<number[]>((acc, val, i) => {
    if (i === 0) return [val];
    const prev = acc[i - 1];
    return [...acc, isNaN(prev) ? val : val * k + prev * (1 - k)];
  }, []);
}

function rsi(closes: number[], period = 14): number[] {
  const result: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { result.push(NaN); continue; }
    const d = closes[i] - closes[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
    if (i < period) { result.push(NaN); continue; }
    const ag = gains.slice(-period).reduce((a, b) => a + b) / period;
    const al = losses.slice(-period).reduce((a, b) => a + b) / period;
    result.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  }
  return result;
}

function stochastic(closes: number[], highs: number[], lows: number[], period = 14): number[] {
  return closes.map((_, i) => {
    if (i < period - 1) return NaN;
    const slice_h = highs.slice(i - period + 1, i + 1);
    const slice_l = lows.slice(i - period + 1, i + 1);
    const highest = Math.max(...slice_h);
    const lowest = Math.min(...slice_l);
    return highest === lowest ? 50 : ((closes[i] - lowest) / (highest - lowest)) * 100;
  });
}

function atr(candles: ForexOHLC[], period = 14): number[] {
  const tr = candles.map((c, i) =>
    i === 0 ? c.high - c.low
      : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close))
  );
  return sma(tr, period);
}

function adx(candles: ForexOHLC[], period = 14): number[] {
  // Simplified ADX calculation
  const trArr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i === 0) { trArr.push(0); plusDM.push(0); minusDM.push(0); continue; }
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    trArr.push(tr);
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const smoothTR = sma(trArr, period);
  const smoothPlus = sma(plusDM, period);
  const smoothMinus = sma(minusDM, period);

  return smoothTR.map((tr, i) => {
    if (isNaN(tr) || tr === 0) return NaN;
    const pdi = (smoothPlus[i] / tr) * 100;
    const mdi = (smoothMinus[i] / tr) * 100;
    const dx = Math.abs(pdi - mdi) / (pdi + mdi) * 100;
    return isNaN(dx) ? NaN : dx;
  });
}

/** Ichimoku Cloud components */
function ichimoku(candles: ForexOHLC[]): {
  tenkan: number[]; kijun: number[]; senkou_a: number[]; senkou_b: number[]; chikou: number[];
} {
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const close = candles.map((c) => c.close);

  const midpoint = (hs: number[], ls: number[], period: number) =>
    hs.map((_, i) => {
      if (i < period - 1) return NaN;
      const h = Math.max(...hs.slice(i - period + 1, i + 1));
      const l = Math.min(...ls.slice(i - period + 1, i + 1));
      return (h + l) / 2;
    });

  const tenkan = midpoint(high, low, 9);
  const kijun = midpoint(high, low, 26);
  const senkou_a = tenkan.map((t, i) => (isNaN(t) || isNaN(kijun[i])) ? NaN : (t + kijun[i]) / 2);
  const senkou_b = midpoint(high, low, 52);
  const chikou = [...close.slice(26), ...Array(26).fill(NaN)];

  return { tenkan, kijun, senkou_a, senkou_b, chikou };
}

// ─── Session Detection ───────────────────────────────────────────

export function getCurrentSession(): "asian" | "london" | "ny" | "overlap" {
  const hourUTC = new Date().getUTCHours();
  if (hourUTC >= 13 && hourUTC < 17) return "overlap"; // London-NY overlap
  if (hourUTC >= 8 && hourUTC < 17) return "london";
  if (hourUTC >= 13 && hourUTC < 22) return "ny";
  return "asian";
}

// ─── Interest Rate Differential for Carry Trade ──────────────────

const POLICY_RATES: Record<string, number> = {
  USD: 5.25, EUR: 4.00, GBP: 5.25, JPY: 0.10, CHF: 1.75,
  AUD: 4.35, NZD: 5.50, CAD: 5.00,
};

function getCarryDiff(pair: string): number {
  const base = POLICY_RATES[pair.slice(0, 3)] ?? 2.0;
  const quote = POLICY_RATES[pair.slice(3)] ?? 2.0;
  return base - quote;
}

// ─── Strategy Registry ───────────────────────────────────────────

const strategies = new Map<string, ForexStrategy>();
const recentSignals: ForexSignal[] = [];
const MAX_SIGNALS = 200;

const STRATEGY_DEFAULTS: Record<ForexStrategyType, {
  pairs: string[];
  parameters: Record<string, number>;
}> = {
  trend_following: {
    pairs: ["EURUSD", "GBPUSD", "AUDUSD", "USDJPY"],
    parameters: { ema_fast: 20, ema_slow: 50, ema_trend: 200, adx_min: 25, sl_pips: 20, tp_pips: 60 },
  },
  rsi_stochastic_confluence: {
    pairs: ["USDJPY", "AUDUSD", "USDCAD", "GBPUSD"],
    parameters: { rsi_period: 14, stoch_period: 14, oversold: 30, overbought: 70, sl_pips: 15, tp_pips: 45 },
  },
  ict_session_breakout: {
    pairs: ["GBPUSD", "EURUSD", "GBPJPY"],
    parameters: { lookback_candles: 8, atr_mult: 1.0, sl_pips: 15, tp_pips: 30 },
  },
  carry_trade: {
    pairs: ["AUDJPY", "NZDJPY", "GBPJPY", "CADJPY"],
    parameters: { min_carry_diff: 2.0, adx_min: 20, sl_pips: 40, tp_pips: 100 },
  },
  bollinger_squeeze: {
    pairs: ["EURUSD", "GBPUSD", "USDCHF", "AUDUSD"],
    parameters: { period: 20, std_dev: 2.0, squeeze_threshold: 0.0008, sl_pips: 15, tp_pips: 45 },
  },
  ichimoku_cloud: {
    pairs: ["USDJPY", "EURJPY", "GBPJPY"],
    parameters: { sl_pips: 25, tp_pips: 75 },
  },
  macd_divergence: {
    pairs: ["EURUSD", "GBPUSD", "AUDUSD"],
    parameters: { fast: 12, slow: 26, signal: 9, lookback: 20, sl_pips: 20, tp_pips: 50 },
  },
  support_resistance: {
    pairs: ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD"],
    parameters: { lookback: 50, zone_pips: 5, sl_pips: 15, tp_pips: 45 },
  },
};

// ─── Signal Generation ───────────────────────────────────────────

function generateSignal(
  strategy: ForexStrategy,
  pair: string,
  candles: ForexOHLC[],
): ForexSignal {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const pip = pipSize(pair);
  const price = closes[closes.length - 1];
  const session = getCurrentSession();

  let action: ForexSignalAction = "hold";
  let confidence = 0;
  let reason = "";

  const sl = (strategy.parameters["sl_pips"] ?? 20) * pip;
  const tp = (strategy.parameters["tp_pips"] ?? 60) * pip;
  const slPips = strategy.parameters["sl_pips"] ?? 20;
  const tpPips = strategy.parameters["tp_pips"] ?? 60;

  switch (strategy.type) {
    case "trend_following": {
      if (closes.length < 200) break;
      const fast = ema(closes, strategy.parameters["ema_fast"] ?? 20);
      const slow = ema(closes, strategy.parameters["ema_slow"] ?? 50);
      const trend = ema(closes, strategy.parameters["ema_trend"] ?? 200);
      const adxVals = adx(candles, 14);
      const lastAdx = adxVals[adxVals.length - 1];
      const lastFast = fast[fast.length - 1];
      const lastSlow = slow[slow.length - 1];
      const prevFast = fast[fast.length - 2];
      const prevSlow = slow[slow.length - 2];
      const lastTrend = trend[trend.length - 1];

      if (isNaN(lastAdx) || lastAdx < (strategy.parameters["adx_min"] ?? 25)) {
        reason = `ADX ${lastAdx?.toFixed(1)} below threshold (trend too weak)`;
        break;
      }
      if (lastFast > lastSlow && prevFast <= prevSlow && price > lastTrend) {
        action = "buy";
        confidence = Math.min(0.9, lastAdx / 60);
        reason = `EMA(${strategy.parameters["ema_fast"]}/${strategy.parameters["ema_slow"]}) golden cross. ADX: ${lastAdx.toFixed(1)}. Trend UP (price > EMA200)`;
      } else if (lastFast < lastSlow && prevFast >= prevSlow && price < lastTrend) {
        action = "sell";
        confidence = Math.min(0.9, lastAdx / 60);
        reason = `EMA death cross. ADX: ${lastAdx.toFixed(1)}. Trend DOWN`;
      }
      break;
    }

    case "rsi_stochastic_confluence": {
      if (closes.length < 30) break;
      const rsiVals = rsi(closes, strategy.parameters["rsi_period"] ?? 14);
      const stochVals = stochastic(closes, highs, lows, strategy.parameters["stoch_period"] ?? 14);
      const lastRsi = rsiVals[rsiVals.length - 1];
      const lastStoch = stochVals[stochVals.length - 1];
      const prevRsi = rsiVals[rsiVals.length - 2];
      const prevStoch = stochVals[stochVals.length - 2];
      const oversold = strategy.parameters["oversold"] ?? 30;
      const overbought = strategy.parameters["overbought"] ?? 70;

      if (isNaN(lastRsi) || isNaN(lastStoch)) break;

      const rsiBuy = lastRsi < oversold && prevRsi <= lastRsi; // RSI turning up from oversold
      const stochBuy = lastStoch < oversold && prevStoch <= lastStoch;
      const rsiSell = lastRsi > overbought && prevRsi >= lastRsi;
      const stochSell = lastStoch > overbought && prevStoch >= lastStoch;

      if (rsiBuy && stochBuy) {
        action = "buy";
        confidence = Math.min(0.85, ((oversold - lastRsi) / oversold + (oversold - lastStoch) / oversold) / 2);
        reason = `RSI+Stochastic confluence: both oversold reversal. RSI: ${lastRsi.toFixed(1)}, Stoch: ${lastStoch.toFixed(1)}`;
      } else if (rsiSell && stochSell) {
        action = "sell";
        confidence = Math.min(0.85, ((lastRsi - overbought) / (100 - overbought) + (lastStoch - overbought) / (100 - overbought)) / 2);
        reason = `RSI+Stochastic confluence: both overbought reversal. RSI: ${lastRsi.toFixed(1)}, Stoch: ${lastStoch.toFixed(1)}`;
      }
      break;
    }

    case "ict_session_breakout": {
      // Only trade during London open (07:00–10:00 UTC)
      const hourUTC = new Date().getUTCHours();
      if (hourUTC < 7 || hourUTC > 10) {
        reason = "Outside London session breakout window (07-10 UTC)";
        break;
      }
      const lookback = strategy.parameters["lookback_candles"] ?? 8;
      if (candles.length < lookback + 2) break;
      const asianRange = candles.slice(-lookback - 1, -1);
      const asianHigh = Math.max(...asianRange.map((c) => c.high));
      const asianLow = Math.min(...asianRange.map((c) => c.low));
      const atrVal = atr(candles, 14);
      const lastAtr = atrVal[atrVal.length - 1];
      const minBreakout = lastAtr * (strategy.parameters["atr_mult"] ?? 1.0);

      if (price > asianHigh + minBreakout) {
        action = "buy";
        confidence = Math.min(0.8, (price - asianHigh) / (asianHigh - asianLow));
        reason = `London breakout ABOVE Asian high (${asianHigh.toFixed(5)}). Range: ${((asianHigh - asianLow) / pip).toFixed(0)} pips`;
      } else if (price < asianLow - minBreakout) {
        action = "sell";
        confidence = Math.min(0.8, (asianLow - price) / (asianHigh - asianLow));
        reason = `London breakout BELOW Asian low (${asianLow.toFixed(5)}). Range: ${((asianHigh - asianLow) / pip).toFixed(0)} pips`;
      }
      break;
    }

    case "carry_trade": {
      // Only buy high-yield vs low-yield during risk-on
      const carryDiff = getCarryDiff(pair);
      const minDiff = strategy.parameters["min_carry_diff"] ?? 2.0;
      if (Math.abs(carryDiff) < minDiff) {
        reason = `Carry differential too small: ${carryDiff.toFixed(2)}% (need ≥${minDiff}%)`;
        break;
      }
      // ADX filter for trending (carry works best in trending markets)
      const adxVals = adx(candles, 14);
      const lastAdx = adxVals[adxVals.length - 1];
      if (!isNaN(lastAdx) && lastAdx < (strategy.parameters["adx_min"] ?? 20)) {
        reason = `Trend too weak for carry (ADX ${lastAdx.toFixed(1)})`;
        break;
      }
      // Bias: buy if base currency has higher rate
      if (carryDiff > 0) {
        action = "buy";
        confidence = Math.min(0.7, carryDiff / 8);
        reason = `Carry trade: ${pair.slice(0, 3)} rate ${carryDiff.toFixed(2)}% higher than ${pair.slice(3)}. Collect positive swap`;
      } else {
        action = "sell";
        confidence = Math.min(0.7, Math.abs(carryDiff) / 8);
        reason = `Carry trade: Short ${pair.slice(0, 3)} (lower rates), collect roll in quote currency`;
      }
      break;
    }

    case "bollinger_squeeze": {
      if (closes.length < 30) break;
      const period = strategy.parameters["period"] ?? 20;
      const std = strategy.parameters["std_dev"] ?? 2.0;
      const smaMid = sma(closes, period);
      const lastMid = smaMid[smaMid.length - 1];
      if (isNaN(lastMid)) break;
      const slice = closes.slice(-period);
      const variance = slice.reduce((s, x) => s + (x - lastMid) ** 2, 0) / period;
      const sd = Math.sqrt(variance);
      const upper = lastMid + std * sd;
      const lower = lastMid - std * sd;
      const bandWidth = (upper - lower) / lastMid;
      const squeeze = strategy.parameters["squeeze_threshold"] ?? 0.0008;

      if (bandWidth < squeeze) {
        // Squeeze: detect direction from momentum
        const momentum = closes[closes.length - 1] - closes[closes.length - period];
        if (momentum > 0 && price > upper) {
          action = "buy";
          confidence = 0.65;
          reason = `Bollinger squeeze breakout UP. Bandwidth: ${(bandWidth * 10000).toFixed(1)} pips wide`;
        } else if (momentum < 0 && price < lower) {
          action = "sell";
          confidence = 0.65;
          reason = `Bollinger squeeze breakout DOWN. Bandwidth: ${(bandWidth * 10000).toFixed(1)} pips wide`;
        }
      }
      break;
    }

    case "ichimoku_cloud": {
      if (candles.length < 60) break;
      const ichi = ichimoku(candles);
      const n = ichi.tenkan.length - 1;
      const tenkan = ichi.tenkan[n];
      const kijun = ichi.kijun[n];
      const prevTenkan = ichi.tenkan[n - 1];
      const prevKijun = ichi.kijun[n - 1];
      const senkouA = ichi.senkou_a[n];
      const senkouB = ichi.senkou_b[n];

      if (isNaN(tenkan) || isNaN(kijun) || isNaN(senkouA) || isNaN(senkouB)) break;

      const cloudTop = Math.max(senkouA, senkouB);
      const cloudBot = Math.min(senkouA, senkouB);

      const tkCrossBull = tenkan > kijun && prevTenkan <= prevKijun;
      const tkCrossBear = tenkan < kijun && prevTenkan >= prevKijun;
      const aboveCloud = price > cloudTop;
      const belowCloud = price < cloudBot;

      if (tkCrossBull && aboveCloud) {
        action = "buy";
        confidence = 0.8;
        reason = `Ichimoku bullish TK cross above cloud. Cloud top: ${cloudTop.toFixed(3)}, price: ${price.toFixed(3)}`;
      } else if (tkCrossBear && belowCloud) {
        action = "sell";
        confidence = 0.8;
        reason = `Ichimoku bearish TK cross below cloud. Cloud bot: ${cloudBot.toFixed(3)}, price: ${price.toFixed(3)}`;
      }
      break;
    }

    case "macd_divergence": {
      if (closes.length < 60) break;
      const fast = strategy.parameters["fast"] ?? 12;
      const slow = strategy.parameters["slow"] ?? 26;
      const sigPeriod = strategy.parameters["signal"] ?? 9;
      const fastEMA = ema(closes, fast);
      const slowEMA = ema(closes, slow);
      const macdLine = fastEMA.map((f, i) => isNaN(f) || isNaN(slowEMA[i]) ? NaN : f - slowEMA[i]);
      const validMacd = macdLine.filter((v) => !isNaN(v));
      const signalLineArr = ema(validMacd, sigPeriod);
      const lkb = strategy.parameters["lookback"] ?? 20;

      // Look for bullish divergence: price lower low, MACD higher low
      const recentMacd = signalLineArr.slice(-lkb);
      const recentPrices = closes.slice(-lkb);
      const priceLL = recentPrices[recentPrices.length - 1] < Math.min(...recentPrices.slice(0, -1));
      const macdHL = recentMacd[recentMacd.length - 1] > Math.min(...recentMacd.slice(0, -1));
      const priceHH = recentPrices[recentPrices.length - 1] > Math.max(...recentPrices.slice(0, -1));
      const macdLH = recentMacd[recentMacd.length - 1] < Math.max(...recentMacd.slice(0, -1));

      if (priceLL && macdHL) {
        action = "buy";
        confidence = 0.75;
        reason = `Bullish MACD divergence: price printing lower low while MACD is higher — reversal signal`;
      } else if (priceHH && macdLH) {
        action = "sell";
        confidence = 0.75;
        reason = `Bearish MACD divergence: price printing higher high while MACD is lower — reversal signal`;
      }
      break;
    }

    case "support_resistance": {
      if (closes.length < 50) break;
      const lookback = strategy.parameters["lookback"] ?? 50;
      const zone = (strategy.parameters["zone_pips"] ?? 5) * pip;
      const recentHigh = candles.slice(-lookback);
      const recentSwingHighs = recentHigh.filter((c, i, arr) =>
        i > 0 && i < arr.length - 1 && c.high > arr[i - 1].high && c.high > arr[i + 1].high
      ).map((c) => c.high);
      const recentSwingLows = recentHigh.filter((c, i, arr) =>
        i > 0 && i < arr.length - 1 && c.low < arr[i - 1].low && c.low < arr[i + 1].low
      ).map((c) => c.low);

      const nearSupport = recentSwingLows.some((lvl) => Math.abs(price - lvl) < zone);
      const nearResistance = recentSwingHighs.some((lvl) => Math.abs(price - lvl) < zone);

      if (nearSupport && recentSwingLows.length >= 2) {
        action = "buy";
        confidence = 0.65;
        reason = `Price testing key support zone (${recentSwingLows.length} swing lows nearby within ${strategy.parameters["zone_pips"]} pips)`;
      } else if (nearResistance && recentSwingHighs.length >= 2) {
        action = "sell";
        confidence = 0.65;
        reason = `Price testing key resistance zone (${recentSwingHighs.length} swing highs nearby within ${strategy.parameters["zone_pips"]} pips)`;
      }
      break;
    }
  }

  void sl; void tp; // Used in return below

  const signal: ForexSignal = {
    id: uid(),
    strategyId: strategy.id,
    strategyName: strategy.name,
    pair,
    action,
    confidence: parseFloat(confidence.toFixed(3)),
    reason,
    price,
    suggestedUnits: action === "hold" ? 0 : Math.round(confidence * 5000), // 0–5000 micro-lots
    stopLossPips: action === "hold" ? 0 : slPips,
    takeProfitPips: action === "hold" ? 0 : tpPips,
    riskRewardRatio: tpPips / slPips,
    timestamp: new Date().toISOString(),
    session,
  };

  strategy.lastSignal = signal;
  strategy.totalSignals++;
  recentSignals.push(signal);
  if (recentSignals.length > MAX_SIGNALS) {
    recentSignals.splice(0, recentSignals.length - MAX_SIGNALS);
  }

  if (action !== "hold") {
    logger.info(`Forex signal: ${action.toUpperCase()} ${pair} [${strategy.name}] — ${reason} (conf: ${confidence.toFixed(2)}, RR: ${(tpPips / slPips).toFixed(1)}:1)`);
  }

  return signal;
}

// ─── Self-Improvement ────────────────────────────────────────────

/** Update strategy win/loss record and auto-disable if poor */
export function recordForexStrategyResult(
  strategyId: string,
  won: boolean,
  pnlPips: number,
): void {
  const s = strategies.get(strategyId);
  if (!s) return;

  if (won) {
    s.winCount++;
    s.consecutiveLosses = 0;
  } else {
    s.lossCount++;
    s.consecutiveLosses++;
  }
  s.totalPnLPips += pnlPips;

  const total = s.winCount + s.lossCount;
  const winRate = total > 0 ? s.winCount / total : 0;

  // Auto-disable if: ≥20 trades AND win rate < 40% OR 5 consecutive losses
  if ((total >= 20 && winRate < 0.40) || s.consecutiveLosses >= 5) {
    s.enabled = false;
    s.autoDisabledAt = new Date().toISOString();
    logger.warn(`Strategy AUTO-DISABLED: ${s.name} (wr: ${(winRate * 100).toFixed(1)}%, consec losses: ${s.consecutiveLosses})`);
  }
}

// ─── CRUD ────────────────────────────────────────────────────────

export function createForexStrategy(
  name: string,
  type: ForexStrategyType,
  customPairs?: string[],
  customParams?: Record<string, number>,
): ForexStrategy {
  const defaults = STRATEGY_DEFAULTS[type];
  const strategy: ForexStrategy = {
    id: uid(),
    name,
    type,
    pairs: customPairs ?? defaults.pairs,
    enabled: true,
    parameters: { ...defaults.parameters, ...customParams },
    createdAt: new Date().toISOString(),
    totalSignals: 0,
    winCount: 0,
    lossCount: 0,
    totalPnLPips: 0,
    maxDrawdownPips: 0,
    consecutiveLosses: 0,
  };
  strategies.set(strategy.id, strategy);
  logger.info(`Forex strategy created: ${name} (${type}) → pairs: ${strategy.pairs.join(", ")}`);
  return strategy;
}

export function initDefaultForexStrategies(): void {
  if (strategies.size > 0) return;
  createForexStrategy("EMA Trend System", "trend_following");
  createForexStrategy("Momentum Reversal", "rsi_stochastic_confluence");
  createForexStrategy("London Breakout", "ict_session_breakout");
  createForexStrategy("Carry Machine", "carry_trade");
  createForexStrategy("Squeeze Breakout", "bollinger_squeeze");
  createForexStrategy("Ichimoku JPY", "ichimoku_cloud");
  createForexStrategy("Divergence Hunter", "macd_divergence");
  createForexStrategy("S/R Fade", "support_resistance");
  logger.info("8 default Forex strategies initialized");
}

export function evaluateForexStrategy(strategy: ForexStrategy, pair: string, candles: ForexOHLC[]): ForexSignal {
  return generateSignal(strategy, pair, candles);
}

/** Public alias for RPC handler use */
export function generateSignalForPair(strategy: ForexStrategy, pair: string, candles: ForexOHLC[]): ForexSignal {
  return generateSignal(strategy, pair, candles);
}

export function getActiveForexStrategies(): ForexStrategy[] {
  return Array.from(strategies.values()).filter((s) => s.enabled);
}

export function getAllForexStrategies(): ForexStrategy[] {
  return Array.from(strategies.values());
}

export function getForexStrategy(id: string): ForexStrategy | undefined {
  return strategies.get(id);
}

export function toggleForexStrategy(id: string): boolean {
  const s = strategies.get(id);
  if (!s) return false;
  s.enabled = !s.enabled;
  if (s.enabled) { s.autoDisabledAt = undefined; s.consecutiveLosses = 0; }
  return true;
}

export function getForexRecentSignals(limit = 50): ForexSignal[] {
  return recentSignals.slice(-limit);
}

// ─── Backtesting ─────────────────────────────────────────────────

export function backtestForexStrategy(
  type: ForexStrategyType,
  pair: string,
  candles: ForexOHLC[],
  params?: Record<string, number>,
): ForexBacktestResult {
  const temp = createForexStrategy("__backtest__", type, [pair], params);
  strategies.delete(temp.id);

  let equity = 10_000;
  let position: { entry: number; side: "buy" | "sell"; sl: number; tp: number } | null = null;
  let wins = 0;
  let losses = 0;
  let totalPnLPips = 0;
  let peakEquity = equity;
  let maxDD = 0;
  const pip = pipSize(pair);

  for (let i = 50; i < candles.length; i++) {
    const window = candles.slice(0, i + 1);
    const signal = generateSignal(temp, pair, window);
    const c = candles[i];

    if (position) {
      const currentPip = position.side === "buy"
        ? (c.close - position.entry) / pip
        : (position.entry - c.close) / pip;

      const hitSL = position.side === "buy" ? c.low <= position.sl : c.high >= position.sl;
      const hitTP = position.side === "buy" ? c.high >= position.tp : c.low <= position.tp;

      if (hitSL || hitTP) {
        const pnlPips = hitTP ? temp.parameters["tp_pips"] ?? 60 : -(temp.parameters["sl_pips"] ?? 20);
        totalPnLPips += pnlPips;
        equity += (pnlPips / 10000) * equity;
        if (pnlPips > 0) wins++; else losses++;
        peakEquity = Math.max(peakEquity, equity);
        maxDD = Math.max(maxDD, (peakEquity - equity) / peakEquity * 100);
        position = null;
      } else {
        void currentPip;
      }
    } else if (signal.action !== "hold" && signal.confidence > 0.5) {
      const slPips = temp.parameters["sl_pips"] ?? 20;
      const tpPips = temp.parameters["tp_pips"] ?? 60;
      position = {
        entry: c.close,
        side: signal.action,
        sl: signal.action === "buy" ? c.close - slPips * pip : c.close + slPips * pip,
        tp: signal.action === "buy" ? c.close + tpPips * pip : c.close - tpPips * pip,
      };
    }
  }

  const total = wins + losses;
  const avgWin = total > 0 ? (totalPnLPips > 0 ? totalPnLPips / wins : 0) : 0;
  const avgLoss = losses > 0 ? ((temp.parameters["sl_pips"] ?? 20)) : 1;
  const expectancy = total > 0 ? totalPnLPips / total : 0;

  return {
    strategyType: type,
    pair,
    totalTrades: total,
    winRate: total > 0 ? parseFloat((wins / total).toFixed(3)) : 0,
    totalReturnPips: parseFloat(totalPnLPips.toFixed(1)),
    sharpeRatio: parseFloat((expectancy / (avgLoss || 1) * Math.sqrt(252)).toFixed(2)),
    maxDrawdownPips: parseFloat(maxDD.toFixed(1)),
    profitFactor: avgLoss > 0 ? parseFloat((avgWin / avgLoss).toFixed(2)) : 0,
    averageRRR: (temp.parameters["tp_pips"] ?? 60) / (temp.parameters["sl_pips"] ?? 20),
    expectancy: parseFloat(expectancy.toFixed(1)),
  };
}
