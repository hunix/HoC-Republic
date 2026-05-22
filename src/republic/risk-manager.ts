/**
 * Republic Platform — Risk Manager
 *
 * Enforces risk limits before any trade executes.
 * Provides position sizing, drawdown protection, daily loss limits,
 * diversification rules, and circuit breakers.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import type { ExchangeBalance, ExchangeOrder } from "./exchange-connector.js";
import { getConfig } from "./republic-config.js";
import { ts } from "./utils.js";

const logger = createSubsystemLogger("republic:risk-manager");

// ─── Types ──────────────────────────────────────────────────────

export type RiskDecision = "approve" | "reject" | "modify";

export interface RiskCheck {
  decision: RiskDecision;
  reason: string;
  originalQuantity: number;
  adjustedQuantity: number;
  riskScore: number; // 0-100, higher = riskier
  violations: string[];
}

export interface RiskLimits {
  maxPositionPct: number;     // Max % of portfolio in one asset (default 20%)
  maxDailyLossPct: number;    // Max daily loss % before circuit breaker (default 5%)
  maxDrawdownPct: number;     // Max total drawdown % before halt (default 15%)
  maxOrderSizeUSD: number;    // Max single order in USD (default 5000)
  minOrderSizeUSD: number;    // Min order size in USD (default 10)
  maxOpenPositions: number;   // Max concurrent positions (default 10)
  maxDailyTrades: number;     // Max trades per day (default 50)
  cooldownMinutes: number;    // Min time between trades on same symbol (default 5)
}

export interface PortfolioRisk {
  totalValueUSD: number;
  positions: Array<{ symbol: string; valueUSD: number; pct: number }>;
  dailyPnL: number;
  dailyPnLPct: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  circuitBroken: boolean;
  openPositions: number;
  tradesToday: number;
}

export interface RiskDiagnostics {
  limits: RiskLimits;
  circuitBroken: boolean;
  dailyPnL: number;
  tradesToday: number;
  blockedTrades: number;
  totalChecks: number;
}

// ─── Default Limits ─────────────────────────────────────────────

const DEFAULT_LIMITS: RiskLimits = {
  maxPositionPct: 0.20,
  maxDailyLossPct: 0.05,
  maxDrawdownPct: 0.15,
  maxOrderSizeUSD: 5000,
  minOrderSizeUSD: 10,
  maxOpenPositions: 10,
  maxDailyTrades: 50,
  cooldownMinutes: 5,
};

// ─── State ──────────────────────────────────────────────────────

let circuitBroken = false;
let circuitBrokenAt: string | null = null;
let dailyPnL = 0;
let dailyPnLStartValue = 0;
let lastDayReset = new Date().toDateString();
let tradesToday = 0;
let blockedTrades = 0;
let totalChecks = 0;
let currentDrawdown = 0;
let peakPortfolioValue = 0;

// Track last trade time per symbol for cooldown
const lastTradeTime = new Map<string, number>();

// ─── Core Risk Check ────────────────────────────────────────────

/**
 * Check whether a proposed trade passes all risk rules.
 * Returns approve/reject/modify decision with details.
 */
