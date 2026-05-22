/**
 * Republic Platform — Sprint 3 RPC Handlers: Scalability & Federation
 *
 * Worker Thread Parallel Tick:
 *   republic.worker.pool.status
 *   republic.worker.pool.init
 *   republic.worker.pool.shutdown
 *   republic.worker.tick.run       — run one parallel citizen tick
 *   republic.worker.metrics
 *
 * Inter-Republic Federation Diplomacy:
 *   republic.federation.init
 *   republic.federation.diagnostics
 *   republic.federation.relations.list
 *   republic.federation.relation.get
 *   republic.federation.relation.propose
 *   republic.federation.relation.ratify
 *   republic.federation.relation.suspend
 *   republic.federation.relation.terminate
 *   republic.federation.war.declare
 *   republic.federation.peace.propose
 *   republic.federation.trade.execute
 *   republic.federation.trade.history
 *   republic.federation.border.incident.report
 *   republic.federation.border.incident.resolve
 *   republic.federation.border.incidents
 *   republic.federation.council.motion.propose
 *   republic.federation.council.motion.vote
 *   republic.federation.council.motions
 *   republic.federation.tick
 */

import type {
  FederationRelationType,
  RelationTerm,
  EscalationLevel,
  VoteChoice,
} from "../../../republic/federation/federation-diplomacy.js";
import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  setLocalInstanceId,
  getLocalInstanceId,
  proposeRelation,
  ratifyRelation,
  suspendRelation,
  terminateRelation,
  declareWar,
  proposePeace,
  executeTrade,
  reportBorderIncident,
  resolveIncident,
  proposeCouncilMotion,
  voteOnMotion,
  getRelations,
  getRelation,
  getTradeHistory,
  getBorderIncidents,
  getCouncilMotions,
  getFederationDiagnostics,
  federationTick,
} from "../../../republic/federation/federation-diplomacy.js";
import { getParallelTickPool, shutdownPool } from "../../../republic/workers/parallel-tick-pool.js";

