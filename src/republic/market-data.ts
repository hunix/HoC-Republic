/**
 * Republic Platform — Live Market Data
 *
 * Fetches real-time cryptocurrency prices from CoinGecko (free, no API key).
 * Provides cached price lookup, OHLC candle data for strategy analysis,
 * and a tick function that refreshes prices periodically.
 *
 * Falls back to simulated drift if no internet connection is available.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { randFloat } from "./utils.js";

const logger = createSubsystemLogger("republic:market-data");

// ─── Types ──────────────────────────────────────────────────────

export interface PriceData {
  symbol: string;
  priceUSD: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  lastUpdated: string;
}

export interface OHLC {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MarketDataDiagnostics {
  trackedSymbols: string[];
  lastFetchAt: string | null;
  fetchCount: number;
  errorCount: number;
  usingLiveData: boolean;
  cacheTTLSeconds: number;
}

// ─── Configuration ──────────────────────────────────────────────

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";
const PRICE_CACHE_TTL_MS = 30_000; // 30 seconds
const OHLC_CACHE_TTL_MS = 300_000; // 5 minutes
const FETCH_TIMEOUT_MS = 8_000;

// CoinGecko ID mapping
const SYMBOL_TO_CG_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
  DOT: "polkadot",
  AVAX: "avalanche-2",
  MATIC: "matic-network",
  LINK: "chainlink",
  UNI: "uniswap",
  ATOM: "cosmos",
  LTC: "litecoin",
};

// ─── State ──────────────────────────────────────────────────────

const priceCache = new Map<string, { data: PriceData; fetchedAt: number }>();
const ohlcCache = new Map<string, { data: OHLC[]; fetchedAt: number }>();
let lastFetchAt: string | null = null;
let fetchCount = 0;
let errorCount = 0;
let usingLiveData = false;

// Simulated fallback prices
const SIMULATED_PRICES: Record<string, number> = {
  BTC: 68000,
  ETH: 3800,
  SOL: 145,
  BNB: 580,
  XRP: 0.62,
  ADA: 0.45,
  DOGE: 0.08,
  DOT: 7.2,
  AVAX: 35,
  MATIC: 0.85,
  LINK: 15,
  UNI: 7.5,
  ATOM: 9.2,
  LTC: 72,
};

// ─── HTTP Helper ────────────────────────────────────────────────

async function fetchJSON<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Price Fetching ─────────────────────────────────────────────

/**
 * Fetch current prices for all tracked symbols from CoinGecko.
 * Updates the internal cache.
 */
