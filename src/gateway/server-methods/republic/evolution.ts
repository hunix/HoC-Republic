/**
 * Republic Platform — Evolution & Intelligence RPC Handlers
 *
 * republic.metrics               — Real-time performance snapshot
 * republic.scheduler.stats       — Priority scheduler tier breakdown
 * republic.constitution.*        — Constitutional principles management
 * republic.cognition.*           — Metacognition, counterfactual, causal
 * republic.economy.gini          — Gini coefficient of wealth
 */

import { getCausalGraphSummary } from "../../../republic/cognition/causal-graph.js";
import { getCounterfactualStats } from "../../../republic/cognition/counterfactual-engine.js";
import { getMetacognitiveAggregates } from "../../../republic/cognition/metacognition.js";
import {
  listPrinciples,
  setPrincipleEnabled,
  getAuditLog,
  getAuditStats,
} from "../../../republic/constitution/constitution.js";
import { getPriorityScheduler } from "../../../republic/priority-scheduler.js";
import {
  buildSnapshot,
  computeGini,
  computeHealthScore,
} from "../../../republic/republic-metrics.js";
import { getState } from "../../../republic/state.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import { defineHandlers, toHandlerMap } from "../types.js";
import { registryRegister } from "../handler-registry.js";

const evolutionDescriptors = defineHandlers({
  "republic.metrics": {
    scope: "read",
    handler: ({ respond }) => {
      const snapshot = buildSnapshot();
      respond(true, { ...snapshot, healthScore: computeHealthScore(snapshot) }, undefined);
    },
  },

  "republic.scheduler.stats": {
    scope: "read",
    handler: ({ respond }) => {
      const stats = getPriorityScheduler().getStats(0);
      respond(true, stats, undefined);
    },
  },

  "republic.constitution.list": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { principles: listPrinciples() }, undefined);
    },
  },

  "republic.constitution.setEnabled": {
    scope: "write",
    handler: ({ params, respond }) => {
      const { id, enabled } = params as { id: string; enabled: boolean };
      const ok = setPrincipleEnabled(id, Boolean(enabled));
      if (!ok) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Unknown principle: ${id}`));
        return;
      }
      respond(true, { ok: true, id, enabled }, undefined);
    },
  },

  "republic.constitution.audit": {
    scope: "read",
    handler: ({ params, respond }) => {
      const { limit } = params as { limit?: number };
      respond(true, { log: getAuditLog(limit ?? 50), stats: getAuditStats() }, undefined);
    },
  },

  "republic.cognition.metacognition.stats": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, getMetacognitiveAggregates(), undefined);
    },
  },

  "republic.cognition.counterfactual.stats": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, getCounterfactualStats(), undefined);
    },
  },

  "republic.cognition.causal.summary": {
    scope: "read",
    handler: ({ params, respond }) => {
      const { citizenId } = params as { citizenId?: string };
      if (!citizenId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
        return;
      }
      respond(true, getCausalGraphSummary(citizenId), undefined);
    },
  },

  "republic.economy.gini": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const citizens = (s.citizens ?? []) as Array<{ wealthBalance?: number }>;
      const wealths = citizens.map((c) => c.wealthBalance ?? 0).filter((w) => w >= 0);
      respond(
        true,
        {
          gini: computeGini(wealths),
          citizenCount: wealths.length,
          totalWealth: wealths.reduce((a, b) => a + b, 0),
        },
        undefined,
      );
    },
  },
});

registryRegister(evolutionDescriptors);
export const evolutionHandlers = toHandlerMap(evolutionDescriptors);
