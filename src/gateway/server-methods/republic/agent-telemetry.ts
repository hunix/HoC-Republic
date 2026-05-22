/**
 * Agent Telemetry RPC Handlers
 *
 * Exposes telemetry snapshots, session traces, tool analytics,
 * and strategy planner to the gateway RPC layer.
 */

import type { GatewayRequestHandlers } from "../types.js";

export const agentTelemetryHandlers: GatewayRequestHandlers = {
  // ─── Telemetry ─────────────────────────────────────────────────

  "republic.agent.telemetry.snapshot": async ({ respond }) => {
    const { getTelemetrySnapshot } = await import("../../../republic/agent-telemetry.js");
    respond(true, { ok: true, ...getTelemetrySnapshot() }, undefined);
  },

  "republic.agent.telemetry.session": async ({ params, respond }) => {
    const { sessionId } = params as { sessionId?: string };
    if (!sessionId) {
      respond(true, { ok: false, error: "sessionId required" }, undefined);
      return;
    }
    const { getSessionTrace } = await import("../../../republic/agent-telemetry.js");
    const trace = getSessionTrace(sessionId);
    if (!trace) {
      respond(true, { ok: false, error: "Session not found" }, undefined);
      return;
    }
    respond(true, { ok: true, trace }, undefined);
  },

  "republic.agent.telemetry.slowest-tools": async ({ params, respond }) => {
    const { limit = 10 } = params as { limit?: number };
    const { getSlowestTools } = await import("../../../republic/agent-telemetry.js");
    respond(true, { ok: true, tools: getSlowestTools(limit) }, undefined);
  },

  "republic.agent.telemetry.error-prone-tools": async ({ params, respond }) => {
    const { limit = 10 } = params as { limit?: number };
    const { getMostErrorProneTools } = await import("../../../republic/agent-telemetry.js");
    respond(true, { ok: true, tools: getMostErrorProneTools(limit) }, undefined);
  },

  // ─── Strategy Planner ──────────────────────────────────────────

  "republic.agent.strategy.plan": async ({ params, respond }) => {
    const { prompt } = params as { prompt?: string };
    if (!prompt) {
      respond(true, { ok: false, error: "prompt required" }, undefined);
      return;
    }
    const { planExecution, recordPlan } =
      await import("../../../republic/agent-strategy-planner.js");
    const plan = planExecution(prompt);
    recordPlan(prompt, plan);
    respond(true, { ok: true, ...plan }, undefined);
  },

  "republic.agent.strategy.distribution": async ({ respond }) => {
    const { getStrategyDistribution } = await import("../../../republic/agent-strategy-planner.js");
    respond(true, { ok: true, distribution: getStrategyDistribution() }, undefined);
  },

  "republic.agent.strategy.outcomes": async ({ respond }) => {
    const { getOutcomeStats } = await import("../../../republic/agent-strategy-planner.js");
    respond(true, { ok: true, ...getOutcomeStats() }, undefined);
  },

  // ─── Intelligence (Loop Controller) ────────────────────────────

  "republic.agent.intelligence.assess": async ({ params, respond }) => {
    const { prompt } = params as { prompt?: string };
    if (!prompt) {
      respond(true, { ok: false, error: "prompt required" }, undefined);
      return;
    }
    const { planExecution, getOutcomeStats } =
      await import("../../../republic/agent-strategy-planner.js");
    const { createLoopIntelligence } = await import("../../../republic/agent-loop-intelligence.js");
    const { getMostErrorProneTools } = await import("../../../republic/agent-telemetry.js");
    const plan = planExecution(prompt);
    const intel = createLoopIntelligence(plan, 500);
    const initial = intel.initial();
    const outcomes = getOutcomeStats();
    const errorProneTools = getMostErrorProneTools(10);
    respond(
      true,
      {
        ok: true,
        strategy: plan.strategy,
        confidence: plan.confidence,
        effectiveMaxIterations: initial.effectiveMaxIterations,
        filteredTools: [...intel.filteredToolNames],
        phases: plan.decomposition.map((p) => ({
          phase: p.phase,
          description: p.description,
          tools: p.tools,
          budget: p.iterationBudget,
        })),
        estimatedIterations: plan.estimatedIterations,
        reasoning: plan.reasoning,
        promptModifier: plan.promptModifier,
        // Learning data
        historicalOutcomes: outcomes.byStrategy[plan.strategy] ?? null,
        totalOutcomes: outcomes.totalOutcomes,
        errorProneTools: errorProneTools.filter((t) => t.errorRate > 30),
        // Intelligence features
        features: {
          tokenBudgetTracking: true,
          velocityTracking: true,
          escalatingNudges: true,
          costAwareHints: true,
          learningPersistence: true,
        },
      },
      undefined,
    );
  },

  // ─── Learning Data Persistence ──────────────────────────────────

  "republic.agent.learning.export": async ({ respond }) => {
    const { exportCompactLearning } = await import("../../../republic/agent-telemetry.js");
    respond(true, { ok: true, data: exportCompactLearning() }, undefined);
  },

  "republic.agent.learning.import": async ({ params, respond }) => {
    const { data } = params as { data?: unknown };
    if (!data || typeof data !== "object") {
      respond(true, { ok: false, error: "data object required" }, undefined);
      return;
    }
    const { importCompactLearning } = await import("../../../republic/agent-telemetry.js");
    importCompactLearning(
      data as import("../../../republic/agent-telemetry.js").CompactLearningData,
    );
    respond(true, { ok: true, message: "Learning data imported successfully" }, undefined);
  },
};