export function checkRisk(
  side: "buy" | "sell",
  symbol: string,
  quantity: number,
  priceUSD: number,
  balances: ExchangeBalance[],
  _openOrders?: ExchangeOrder[],
): RiskCheck {
  totalChecks++;

  const config = getConfig();
  const limits: RiskLimits = { ...DEFAULT_LIMITS, ...config.trading?.riskLimits };

  const violations: string[] = [];
  let adjustedQuantity = quantity;
  const orderValueUSD = quantity * priceUSD;
  const totalPortfolio = balances.reduce((sum, b) => sum + b.valueUSD, 0);
  let riskScore = 0;

  // Reset daily counters if new day
  const today = new Date().toDateString();
  if (today !== lastDayReset) {
    lastDayReset = today;
    dailyPnL = 0;
    tradesToday = 0;
    dailyPnLStartValue = totalPortfolio;
  }

  // 1. Circuit breaker check
  if (circuitBroken) {
    violations.push("Circuit breaker active — all trading halted");
    riskScore = 100;
    blockedTrades++;
    return {
      decision: "reject",
      reason: `Circuit breaker triggered at ${circuitBrokenAt}. Reset manually.`,
      originalQuantity: quantity,
      adjustedQuantity: 0,
      riskScore,
      violations,
    };
  }

  // 2. Min/max order size
  if (orderValueUSD < limits.minOrderSizeUSD) {
    violations.push(`Order too small: $${orderValueUSD.toFixed(2)} < $${limits.minOrderSizeUSD}`);
    riskScore += 10;
  }

  if (orderValueUSD > limits.maxOrderSizeUSD) {
    // Modify: reduce to max allowed
    adjustedQuantity = limits.maxOrderSizeUSD / priceUSD;
    violations.push(
      `Order capped: $${orderValueUSD.toFixed(2)} > max $${limits.maxOrderSizeUSD} — reduced to ${adjustedQuantity.toFixed(6)}`,
    );
    riskScore += 20;
  }

  // 3. Position concentration check (buy only)
  if (side === "buy" && totalPortfolio > 0) {
    const existingPosition = balances.find((b) => b.asset === symbol);
    const existingValueUSD = existingPosition?.valueUSD ?? 0;
    const newPositionValueUSD = existingValueUSD + adjustedQuantity * priceUSD;
    const positionPct = newPositionValueUSD / totalPortfolio;

    if (positionPct > limits.maxPositionPct) {
      const maxAllowedUSD = limits.maxPositionPct * totalPortfolio - existingValueUSD;
      if (maxAllowedUSD <= 0) {
        violations.push(
          `Position limit: ${symbol} already at ${((existingValueUSD / totalPortfolio) * 100).toFixed(1)}% (max ${limits.maxPositionPct * 100}%)`,
        );
        riskScore += 40;
      } else {
        adjustedQuantity = maxAllowedUSD / priceUSD;
        violations.push(
          `Position capped: ${symbol} would be ${(positionPct * 100).toFixed(1)}% — reduced to ${(limits.maxPositionPct * 100).toFixed(0)}%`,
        );
        riskScore += 20;
      }
    }
  }

  // 4. Daily loss check
  if (dailyPnLStartValue > 0) {
    const dailyLossPct = Math.abs(Math.min(0, dailyPnL)) / dailyPnLStartValue;
    if (dailyLossPct >= limits.maxDailyLossPct) {
      violations.push(
        `Daily loss limit hit: ${(dailyLossPct * 100).toFixed(2)}% loss today (max ${limits.maxDailyLossPct * 100}%)`,
      );
      triggerCircuitBreaker("Daily loss limit exceeded");
      riskScore += 50;
    }
  }

  // 5. Max drawdown check
  if (peakPortfolioValue > 0 && totalPortfolio < peakPortfolioValue) {
    currentDrawdown = (peakPortfolioValue - totalPortfolio) / peakPortfolioValue;
    if (currentDrawdown >= limits.maxDrawdownPct) {
      violations.push(
        `Max drawdown hit: ${(currentDrawdown * 100).toFixed(2)}% (max ${limits.maxDrawdownPct * 100}%)`,
      );
      triggerCircuitBreaker("Max drawdown exceeded");
      riskScore += 50;
    }
  } else if (totalPortfolio > peakPortfolioValue) {
    peakPortfolioValue = totalPortfolio;
    currentDrawdown = 0;
  }

  // 6. Daily trade count
  if (tradesToday >= limits.maxDailyTrades) {
    violations.push(`Daily trade limit: ${tradesToday}/${limits.maxDailyTrades}`);
    riskScore += 30;
  }

  // 7. Cooldown check
  const lastTrade = lastTradeTime.get(symbol);
  if (lastTrade) {
    const minutesSinceLastTrade = (Date.now() - lastTrade) / 60000;
    if (minutesSinceLastTrade < limits.cooldownMinutes) {
      violations.push(
        `Cooldown: ${symbol} traded ${minutesSinceLastTrade.toFixed(1)}min ago (min ${limits.cooldownMinutes}min)`,
      );
      riskScore += 15;
    }
  }

  // 8. Open positions check
  const activePositions = balances.filter((b) => b.asset !== "USD" && b.asset !== "USDT" && b.total > 0).length;
  if (side === "buy" && activePositions >= limits.maxOpenPositions) {
    violations.push(`Max open positions: ${activePositions}/${limits.maxOpenPositions}`);
    riskScore += 25;
  }

  // Determine final decision
  riskScore = Math.min(100, riskScore);

  let decision: RiskDecision;
  if (circuitBroken || riskScore >= 80) {
    decision = "reject";
    blockedTrades++;
  } else if (adjustedQuantity !== quantity || riskScore >= 30) {
    decision = "modify";
  } else {
    decision = "approve";
  }

  const check: RiskCheck = {
    decision,
    reason:
      violations.length > 0
        ? violations.join("; ")
        : "All risk checks passed",
    originalQuantity: quantity,
    adjustedQuantity: decision === "reject" ? 0 : adjustedQuantity,
    riskScore,
    violations,
  };

  if (decision !== "approve") {
    logger.warn(`Risk ${decision}: ${side} ${quantity} ${symbol} — ${check.reason}`);
  }

  return check;
}