export async function fetchPrices(symbols?: string[]): Promise<PriceData[]> {
  const targetSymbols = symbols ?? Object.keys(SYMBOL_TO_CG_ID);
  const cgIds = targetSymbols
    .map((s) => SYMBOL_TO_CG_ID[s.toUpperCase()])
    .filter(Boolean);

  if (cgIds.length === 0) {return [];}

  try {
    const url = `${COINGECKO_BASE}/simple/price?ids=${cgIds.join(",")}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`;
    const data = await fetchJSON<Record<string, {
      usd?: number;
      usd_24h_change?: number;
      usd_24h_vol?: number;
      usd_market_cap?: number;
    }>>(url);

    const now = Date.now();
    const results: PriceData[] = [];

    for (const symbol of targetSymbols) {
      const cgId = SYMBOL_TO_CG_ID[symbol.toUpperCase()];
      if (!cgId || !data[cgId]) {continue;}

      const entry = data[cgId];
      const priceData: PriceData = {
        symbol: symbol.toUpperCase(),
        priceUSD: entry.usd ?? 0,
        change24h: entry.usd_24h_change ?? 0,
        volume24h: entry.usd_24h_vol ?? 0,
        marketCap: entry.usd_market_cap ?? 0,
        lastUpdated: new Date().toISOString(),
      };

      priceCache.set(symbol.toUpperCase(), { data: priceData, fetchedAt: now });
      results.push(priceData);
    }

    lastFetchAt = new Date().toISOString();
    fetchCount++;
    usingLiveData = true;
    logger.info(`Fetched live prices for ${results.length} symbols`);
    return results;
  } catch (err) {
    errorCount++;
    logger.warn("Failed to fetch live prices, using simulated fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
    usingLiveData = false;
    return simulatePrices(targetSymbols);
  }
}

/**
 * Get cached price for a symbol. Returns simulated if no cache.
 */
export function getPrice(symbol: string): PriceData | null {
  const upper = symbol.toUpperCase();
  const cached = priceCache.get(upper);
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
    return cached.data;
  }

  // Return stale cache if available
  if (cached) {return cached.data;}

  // Generate simulated data
  const base = SIMULATED_PRICES[upper];
  if (!base) {return null;}

  const drift = base * randFloat(-0.02, 0.02);
  return {
    symbol: upper,
    priceUSD: base + drift,
    change24h: randFloat(-5, 5),
    volume24h: base * randFloat(1e6, 5e6),
    marketCap: base * randFloat(1e9, 5e9),
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get all cached prices.
 */
export function getAllPrices(): PriceData[] {
  const results: PriceData[] = [];
  for (const symbol of Object.keys(SYMBOL_TO_CG_ID)) {
    const p = getPrice(symbol);
    if (p) {results.push(p);}
  }
  return results;
}

/**
 * Fetch OHLC candle data for technical analysis.
 */
export async function fetchOHLC(symbol: string, days = 30): Promise<OHLC[]> {
  const upper = symbol.toUpperCase();
  const cacheKey = `${upper}-${days}`;

  // Check cache
  const cached = ohlcCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < OHLC_CACHE_TTL_MS) {
    return cached.data;
  }

  const cgId = SYMBOL_TO_CG_ID[upper];
  if (!cgId) {return generateSimulatedOHLC(upper, days);}

  try {
    const url = `${COINGECKO_BASE}/coins/${cgId}/ohlc?vs_currency=usd&days=${days}`;
    const data = await fetchJSON<number[][]>(url);

    const candles: OHLC[] = data.map(([ts, open, high, low, close]) => ({
      timestamp: ts,
      open,
      high,
      low,
      close,
    }));

    ohlcCache.set(cacheKey, { data: candles, fetchedAt: Date.now() });
    return candles;
  } catch (err) {
    logger.warn(`Failed to fetch OHLC for ${symbol}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return generateSimulatedOHLC(upper, days);
  }
}

/**
 * Get recent close prices for a symbol (for indicator calculation).
 */
export function getClosePrices(candles: OHLC[]): number[] {
  return candles.map((c) => c.close);
}

// ─── Tick Function ──────────────────────────────────────────────

const REFRESH_INTERVAL_TICKS = 10; // Refresh every 10 ticks

/**
 * Market data tick — refreshes prices periodically.
 * Register this in the simulation tick loop.
 */
export function marketDataTick(currentTick: number): void {
  if (currentTick % REFRESH_INTERVAL_TICKS !== 0) {return;}

  // Fire-and-forget — don't block the tick loop
  fetchPrices().catch((err) => {
    logger.warn("Market data tick fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

// ─── Helpers ────────────────────────────────────────────────────

function simulatePrices(symbols: string[]): PriceData[] {
  const now = Date.now();
  return symbols.map((symbol) => {
    const upper = symbol.toUpperCase();
    const base = SIMULATED_PRICES[upper] ?? 100;
    const drift = base * randFloat(-0.02, 0.02);
    const data: PriceData = {
      symbol: upper,
      priceUSD: base + drift,
      change24h: randFloat(-5, 5),
      volume24h: base * randFloat(1e6, 5e6),
      marketCap: base * randFloat(1e9, 5e9),
      lastUpdated: new Date().toISOString(),
    };
    priceCache.set(upper, { data, fetchedAt: now });
    return data;
  });
}

function generateSimulatedOHLC(symbol: string, days: number): OHLC[] {
  const base = SIMULATED_PRICES[symbol] ?? 100;
  const candles: OHLC[] = [];
  let price = base;

  for (let i = days; i > 0; i--) {
    const open = price;
    const change = price * randFloat(-0.05, 0.05);
    const close = price + change;
    const high = Math.max(open, close) * (1 + randFloat(0, 0.02));
    const low = Math.min(open, close) * (1 - randFloat(0, 0.02));

    candles.push({
      timestamp: Date.now() - i * 86400000,
      open,
      high,
      low,
      close,
    });
    price = close;
  }

  return candles;
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getMarketDataDiagnostics(): MarketDataDiagnostics {
  return {
    trackedSymbols: Object.keys(SYMBOL_TO_CG_ID),
    lastFetchAt,
    fetchCount,
    errorCount,
    usingLiveData,
    cacheTTLSeconds: PRICE_CACHE_TTL_MS / 1000,
  };
}
