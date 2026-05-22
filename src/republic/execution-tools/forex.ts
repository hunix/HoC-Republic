/**
 * Execution Tools — Forex Trading
 *
 * 6 forex executors: get_rates, analyze_pair, place_trade,
 * get_positions, backtest_strategy, economic_calendar.
 */

import type { ExecutionResult, ExecutionContext } from "../execution-types.js";
import { makeSuccessResult } from "../execution-types.js";

// ─── forex_get_rates ────────────────────────────────────────────

export async function executeForexGetRates(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const { fetchForexRates, getAllForexRates } = await import("../forex-data.js");
    const pairsStr = String(args["pairs"] ?? "").trim();
    const requestedPairs = pairsStr ? pairsStr.split(",").map((p) => p.trim().toUpperCase()) : [];
    const allRates = getAllForexRates();
    const rates =
      requestedPairs.length > 0
        ? allRates.filter((r) => requestedPairs.includes(r.pair))
        : await fetchForexRates();
    return makeSuccessResult(
      "forex_get_rates",
      ctx,
      start,
      `Live Forex rates (${rates.length} pairs):\n` +
        rates
          .slice(0, 14)
          .map(
            (r) =>
              `${r.pair}: bid=${r.bid} ask=${r.ask} spread=${r.spread}pip (${r.change24h > 0 ? "+" : ""}${r.change24h.toFixed(2)}%)`,
          )
          .join("\n"),
      [],
    );
  } catch (err) {
    return {
      ...makeSuccessResult("forex_get_rates", ctx, start, String(err), []),
      status: "failed",
    };
  }
}

// ─── forex_analyze_pair ─────────────────────────────────────────

export async function executeForexAnalyzePair(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const pair = String(args["pair"] ?? "EURUSD").toUpperCase();
  const timeframe = String(args["timeframe"] ?? "H1").toUpperCase() as "H1" | "H4" | "D1";
  try {
    const { fetchForexOHLC, getForexRate } = await import("../forex-data.js");
    const { getCurrentSession } = await import("../forex-strategies.js");
    const candles = await fetchForexOHLC(pair, timeframe, 200);
    const rate = getForexRate(pair);
    const session = getCurrentSession();
    if (candles.length < 30) {
      return makeSuccessResult(
        "forex_analyze_pair",
        ctx,
        start,
        `Not enough candle data for ${pair}`,
        [],
      );
    }
    const closes = candles.map((c) => c.close);
    const last = closes[closes.length - 1];
    const high20 = Math.max(...closes.slice(-20));
    const low20 = Math.min(...closes.slice(-20));
    const ema20 = closes.slice(-20).reduce((a, b) => a + b) / 20;
    const ema50 = closes.length >= 50 ? closes.slice(-50).reduce((a, b) => a + b) / 50 : ema20;
    const trend = last > ema50 ? "BULLISH" : last < ema50 ? "BEARISH" : "NEUTRAL";
    const summary = [
      `📊 ${pair} Analysis (${timeframe}) — ${session.toUpperCase()} session`,
      `Current: ${rate?.mid ?? last.toFixed(5)} | Spread: ${rate?.spread ?? "N/A"}pip`,
      `20-period range: ${low20.toFixed(5)}–${high20.toFixed(5)}`,
      `EMA20: ${ema20.toFixed(5)} | EMA50: ${ema50.toFixed(5)}`,
      `Trend bias: ${trend}`,
      `Trade idea: ${trend === "BULLISH" ? `Look for buy dips near EMA20 (${ema20.toFixed(5)}) targeting ${(last + (high20 - low20) * 0.5).toFixed(5)}` : trend === "BEARISH" ? `Look for sell rallies near EMA20 (${ema20.toFixed(5)}) targeting ${(last - (high20 - low20) * 0.5).toFixed(5)}` : "Wait for clearer directional signal"}`,
    ].join("\n");
    return makeSuccessResult("forex_analyze_pair", ctx, start, summary, []);
  } catch (err) {
    return {
      ...makeSuccessResult("forex_analyze_pair", ctx, start, String(err), []),
      status: "failed",
    };
  }
}

// ─── forex_place_trade ──────────────────────────────────────────

export async function executeForexPlaceTrade(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const { placeForexOrder } = await import("../forex-broker.js");
    const pair = String(args["pair"] ?? "").toUpperCase();
    const side = String(args["side"] ?? "") as "buy" | "sell";
    const units = Number(args["units"] ?? 0);
    const sl = Number(args["stop_loss_pips"] ?? 0);
    const tp = Number(args["take_profit_pips"] ?? 0);
    const reason = String(args["reason"] ?? "");
    const order = await placeForexOrder(pair, side, units, {
      stopLossPips: sl,
      takeProfitPips: tp,
      citizenId: ctx.citizenId,
    });
    const output =
      order.status === "filled"
        ? `✅ Forex trade FILLED: ${side.toUpperCase()} ${units} ${pair} @ ${order.fillPrice}\nSL: ${sl}pip | TP: ${tp}pip | Reason: ${reason}`
        : `❌ Forex order rejected for ${pair}`;
    return makeSuccessResult("forex_place_trade", ctx, start, output, []);
  } catch (err) {
    return {
      ...makeSuccessResult("forex_place_trade", ctx, start, String(err), []),
      status: "failed",
    };
  }
}

// ─── forex_get_positions ────────────────────────────────────────

