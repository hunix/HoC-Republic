/**
 * Republic Gateway Handlers — Intelligence
 *
 * Serves real-time intelligence data to the UI using the standard
 * respond() pattern (handler calls respond(), never returns a value).
 *
 * Endpoints:
 *   republic.intelligence.metacognition  — per-citizen cognitive cycle history & curiosity scores
 *   republic.intelligence.predictions    — ML quality predictions from real republic-db data
 *   republic.intelligence.anomalies      — live anomaly events from the intelligence-bus
 *   republic.intelligence.aggregates     — system-wide cognitive stats
 *   republic.intelligence.events         — recent intelligence-bus events (all channels)
 */

import type { GatewayRequestHandlers } from "../types.js";
import { computeCuriosityScore } from "../../../intelligence/curiosity-engine.js";
import { intelligenceBus } from "../../../republic/intelligence-bus.js";
import {
  getCognitiveAggregates,
  getCognitiveHistory,
  getLatestCuriosityScore,
  queryModelPerformance,
} from "../../../republic/republic-db.js";
import { getState } from "../../../republic/state.js";
import { getHallucinationSummary, getRecentHallucinations } from "../../../republic/hallucination-tracker.js";
import type { HallucinationType } from "../../../republic/agents/output-verifier.js";
import { getToonStats as getToonStatsRpc } from "../../../republic/toon-serializer.js";

export const intelligenceHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Metacognition ─────────────────────────────────────────────

  "republic.intelligence.metacognition": ({ params, respond }) => {
    const citizenId = typeof params.citizenId === "string" ? params.citizenId : null;
    const limit = typeof params.limit === "number" ? Math.min(params.limit, 50) : 20;

    if (citizenId) {
      const history = getCognitiveHistory(citizenId, limit);
      const latestScore = getLatestCuriosityScore(citizenId);

      const state = getState();
      const citizen = state?.citizens.find((c) => c.id === citizenId);
      const liveScore = citizen ? computeCuriosityScore(citizen) : null;

      respond(true, {
        citizenId,
        latestCuriosityScore: latestScore,
        liveScore,
        history,
        historyLength: history.length,
      });
      return;
    }

    // All-citizens summary
    const state = getState();
    const aggregates = getCognitiveAggregates();

    const citizenSummaries = (state?.citizens ?? [])
      .map((c) => ({
        citizenId: c.id,
        name: c.name,
        specialization: c.specialization,
        intelligence: c.intelligence ?? 100,
        masteryLevel: c.masteryLevel ?? 0,
        curiosityScore: getLatestCuriosityScore(c.id),
        hasCognitiveHistory: getCognitiveHistory(c.id, 1).length > 0,
      }))
      .toSorted((a, b) => b.curiosityScore - a.curiosityScore);

    respond(true, { aggregates, citizens: citizenSummaries });
  },

  // ─── ML Predictions ────────────────────────────────────────────

  "republic.intelligence.predictions": ({ params, respond }) => {
    const limit = typeof params.limit === "number" ? Math.min(params.limit, 100) : 50;
    const toolNameFilter = typeof params.tool === "string" ? params.tool : undefined;

    // Query from real model decision data — use toolName param matching republic-db signature
    const perf = queryModelPerformance({
      toolName: toolNameFilter,
      limit,
    });

    respond(true, {
      overall: {
        averageQuality: perf.averageQuality,
        averageLatency: perf.averageLatency,
        averageCost: perf.averageCost,
        bestModel: perf.bestModel,
        totalDecisions: perf.count,
      },
      timestamp: Date.now(),
    });
  },

  // ─── Anomalies ─────────────────────────────────────────────────

  "republic.intelligence.anomalies": ({ params, respond }) => {
    const limit = typeof params.limit === "number" ? Math.min(params.limit, 50) : 20;
    const since = typeof params.since === "number" ? params.since : 0;

    const anomalies = intelligenceBus.getRecentAnomalies(limit);
    const filtered = since > 0 ? anomalies.filter((a) => a.timestamp > since) : anomalies;

    respond(true, {
      anomalies: filtered,
      count: filtered.length,
      hasCritical: filtered.some((a) => a.severity === "critical"),
      timestamp: Date.now(),
    });
  },

  // ─── Aggregates ────────────────────────────────────────────────

  "republic.intelligence.aggregates": ({ respond }) => {
    const agg = getCognitiveAggregates();
    const perf = queryModelPerformance({ limit: 100 });
    const recentCycles = intelligenceBus.getRecentCognitiveCycles(10);

    respond(true, {
      cognitive: agg,
      modelPerformance: {
        averageQuality: perf.averageQuality,
        bestModel: perf.bestModel,
        totalDecisions: perf.count,
      },
      recentCognitiveCycles: recentCycles,
      busListenerCount: intelligenceBus.listenerCount,
      timestamp: Date.now(),
    });
  },

  // ─── Bus Event Stream ─────────────────────────────────────────

  "republic.intelligence.events": ({ params, respond }) => {
    const prefix = typeof params.prefix === "string" ? params.prefix : undefined;
    const limit = typeof params.limit === "number" ? Math.min(params.limit, 100) : 50;
    const since = typeof params.since === "number" ? params.since : 0;

    const events = intelligenceBus.getRecentEvents({
      prefix,
      limit,
      since: since > 0 ? since : undefined,
    });

    respond(true, {
      events,
      count: events.length,
      timestamp: Date.now(),
    });
  },

  // ─── Hallucination Diagnostics ──────────────────────────────────

  "republic.intelligence.hallucination-summary": ({ respond }) => {
    const summary = getHallucinationSummary();
    respond(true, {
      ...summary,
      timestamp: Date.now(),
    });
  },

  "republic.intelligence.hallucination-events": ({ params, respond }) => {
    const limit = typeof params.limit === "number" ? Math.min(params.limit, 100) : 50;
    const citizenId = typeof params.citizenId === "string" ? params.citizenId : undefined;
    const modelId = typeof params.modelId === "string" ? params.modelId : undefined;
    const type = typeof params.type === "string" ? params.type as HallucinationType : undefined;

    const records = getRecentHallucinations(limit, { citizenId, modelId, type });
    respond(true, {
      records,
      count: records.length,
      timestamp: Date.now(),
    });
  },

  "republic.intelligence.toon-stats": ({ respond }) => {
    const toonStats = getToonStatsRpc();
    respond(true, {
      ...toonStats,
      timestamp: Date.now(),
    });
  },
};
