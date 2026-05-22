/**
 * Republic Gateway Handlers — Forex Trading
 *
 * RPC endpoints for the Forex trading engine:
 *   republic.forex.rates              — live rates for 28 pairs
 *   republic.forex.analyze            — technical analysis + signal
 *   republic.forex.strategies         — list/toggle/backtest strategies
 *   republic.forex.positions          — open positions + P&L
 *   republic.forex.trades             — closed trade history
 *   republic.forex.status             — engine status + session info
 *   republic.forex.knowledge          — Forex knowledge catalogue
 *   republic.forex.enable             — enable/disable autonomous trading
 */
// oxlint-disable eslint(curly)

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const forexHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Live Rates ─────────────────────────────────────────────
  "republic.forex.rates": async ({ params, respond }) => {
    try {
      const { fetchForexRates, getAllForexRates } = await import("../../../republic/forex-data.js");
      const p = params as { pairs?: string[]; refresh?: boolean } | undefined;
      const rates = p?.refresh ? await fetchForexRates() : getAllForexRates();
      const filtered = p?.pairs?.length
        ? rates.filter((r) => p.pairs!.includes(r.pair))
        : rates;
      respond(true, { ok: true, rates: filtered, count: filtered.length }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ─── Technical Analysis ─────────────────────────────────────
  "republic.forex.analyze": async ({ params, respond }) => {
    try {
      const p = params as { pair?: string; timeframe?: "H1" | "H4" | "D1" } | undefined;
      if (!p?.pair) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "pair required"));
        return;
      }
      const pair = p.pair.toUpperCase();
      const tf = p.timeframe ?? "H1";
      const { fetchForexOHLC, getForexRate } = await import("../../../republic/forex-data.js");
      const { generateSignalForPair, getAllForexStrategies, getCurrentSession } = await import("../../../republic/forex-strategies.js");
      const candles = await fetchForexOHLC(pair, tf, 300);
      const rate = getForexRate(pair);
      const session = getCurrentSession();
      const strategies = getAllForexStrategies().filter((s) => s.enabled && s.pairs.includes(pair));
      const signals = strategies.map((s) => generateSignalForPair(s, pair, candles));
      respond(true, { ok: true, pair, timeframe: tf, session, rate, candleCount: candles.length, signals }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ─── Strategies List ────────────────────────────────────────
  "republic.forex.strategies": async ({ params, respond }) => {
    try {
      const { getAllForexStrategies, getActiveForexStrategies } = await import("../../../republic/forex-strategies.js");
      const p = params as { active_only?: boolean } | undefined;
      const strategies = p?.active_only ? getActiveForexStrategies() : getAllForexStrategies();
      respond(true, { ok: true, strategies, count: strategies.length }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ─── Toggle Strategy ────────────────────────────────────────
  "republic.forex.strategy.toggle": async ({ params, respond }) => {
    try {
      const p = params as { id?: string } | undefined;
      if (!p?.id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
        return;
      }
      const { toggleForexStrategy } = await import("../../../republic/forex-strategies.js");
      const ok = toggleForexStrategy(p.id);
      respond(ok, { ok }, ok ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Strategy not found"));
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ─── Backtest ───────────────────────────────────────────────
  "republic.forex.backtest": async ({ params, respond }) => {
    try {
      const p = params as { strategy_type?: string; pair?: string; candle_count?: number } | undefined;
      if (!p?.strategy_type || !p?.pair) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "strategy_type and pair required"));
        return;
      }
      const { fetchForexOHLC } = await import("../../../republic/forex-data.js");
      const { backtestForexStrategy } = await import("../../../republic/forex-strategies.js");
      const candles = await fetchForexOHLC(p.pair.toUpperCase(), "H1", Math.min(2000, Math.max(200, p.candle_count ?? 500)));
      const result = backtestForexStrategy(
        p.strategy_type as Parameters<typeof backtestForexStrategy>[0],
        p.pair.toUpperCase(),
        candles,
      );
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ─── Open Positions ─────────────────────────────────────────
  "republic.forex.positions": async ({ params, respond }) => {
    try {
      const p = params as { citizen_id?: string } | undefined;
      const { getForexPositions, getForexPositionsByCitizen, getForexBrokerStatus } = await import("../../../republic/forex-broker.js");
      const positions = p?.citizen_id
        ? getForexPositionsByCitizen(p.citizen_id)
        : getForexPositions();
      const broker = getForexBrokerStatus();
      respond(true, { ok: true, positions, broker }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ─── Closed Trade History ────────────────────────────────────
  "republic.forex.trades": async ({ params, respond }) => {
    try {
      const p = params as { limit?: number } | undefined;
      const { getClosedTrades } = await import("../../../republic/forex-broker.js");
      const trades = getClosedTrades(p?.limit ?? 50);
      respond(true, { ok: true, trades, count: trades.length }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ─── Engine Status ──────────────────────────────────────────
  "republic.forex.status": async ({ respond }) => {
    try {
      const { getForexEngineStatus } = await import("../../../republic/forex-engine.js");
      const status = getForexEngineStatus();
      respond(true, { ok: true, ...status }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ─── Enable / Disable Autonomous Trading ────────────────────
  "republic.forex.enable": async ({ params, respond }) => {
    try {
      const p = params as { enabled?: boolean } | undefined;
      if (p?.enabled == null) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "enabled (boolean) required"));
        return;
      }
      const { enableForexTrading, disableForexTrading, isForexEnabled } = await import("../../../republic/forex-engine.js");
      if (p.enabled) { enableForexTrading(); } else { disableForexTrading(); }
      respond(true, { ok: true, enabled: isForexEnabled() }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ─── Knowledge Catalogue ────────────────────────────────────
  "republic.forex.knowledge": async ({ params, respond }) => {
    try {
      const p = params as { type?: string; level?: string; tag?: string } | undefined;
      const { getForexKnowledge } = await import("../../../republic/forex-knowledge.js");
      type KFilter = Parameters<typeof getForexKnowledge>[0];
      const filter: KFilter = {
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any
        type: (p as any)?.type,
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any
        level: (p as any)?.level,
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any
        tag: (p as any)?.tag,
      };
      const items = getForexKnowledge(filter);
      respond(true, { ok: true, items, count: items.length }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ─── Place Order (via gateway, for external callers) ────────
  "republic.forex.placeOrder": async ({ params, respond }) => {
    try {
      const p = params as {
        pair?: string; side?: "buy" | "sell"; units?: number;
        stop_loss_pips?: number; take_profit_pips?: number;
        citizen_id?: string; strategy_id?: string;
      } | undefined;
      if (!p?.pair || !p?.side || !p?.units || !p?.stop_loss_pips || !p?.take_profit_pips) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "pair, side, units, stop_loss_pips, take_profit_pips required"));
        return;
      }
      const { placeForexOrder } = await import("../../../republic/forex-broker.js");
      const order = await placeForexOrder(p.pair.toUpperCase(), p.side, p.units, {
        stopLossPips: p.stop_loss_pips,
        takeProfitPips: p.take_profit_pips,
        citizenId: p.citizen_id,
        strategyId: p.strategy_id,
      });
      respond(true, { ok: true, order }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ─── Close Position ─────────────────────────────────────────
  "republic.forex.closePosition": async ({ params, respond }) => {
    try {
      const p = params as { position_id?: string } | undefined;
      if (!p?.position_id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "position_id required"));
        return;
      }
      const { closeForexPosition } = await import("../../../republic/forex-broker.js");
      const trade = await closeForexPosition(p.position_id);
      if (!trade) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Position not found"));
        return;
      }
      respond(true, { ok: true, trade }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ─── Diagnostics ────────────────────────────────────────────
  "republic.forex.diagnostics": async ({ respond }) => {
    try {
      const { getForexDiagnostics } = await import("../../../republic/forex-engine.js");
      const { getForexDataDiagnostics } = await import("../../../republic/forex-data.js");
      respond(true, {
        ok: true,
        engine: getForexDiagnostics(),
        data: getForexDataDiagnostics(),
      }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