export async function executeForexGetPositions(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const { getForexPositions, getForexPositionsByCitizen, getForexBrokerStatus } =
      await import("../forex-broker.js");
    const citizenOnly = Boolean(args["citizen_only"] ?? false);
    const positions = citizenOnly ? getForexPositionsByCitizen(ctx.citizenId) : getForexPositions();
    const broker = getForexBrokerStatus();
    const summary = [
      `💱 Account: Balance $${broker.balance} | Equity $${broker.equity} | Free margin $${broker.freeMargin}`,
      `Open positions (${positions.length}):`,
      ...positions.map(
        (p) =>
          `  ${p.pair} ${p.side.toUpperCase()} ${p.units}u @ ${p.entryPrice} → ${p.currentPrice} | PnL: ${p.unrealizedPnLPips.toFixed(1)}pip ($${p.unrealizedPnLUSD.toFixed(2)})`,
      ),
      positions.length === 0 ? "  No open positions" : "",
    ].join("\n");
    return makeSuccessResult("forex_get_positions", ctx, start, summary, []);
  } catch (err) {
    return {
      ...makeSuccessResult("forex_get_positions", ctx, start, String(err), []),
      status: "failed",
    };
  }
}

// ─── forex_backtest_strategy ────────────────────────────────────

export async function executeForexBacktest(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  try {
    const { fetchForexOHLC } = await import("../forex-data.js");
    const { backtestForexStrategy } = await import("../forex-strategies.js");
    const strategyType = String(args["strategy_type"] ?? "trend_following") as Parameters<
      typeof backtestForexStrategy
    >[0];
    const pair = String(args["pair"] ?? "EURUSD").toUpperCase();
    const count = Math.min(2000, Math.max(200, Number(args["candle_count"] ?? 500)));
    const candles = await fetchForexOHLC(pair, "H1", count);
    const result = backtestForexStrategy(strategyType, pair, candles);
    const summary = [
      `📊 Backtest: ${strategyType} on ${pair} (${candles.length} H1 candles)`,
      `Trades: ${result.totalTrades} | Win Rate: ${(result.winRate * 100).toFixed(1)}%`,
      `Total Return: ${result.totalReturnPips > 0 ? "+" : ""}${result.totalReturnPips.toFixed(0)} pips`,
      `Sharpe: ${result.sharpeRatio.toFixed(2)} | Max DD: ${result.maxDrawdownPips.toFixed(1)}pip`,
      `Profit Factor: ${result.profitFactor.toFixed(2)} | Avg R:R ${result.averageRRR.toFixed(1)} | Expectancy: ${result.expectancy.toFixed(1)}pip/trade`,
      result.winRate >= 0.55
        ? "✅ Strategy has edge — consider deploying"
        : result.winRate >= 0.45
          ? "⚠️ Marginal edge — refine parameters"
          : "❌ No statistical edge on this pair",
    ].join("\n");
    return makeSuccessResult("forex_backtest_strategy", ctx, start, summary, []);
  } catch (err) {
    return {
      ...makeSuccessResult("forex_backtest_strategy", ctx, start, String(err), []),
      status: "failed",
    };
  }
}

// ─── forex_economic_calendar ────────────────────────────────────

export async function executeForexCalendar(
  args: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  const start = Date.now();
  const hours = Math.min(168, Math.max(1, Number(args["lookahead_hours"] ?? 48)));
  try {
    const { getCurrentSession } = await import("../forex-strategies.js");
    const session = getCurrentSession();
    const now = new Date();
    const EVENTS = [
      {
        name: "US NFP",
        currency: "USD",
        impact: "HIGH",
        schedule: "1st Friday of month 13:30 UTC",
        typical_move: "±80 pips EUR/USD",
      },
      {
        name: "FOMC Rate Decision",
        currency: "USD",
        impact: "HIGH",
        schedule: "8× per year, Wed 19:00 UTC",
        typical_move: "±50-150 pips",
      },
      {
        name: "ECB Rate Decision",
        currency: "EUR",
        impact: "HIGH",
        schedule: "8× per year, Thu 13:15 UTC",
        typical_move: "±50-100 pips",
      },
      {
        name: "BoE Rate Decision",
        currency: "GBP",
        impact: "HIGH",
        schedule: "8× per year, Thu 12:00 UTC",
        typical_move: "±60-120 pips",
      },
      {
        name: "BoJ Statement",
        currency: "JPY",
        impact: "HIGH",
        schedule: "8× per year",
        typical_move: "±100-300 pips (intervention risk)",
      },
      {
        name: "US Core CPI",
        currency: "USD",
        impact: "HIGH",
        schedule: "Monthly, 2nd Wed 13:30 UTC",
        typical_move: "±40-80 pips",
      },
      {
        name: "RBA Rate Decision",
        currency: "AUD",
        impact: "MEDIUM",
        schedule: "11× per year, Tue 04:30 UTC",
        typical_move: "±30-60 pips AUD pairs",
      },
      {
        name: "US GDP Flash",
        currency: "USD",
        impact: "HIGH",
        schedule: "Quarterly, last Wed of month",
        typical_move: "±30-60 pips",
      },
    ];
    const output = [
      `📅 Forex Economic Calendar — next ${hours}h`,
      `Current session: ${session.toUpperCase()} | UTC: ${now.toISOString().slice(11, 16)}`,
      "",
      "Upcoming high-impact events (check specific dates on Forex Factory or Investing.com):",
      ...EVENTS.map(
        (e) =>
          `  🔴 [${e.impact}] ${e.name} (${e.currency}) — ${e.schedule} — typical: ${e.typical_move}`,
      ),
      "",
      "⚠️ Rule: Reduce position size 50% in 4h before / 2h after any HIGH impact event.",
      "📌 Recommended event calendar: https://www.forexfactory.com/calendar",
    ].join("\n");
    return makeSuccessResult("forex_economic_calendar", ctx, start, output, []);
  } catch (err) {
    return {
      ...makeSuccessResult("forex_economic_calendar", ctx, start, String(err), []),
      status: "failed",
    };
  }
}
