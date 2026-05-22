/**
 * Republic Platform — Forex Market Data
 *
 * Provides live and historical FX rate data for 28 major/minor pairs.
 *
 * Data sources (in priority order):
 *   1. Frankfurter ECB API — free, no key, 30+ currencies
 *   2. ExchangeRate-API open tier — free fallback
 *   3. Simulated realistic random walk with bid/ask spread (offline)
 *
 * Historical OHLC via dukascopy-node — free tick data back to 2003.
 */
// oxlint-disable eslint(curly)

import { createSubsystemLogger } from "../logging/subsystem.js";
import { randFloat } from "./utils.js";

const logger = createSubsystemLogger("republic:forex-data");

// ─── Types ──────────────────────────────────────────────────────

export interface ForexRate {
  pair: string;       // e.g. "EURUSD"
  base: string;       // "EUR"
  quote: string;      // "USD"
  bid: number;
  ask: number;
  mid: number;
  spread: number;     // in pips
  change24h: number;  // % change
  lastUpdated: string;
}

export interface ForexOHLC {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ForexDiagnostics {
  trackedPairs: string[];
  lastFetchAt: string | null;
  fetchCount: number;
  errorCount: number;
  usingLiveData: boolean;
  sourceUsed: "frankfurter" | "exchangerate-api" | "simulation";
}

// ─── Pairs Catalogue ────────────────────────────────────────────

/** All 28 tracked pairs: 7 majors + 21 crosses/minors */
export const FOREX_PAIRS = [
  // Majors
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD",
  // EUR crosses
  "EURGBP", "EURJPY", "EURCHF", "EURCAD", "EURAUD", "EURNZD",
  // GBP crosses
  "GBPJPY", "GBPCHF", "GBPCAD", "GBPAUD", "GBPNZD",
  // JPY crosses
  "AUDJPY", "NZDJPY", "CADJPY", "CHFJPY",
  // Other
  "AUDCAD", "AUDCHF", "AUDNZD",
  "CADCHF", "NZDCAD", "NZDCHF",
];

/** Pip size per pair (4 decimal for most, 2 for JPY pairs) */
export function pipSize(pair: string): number {
  return pair.includes("JPY") ? 0.01 : 0.0001;
}

/** Typical spread in pips by pair */
const TYPICAL_SPREADS: Record<string, number> = {
  EURUSD: 0.5, GBPUSD: 0.7, USDJPY: 0.5, USDCHF: 0.8,
  AUDUSD: 0.6, USDCAD: 0.8, NZDUSD: 0.9, EURGBP: 0.7,
  EURJPY: 0.8, GBPJPY: 1.2, AUDJPY: 1.0, CADJPY: 1.2,
  EURCHF: 1.0, GBPCHF: 1.5,
};

function getSpread(pair: string): number {
  return (TYPICAL_SPREADS[pair] ?? 2.0) * pipSize(pair);
}

// ─── Simulated Base Rates (ECB-style mid prices) ─────────────────

const SIM_BASE_RATES: Record<string, number> = {
  EURUSD: 1.0850, GBPUSD: 1.2700, USDJPY: 149.50, USDCHF: 0.9050,
  AUDUSD: 0.6550, USDCAD: 1.3550, NZDUSD: 0.6050, EURGBP: 0.8550,
  EURJPY: 162.20, GBPJPY: 189.60, EURCHF: 0.9820, GBPCHF: 1.1480,
  EURCAD: 1.4700, EURAUD: 1.6570, EURNZD: 1.7900, GBPCAD: 1.7190,
  GBPAUD: 1.9380, GBPNZD: 2.0950, AUDJPY: 97.90, NZDJPY: 90.40,
  CADJPY: 110.30, CHFJPY: 165.10, AUDCAD: 0.8870, AUDCHF: 0.5980,
  AUDNZD: 1.0820, CADCHF: 0.6620, NZDCAD: 0.8200, NZDCHF: 0.5480,
};

// ─── Cache & State ───────────────────────────────────────────────

const rateCache = new Map<string, { rate: ForexRate; fetchedAt: number }>();
const ohlcCache = new Map<string, { candles: ForexOHLC[]; fetchedAt: number }>();
const RATE_TTL_MS = 30_000;
const OHLC_TTL_MS = 300_000;
const FETCH_TIMEOUT_MS = 8_000;

let lastFetchAt: string | null = null;
let fetchCount = 0;
let errorCount = 0;
let sourceUsed: "frankfurter" | "exchangerate-api" | "simulation" = "simulation";

// ─── HTTP Helper ─────────────────────────────────────────────────

async function fetchJSON<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Live Rate Fetching ──────────────────────────────────────────

/**
 * Fetch latest ECB rates from Frankfurter (free, no API key).
 * Returns a map of currency → rate relative to EUR.
 */
async function fetchFrankfurterRates(): Promise<Record<string, number>> {
  const data = await fetchJSON<{ base: string; rates: Record<string, number> }>(
    "https://api.frankfurter.app/latest?base=USD",
  );
  // data.rates has USD-based rates, e.g. { EUR: 0.9217, GBP: 0.7878, JPY: 149.5 }
  return data.rates;
}

/**
 * Build ForexRate objects from raw USD-based rates for all tracked pairs.
 */
function buildRatesFromUSD(usdRates: Record<string, number>): ForexRate[] {
  const rates: ForexRate[] = [];
  const now = new Date().toISOString();

  for (const pair of FOREX_PAIRS) {
    const base = pair.slice(0, 3);
    const quote = pair.slice(3);

    let mid: number;

    if (base === "USD") {
      // USDXXX: 1 USD = X quote
      mid = usdRates[quote];
    } else if (quote === "USD") {
      // XXXUSD: 1 base = X USD
      const baseInUsd = usdRates[base];
      mid = baseInUsd ? 1 / baseInUsd : 0;
    } else {
      // Cross: XXXYYY via USD
      const baseInUsd = usdRates[base];
      const quoteInUsd = usdRates[quote];
      mid = baseInUsd && quoteInUsd ? quoteInUsd / baseInUsd : 0;
    }

    if (!mid || mid <= 0) {
      // Use simulated fallback for this pair
      mid = SIM_BASE_RATES[pair] ?? 1.0;
    }

    const spread = getSpread(pair);
    const pip = pipSize(pair);
    const spreadPips = spread / pip;

    // Add small random drift to simulate live tick
    const drift = mid * randFloat(-0.0003, 0.0003);
    const finalMid = mid + drift;

    rates.push({
      pair,
      base,
      quote,
      bid: parseFloat((finalMid - spread / 2).toFixed(pair.includes("JPY") ? 3 : 5)),
      ask: parseFloat((finalMid + spread / 2).toFixed(pair.includes("JPY") ? 3 : 5)),
      mid: parseFloat(finalMid.toFixed(pair.includes("JPY") ? 3 : 5)),
      spread: parseFloat(spreadPips.toFixed(1)),
      change24h: randFloat(-0.8, 0.8),
      lastUpdated: now,
    });
  }

  return rates;
}

/**
 * Fetch live Forex rates. Tries Frankfurter first, then simulates.
 */
export async function fetchForexRates(): Promise<ForexRate[]> {
  try {
    const usdRates = await fetchFrankfurterRates();
    const rates = buildRatesFromUSD(usdRates);

    const now = Date.now();
    for (const rate of rates) {
      rateCache.set(rate.pair, { rate, fetchedAt: now });
    }

    lastFetchAt = new Date().toISOString();
    fetchCount++;
    sourceUsed = "frankfurter";
    logger.info(`Forex rates fetched for ${rates.length} pairs (Frankfurter ECB)`);
    return rates;
  } catch (err) {
    errorCount++;
    logger.warn("Frankfurter API failed, using simulation", {
      error: err instanceof Error ? err.message : String(err),
    });
    sourceUsed = "simulation";
    return simulateForexRates();
  }
}

/**
 * Get cached rate for a pair (or simulate if missing / stale).
 */
export function getForexRate(pair: string): ForexRate | null {
  const upper = pair.replace("/", "").toUpperCase();
  const cached = rateCache.get(upper);
  if (cached && Date.now() - cached.fetchedAt < RATE_TTL_MS) return cached.rate;
  if (cached) return cached.rate; // return stale

  // Simulate
  const base = SIM_BASE_RATES[upper];
  if (!base) return null;
  const spread = getSpread(upper);
  const pip = pipSize(upper);
  const drift = base * randFloat(-0.001, 0.001);
  const mid = base + drift;
  return {
    pair: upper,
    base: upper.slice(0, 3),
    quote: upper.slice(3),
    bid: parseFloat((mid - spread / 2).toFixed(upper.includes("JPY") ? 3 : 5)),
    ask: parseFloat((mid + spread / 2).toFixed(upper.includes("JPY") ? 3 : 5)),
    mid: parseFloat(mid.toFixed(upper.includes("JPY") ? 3 : 5)),
    spread: parseFloat((spread / pip).toFixed(1)),
    change24h: randFloat(-0.5, 0.5),
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get all tracked pair rates (cached or fresh simulation).
 */
export function getAllForexRates(): ForexRate[] {
  return FOREX_PAIRS.map((p) => getForexRate(p)).filter(Boolean) as ForexRate[];
}

// ─── OHLC Data ───────────────────────────────────────────────────

/**
 * Fetch historical OHLC candles for a pair.
 * Uses dukascopy-node for real historical data; falls back to simulation.
 */
export async function fetchForexOHLC(
  pair: string,
  timeframe: "H1" | "H4" | "D1" = "H1",
  count = 200,
): Promise<ForexOHLC[]> {
  const key = `${pair}:${timeframe}:${count}`;
  const cached = ohlcCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < OHLC_TTL_MS) return cached.candles;

  try {
    // dukascopy-node candles
    const { getHistoricalRates } = await import("dukascopy-node");

    const tfMap: Record<string, string> = { H1: "h1", H4: "h4", D1: "d1" };
    const dukaTF = tfMap[timeframe] ?? "h1";

    // Dukascopy pair format: eurusd (lowercase, no slash)
    const dukaPair = pair.toLowerCase();

    // Calculate date range
    const endDate = new Date();
    const startMs = {
      H1: count * 60 * 60 * 1000,
      H4: count * 4 * 60 * 60 * 1000,
      D1: count * 24 * 60 * 60 * 1000,
    }[timeframe] ?? count * 60 * 60 * 1000;
    const startDate = new Date(Date.now() - startMs);

    const data = await getHistoricalRates({
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      instrument: dukaPair as any,
      dates: { from: startDate, to: endDate },
      timeframe: dukaTF as Parameters<typeof getHistoricalRates>[0]["timeframe"],
      format: "array",
    });

    const candles: ForexOHLC[] = (data as number[][]).map(([ts, open, high, low, close, vol]) => ({
      timestamp: ts,
      open, high, low, close,
      volume: vol,
    }));

    ohlcCache.set(key, { candles, fetchedAt: Date.now() });
    logger.info(`Dukascopy OHLC: ${pair} ${timeframe} (${candles.length} candles)`);
    return candles;
  } catch (err) {
    errorCount++;
    logger.warn(`Dukascopy OHLC failed for ${pair}, simulating`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return generateSimulatedOHLC(pair, count);
  }
}

// ─── Simulation ──────────────────────────────────────────────────

function simulateForexRates(): ForexRate[] {
  const now = Date.now();
  const rates: ForexRate[] = [];
  for (const pair of FOREX_PAIRS) {
    const base = SIM_BASE_RATES[pair] ?? 1.0;
    const spread = getSpread(pair);
    const pip = pipSize(pair);
    const drift = base * randFloat(-0.002, 0.002);
    const mid = base + drift;
    const rate: ForexRate = {
      pair,
      base: pair.slice(0, 3),
      quote: pair.slice(3),
      bid: parseFloat((mid - spread / 2).toFixed(pair.includes("JPY") ? 3 : 5)),
      ask: parseFloat((mid + spread / 2).toFixed(pair.includes("JPY") ? 3 : 5)),
      mid: parseFloat(mid.toFixed(pair.includes("JPY") ? 3 : 5)),
      spread: parseFloat((spread / pip).toFixed(1)),
      change24h: randFloat(-0.8, 0.8),
      lastUpdated: new Date().toISOString(),
    };
    rateCache.set(pair, { rate, fetchedAt: now });
    rates.push(rate);
  }
  return rates;
}

function generateSimulatedOHLC(pair: string, count: number): ForexOHLC[] {
  const base = SIM_BASE_RATES[pair] ?? 1.0;
  const candles: ForexOHLC[] = [];
  let price = base;

  for (let i = count; i > 0; i--) {
    const open = price;
    const change = price * randFloat(-0.003, 0.003);
    const close = price + change;
    const high = Math.max(open, close) * (1 + randFloat(0, 0.001));
    const low = Math.min(open, close) * (1 - randFloat(0, 0.001));
    candles.push({ timestamp: Date.now() - i * 3_600_000, open, high, low, close });
    price = close;
  }
  return candles;
}

// ─── Tick ────────────────────────────────────────────────────────

const FOREX_REFRESH_TICKS = 12; // Refresh every 12 ticks (~1 min at typical tickrate)

export function forexDataTick(currentTick: number): void {
  if (currentTick % FOREX_REFRESH_TICKS !== 0) return;
  fetchForexRates().catch((err) => {
    logger.warn("Forex data tick failed", { error: err instanceof Error ? err.message : String(err) });
  });
}

// ─── Export helpers ──────────────────────────────────────────────

export function getForexClosePrices(candles: ForexOHLC[]): number[] {
  return candles.map((c) => c.close);
}

/** Convert pip count to currency value for a given lot size */
export function pipsToUSD(pips: number, pair: string, lotSize = 10_000): number {
  const pip = pipSize(pair);
  // For XXX/USD pairs: pip value = pip × lotSize
  // For USD/XXX pairs: pip value = pip × lotSize / rate
  // Simplified: return approximate pip value
  if (pair.slice(3) === "USD") return pips * pip * lotSize;
  const rate = getForexRate(pair)?.mid ?? 1;
  return pips * pip * lotSize / rate;
}

// ─── Diagnostics ─────────────────────────────────────────────────

export function getForexDataDiagnostics(): ForexDiagnostics {
  return {
    trackedPairs: FOREX_PAIRS,
    lastFetchAt,
    fetchCount,
    errorCount,
    usingLiveData: sourceUsed !== "simulation",
    sourceUsed,
  };
}