// ─── Trade Recording ────────────────────────────────────────────

/**
 * Record a completed trade for risk tracking.
 * Call this after a trade is executed.
 */
export function recordTrade(
  symbol: string,
  side: "buy" | "sell",
  pnlUSD: number,
): void {
  tradesToday++;
  dailyPnL += pnlUSD;
  lastTradeTime.set(symbol, Date.now());
}

/**
 * Update the portfolio peak value for drawdown tracking.
 */
export function updatePortfolioValue(currentValueUSD: number): void {
  if (currentValueUSD > peakPortfolioValue) {
    peakPortfolioValue = currentValueUSD;
    currentDrawdown = 0;
  } else if (peakPortfolioValue > 0) {
    currentDrawdown = (peakPortfolioValue - currentValueUSD) / peakPortfolioValue;
  }
}

// ─── Circuit Breaker ────────────────────────────────────────────

function triggerCircuitBreaker(reason: string): void {
  if (circuitBroken) {return;}
  circuitBroken = true;
  circuitBrokenAt = ts();
  logger.warn(`🚨 CIRCUIT BREAKER TRIGGERED: ${reason}`);
}

/**
 * Manually reset the circuit breaker.
 */
export function resetCircuitBreaker(): boolean {
  if (!circuitBroken) {return false;}
  circuitBroken = false;
  circuitBrokenAt = null;
  logger.info("Circuit breaker reset manually");
  return true;
}

/**
 * Check if circuit breaker is active.
 */
export function isCircuitBroken(): boolean {
  return circuitBroken;
}

// ─── Portfolio Risk Assessment ──────────────────────────────────

/**
 * Get full portfolio risk assessment.
 */
export function getPortfolioRisk(balances: ExchangeBalance[]): PortfolioRisk {
  const totalValueUSD = balances.reduce((sum, b) => sum + b.valueUSD, 0);

  const positions = balances
    .filter((b) => b.asset !== "USD" && b.asset !== "USDT" && b.total > 0)
    .map((b) => ({
      symbol: b.asset,
      valueUSD: b.valueUSD,
      pct: totalValueUSD > 0 ? b.valueUSD / totalValueUSD : 0,
    }))
    .toSorted((a, b) => b.valueUSD - a.valueUSD);

  return {
    totalValueUSD,
    positions,
    dailyPnL,
    dailyPnLPct: dailyPnLStartValue > 0 ? dailyPnL / dailyPnLStartValue : 0,
    maxDrawdown: currentDrawdown,
    maxDrawdownPct: currentDrawdown,
    circuitBroken,
    openPositions: positions.length,
    tradesToday,
  };
}

// ─── Risk Limits Management ─────────────────────────────────────

/**
 * Update risk limits from config.
 */
export function updateRiskLimits(limits: Partial<RiskLimits>): RiskLimits {
  const current = { ...DEFAULT_LIMITS, ...limits };
  logger.info("Risk limits updated", current);
  return current;
}

/**
 * Get current risk limits.
 */
export function getRiskLimits(): RiskLimits {
  const config = getConfig();
  return { ...DEFAULT_LIMITS, ...config.trading?.riskLimits };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getRiskDiagnostics(): RiskDiagnostics {
  return {
    limits: getRiskLimits(),
    circuitBroken,
    dailyPnL,
    tradesToday,
    blockedTrades,
    totalChecks,
  };
}
