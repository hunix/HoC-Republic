/**
 * Republic Platform — Forex Engine (session-aware autonomous Forex trading)
 *
 * Runs in parallel with trading-engine.ts (crypto).
 * Flow: forexDataTick → markToMarket → strategy eval → risk check → placeForexOrder
 */
// oxlint-disable eslint(curly)
import { createSubsystemLogger } from "../logging/subsystem.js";
import { emitNationalEvent } from "./event-sourcing.js";
import { getConfig } from "./republic-config.js";
import type { RepublicState } from "./types.js";
import { recordRevenue } from "./treasury-manager.js";
import { fetchForexOHLC, forexDataTick, FOREX_PAIRS } from "./forex-data.js";
import {
  evaluateForexStrategy, getActiveForexStrategies,
  initDefaultForexStrategies, recordForexStrategyResult, getCurrentSession,
} from "./forex-strategies.js";
import {
  getForexBrokerStatus, getForexPositions,
  markToMarket, placeForexOrder, getClosedTrades,
} from "./forex-broker.js";

const logger = createSubsystemLogger("republic:forex-engine");

let forexEnabled = false;
let totalTicks = 0;
let totalSignals = 0;
let tradesExecuted = 0;
let tradesBlocked = 0;
let strategiesInit = false;

const STRATEGY_EVAL_INTERVAL = 3;
const MAX_CONCURRENT_POSITIONS = 6;
const MAX_DAILY_LOSS_USD = 200;

const SESSION_MULTIPLIERS: Record<string, number> = {
  overlap: 1.0, london: 0.8, ny: 0.7, asian: 0.4,
};

function ensureStrategiesReady(): void {
  if (strategiesInit) return;
  strategiesInit = true;
  initDefaultForexStrategies();
}

function checkForexRisk(): { allowed: boolean; reason?: string } {
  if (getForexPositions().length >= MAX_CONCURRENT_POSITIONS) {
    return { allowed: false, reason: `Max positions (${MAX_CONCURRENT_POSITIONS}) reached` };
  }
  const today = new Date().toDateString();
  const dailyLoss = getClosedTrades(200)
    .filter((t) => new Date(t.closedAt).toDateString() === today && t.pnlUSD < 0)
    .reduce((sum, t) => sum + Math.abs(t.pnlUSD), 0);
  if (dailyLoss >= MAX_DAILY_LOSS_USD) {
    return { allowed: false, reason: `Daily loss limit hit ($${dailyLoss.toFixed(2)})` };
  }
  return { allowed: true };
}

export function forexTick(s: RepublicState): void {
  totalTicks++;
  const config = getConfig();
  const forexConfig = (config as Record<string, unknown>).forex as Record<string, unknown> | undefined;
  const configEnabled = forexConfig?.enabled === true;
  if (!configEnabled && !forexEnabled) return;
  if (forexConfig?.enabled !== undefined) forexEnabled = forexConfig.enabled === true;
  if (!forexEnabled) return;

  ensureStrategiesReady();
  forexDataTick(s.currentTick);
  markToMarket();

  if (s.currentTick % STRATEGY_EVAL_INTERVAL !== 0) return;

  runForexEvaluation(s).catch((err) => {
    logger.warn("Forex tick error", { error: err instanceof Error ? err.message : String(err) });
  });
}