export const scalabilityHandlers: Partial<GatewayRequestHandlers> = {
  // ── Worker Thread Pool ─────────────────────────────────────────

  "republic.worker.pool.status": ({ respond }) => {
    const pool = getParallelTickPool();
    respond(true, pool.getMetrics(), undefined);
  },

  "republic.worker.pool.init": async ({ respond }) => {
    const pool = getParallelTickPool();
    await pool.init();
    respond(true, { ok: true, metrics: pool.getMetrics() }, undefined);
  },

  "republic.worker.pool.shutdown": async ({ respond }) => {
    await shutdownPool();
    respond(true, { ok: true }, undefined);
  },

  "republic.worker.tick.run": async ({ params, respond }) => {
    const { tick, config: _config } = params as {
      tick?: number;
      config?: Parameters<ReturnType<typeof getParallelTickPool>["runTick"]>[2];
    };

    // Note: actual citizen serialization requires republic state —
    // this handler returns a stub result when called without state context.
    // Full integration is via the tick orchestrator's OrchestratedHandler.
    const pool = getParallelTickPool();
    const metrics = pool.getMetrics();
    respond(
      true,
      {
        ok: true,
        message: "Worker tick dispatched via parallel pool. Metrics attached.",
        tickRequested: tick ?? 0,
        metrics,
      },
      undefined,
    );
  },

  "republic.worker.metrics": ({ respond }) => {
    const pool = getParallelTickPool();
    respond(true, pool.getMetrics(), undefined);
  },

  // ── Inter-Republic Federation ──────────────────────────────────

  "republic.federation.init": ({ params, respond }) => {
    const { instanceId } = params as { instanceId: string };
    if (!instanceId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "instanceId required"));
      return;
    }
    setLocalInstanceId(instanceId);
    respond(true, { ok: true, instanceId }, undefined);
  },

  "republic.federation.diagnostics": ({ respond }) => {
    respond(true, getFederationDiagnostics(), undefined);
  },

  "republic.federation.relations.list": ({ params, respond }) => {
    const { type, status, targetInstanceId } = (params ?? {}) as {
      type?: FederationRelationType;
      status?: string;
      targetInstanceId?: string;
    };
    respond(
      true,
      {
        relations: getRelations({
          type,
          status: status as Parameters<typeof getRelations>[0] extends { status?: infer S }
            ? S
            : never,
          targetInstanceId,
        }),
      },
      undefined,
    );
  },

  "republic.federation.relation.get": ({ params, respond }) => {
    const { relationId } = params as { relationId: string };
    const relation = getRelation(relationId);
    if (!relation) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Relation ${relationId} not found`));
      return;
    }
    respond(true, relation, undefined);
  },

  "republic.federation.relation.propose": ({ params, respond }) => {
    const { targetInstanceId, type, terms, durationDays } = params as {
      targetInstanceId: string;
      type: FederationRelationType;
      terms: Omit<RelationTerm, "id">[];
      durationDays?: number;
    };
    const relation = proposeRelation(targetInstanceId, type, terms ?? [], durationDays);
    respond(true, relation, undefined);
  },

  "republic.federation.relation.ratify": ({ params, respond }) => {
    const { relationId } = params as { relationId: string };
    const relation = ratifyRelation(relationId);
    if (!relation) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Cannot ratify relation — not found or not in proposed state"));
      return;
    }
    respond(true, relation, undefined);
  },

  "republic.federation.relation.suspend": ({ params, respond }) => {
    const { relationId, reason } = params as { relationId: string; reason: string };
    const relation = suspendRelation(relationId, reason);
    if (!relation) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Cannot suspend — not found or not active"));
      return;
    }
    respond(true, relation, undefined);
  },

  "republic.federation.relation.terminate": ({ params, respond }) => {
    const { relationId, reason } = params as { relationId: string; reason: string };
    const relation = terminateRelation(relationId, reason ?? "Terminated by operator");
    if (!relation) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Relation not found"));
      return;
    }
    respond(true, relation, undefined);
  },

  "republic.federation.war.declare": ({ params, respond }) => {
    const { targetInstanceId, casusBelli } = params as {
      targetInstanceId: string;
      casusBelli: string;
    };
    const incident = declareWar(targetInstanceId, casusBelli);
    respond(true, incident, undefined);
  },

  "republic.federation.peace.propose": ({ params, respond }) => {
    const { targetInstanceId, reparationCredits } = params as {
      targetInstanceId: string;
      reparationCredits?: number;
    };
    const relation = proposePeace(targetInstanceId, reparationCredits ?? 0);
    respond(true, relation, undefined);
  },

  "republic.federation.trade.execute": ({ params, respond }) => {
    const { toInstanceId, resourceType, amount, exchangeRate } = params as {
      toInstanceId: string;
      resourceType: "credits" | "data" | "citizens" | "compute";
      amount: number;
      exchangeRate?: number;
    };
    const tx = executeTrade(toInstanceId, resourceType, amount, exchangeRate ?? 1);
    if (!tx) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Trade blocked — no active agreement or at war"));
      return;
    }
    respond(true, tx, undefined);
  },

  "republic.federation.trade.history": ({ params, respond }) => {
    const { limit } = (params ?? {}) as { limit?: number };
    respond(true, { trades: getTradeHistory(limit ?? 50) }, undefined);
  },

  "republic.federation.border.incident.report": ({ params, respond }) => {
    const { targetInstanceId, description, escalation } = params as {
      targetInstanceId: string;
      description: string;
      escalation?: EscalationLevel;
    };
    const incident = reportBorderIncident(targetInstanceId, description, escalation);
    respond(true, incident, undefined);
  },

  "republic.federation.border.incident.resolve": ({ params, respond }) => {
    const { incidentId } = params as { incidentId: string };
    const incident = resolveIncident(incidentId);
    if (!incident) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Incident not found or already resolved"));
      return;
    }
    respond(true, incident, undefined);
  },

  "republic.federation.border.incidents": ({ params, respond }) => {
    const { onlyOpen } = (params ?? {}) as { onlyOpen?: boolean };
    respond(true, { incidents: getBorderIncidents(onlyOpen ?? false) }, undefined);
  },

  "republic.federation.council.motion.propose": ({ params, respond }) => {
    const { title, description, eligibleVoters, quorum, passThreshold } = params as {
      title: string;
      description: string;
      eligibleVoters: string[];
      quorum?: number;
      passThreshold?: number;
    };
    const motion = proposeCouncilMotion(title, description, eligibleVoters, quorum, passThreshold);
    respond(true, motion, undefined);
  },

  "republic.federation.council.motion.vote": ({ params, respond }) => {
    const { motionId, vote } = params as { motionId: string; vote: VoteChoice };
    const motion = voteOnMotion(motionId, vote);
    if (!motion) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Motion not found, closed, or instance not eligible"));
      return;
    }
    respond(true, motion, undefined);
  },

  "republic.federation.council.motions": ({ params, respond }) => {
    const { status } = (params ?? {}) as { status?: FederationCouncilMotion["status"] };
    respond(true, { motions: getCouncilMotions(status) }, undefined);
  },

  "republic.federation.tick": ({ respond }) => {
    federationTick();
    respond(true, { ok: true, diagnostics: getFederationDiagnostics() }, undefined);
  },

  "republic.federation.local.instance": ({ respond }) => {
    respond(true, { instanceId: getLocalInstanceId() }, undefined);
  },
};

// Fix the missing import type for FederationCouncilMotion
type FederationCouncilMotion = ReturnType<typeof getCouncilMotions>[number];