async function runForexEvaluation(s: RepublicState): Promise<void> {
  const strategies = getActiveForexStrategies();
  if (strategies.length === 0) return;

  const session = getCurrentSession();
  const sessionMult = SESSION_MULTIPLIERS[session] ?? 0.5;
  const risk = checkForexRisk();

  for (const strategy of strategies) {
    for (const pair of strategy.pairs) {
      try {
        const candles = await fetchForexOHLC(pair, "H1", 300);
        if (candles.length < 50) continue;

        const signal = evaluateForexStrategy(strategy, pair, candles);
        totalSignals++;
        if (signal.action === "hold" || signal.confidence < 0.5) continue;

        if (!risk.allowed) {
          tradesBlocked++;
          continue;
        }

        const units = Math.max(100, Math.round(signal.suggestedUnits * sessionMult * signal.confidence));
        const order = await placeForexOrder(pair, signal.action, units, {
          stopLossPips: signal.stopLossPips,
          takeProfitPips: signal.takeProfitPips,
          strategyId: strategy.id,
        });

        if (order.status === "filled") {
          tradesExecuted++;
          emitNationalEvent("economy", "forex_trade_placed", "system", {
            pair, action: signal.action, units, strategy: strategy.name,
            confidence: signal.confidence, session, reason: signal.reason,
          });
        }
      } catch (err) {
        logger.warn(`Forex eval failed: ${strategy.name}/${pair}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Check recently closed trades → record revenue
  const recentClosed = getClosedTrades(20).filter((t) => {
    return Date.now() - new Date(t.closedAt).getTime() < STRATEGY_EVAL_INTERVAL * 6000;
  });
  for (const trade of recentClosed) {
    if (trade.pnlUSD > 0) {
      recordRevenue(trade.pnlUSD, "USD", "other", `Forex: ${trade.pair} ${trade.pnlPips.toFixed(1)} pips`, s);
      if (trade.strategyId) recordForexStrategyResult(trade.strategyId, true, trade.pnlPips);
      emitNationalEvent("economy", "forex_profit_realized", "system", {
        pair: trade.pair, pnlPips: trade.pnlPips, pnlUSD: trade.pnlUSD,
      });
    } else if (trade.strategyId) {
      recordForexStrategyResult(trade.strategyId, false, trade.pnlPips);
    }
  }
}

export function enableForexTrading(): void { forexEnabled = true; ensureStrategiesReady(); }
export function disableForexTrading(): void { forexEnabled = false; }
export function isForexEnabled(): boolean { return forexEnabled; }

/** Called once from state.ts during Republic startup — idempotent */
export async function initForexEngine(): Promise<void> {
  if (strategiesInit) return;
  ensureStrategiesReady();
  try {
    const { seedForexKnowledge } = await import("./forex-knowledge.js");
    seedForexKnowledge();
    logger.info("Forex engine initialized: 8 strategies + 22 knowledge items seeded");
  } catch (err) {
    logger.warn("Forex knowledge seeding failed", { error: String(err) });
  }
}

export interface ForexEngineStatus {
  enabled: boolean; mode: "paper" | "live"; session: string;
  positions: ReturnType<typeof getForexPositions>;
  brokerStatus: ReturnType<typeof getForexBrokerStatus>;
  activeStrategies: number; totalTrades: number; totalSignals: number;
  tradesBlocked: number; dailyPnLUSD: number; totalPnLUSD: number;
  recentTrades: ReturnType<typeof getClosedTrades>;
}

export function getForexEngineStatus(): ForexEngineStatus {
  const broker = getForexBrokerStatus();
  const today = new Date().toDateString();
  const closed = getClosedTrades(200);
  const dailyPnL = closed.filter((t) => new Date(t.closedAt).toDateString() === today)
    .reduce((s, t) => s + t.pnlUSD, 0);
  const totalPnL = closed.reduce((s, t) => s + t.pnlUSD, 0);
  return {
    enabled: forexEnabled, mode: broker.mode, session: getCurrentSession(),
    positions: getForexPositions(), brokerStatus: broker,
    activeStrategies: getActiveForexStrategies().length,
    totalTrades: tradesExecuted, totalSignals, tradesBlocked,
    dailyPnLUSD: parseFloat(dailyPnL.toFixed(2)),
    totalPnLUSD: parseFloat(totalPnL.toFixed(2)),
    recentTrades: getClosedTrades(20),
  };
}

export function getForexDiagnostics() {
  return {
    enabled: forexEnabled, totalTicks, totalSignals, tradesExecuted, tradesBlocked,
    openPositions: getForexPositions().length, session: getCurrentSession(),
    maxConcurrentPositions: MAX_CONCURRENT_POSITIONS, maxDailyLossUSD: MAX_DAILY_LOSS_USD,
  };
}

export function getTrackedForexPairs(): string[] { return FOREX_PAIRS; }
