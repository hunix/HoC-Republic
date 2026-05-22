/**
 * Republic Gateway Handlers — Agent Society (Phase 38)
 *
 * RPC handlers for all Phase 38 agent society modules:
 *  - Trust & Reputation
 *  - Emergence Detection
 *  - Agent Protocol
 *  - Spatial World
 *  - Policy Evolution
 *  - Observability
 *  - Constitution
 *  - Autonomous Economy
 *  - Society Health (aggregated dashboard)
 */

import type { GatewayRequestHandlers } from "../types.js";
// ─── Agent Protocol ─────────────────────────────────────────────
import {
    getActiveConversations,
    getCitizenConversations as getProtocolConversations, getPendingMessages as getProtocolMessages, protocolDiagnostics
} from "../../../republic/agent-protocol.js";
// ─── Autonomous Economy ─────────────────────────────────────────
import {
    economyAgencyDiagnostics, getTreasuryBalance, searchListings
} from "../../../republic/autonomous-economy.js";
// ─── Constitution ───────────────────────────────────────────────
import { constitutionDiagnostics, getConstitution } from "../../../republic/constitution.js";
// ─── Emergence Detection ────────────────────────────────────────
import {
    emergenceDiagnostics, getActiveCascades, getActiveCoalitions, getCooperationMetrics, getEmergentNorms, getTopInfluencers
} from "../../../republic/emergence-detector.js";
// ─── Event Sourcing (National Metrics) ──────────────────────────
import { getNationalMetrics } from "../../../republic/event-sourcing.js";
// ─── Observability ──────────────────────────────────────────────
import { observabilityDiagnostics } from "../../../republic/observability.js";
// ─── Policy Evolution ───────────────────────────────────────────
import {
    getActivePolicies,
    getPoliciesByStatus,
    policyEvolutionDiagnostics
} from "../../../republic/policy-evolution.js";
// ─── Resilience ─────────────────────────────────────────────────
import { checkSystemHealth } from "../../../republic/resilience.js";
// ─── Spatial World ──────────────────────────────────────────────
import {
    getCitizenPosition, getLocation, getNearbyCtizens, spatialDiagnostics
} from "../../../republic/spatial-world.js";
// ─── State ──────────────────────────────────────────────────────
import { getState } from "../../../republic/state.js";
// ─── Tool Executor ──────────────────────────────────────────────
import { toolExecutorDiagnostics } from "../../../republic/tool-executor.js";
// ─── Trust & Reputation ─────────────────────────────────────────
import {
    getDelegationScore, getReputationProfile, isTrusted,
    reputationDiagnostics
} from "../../../republic/trust-reputation.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

// ─────────────────────────────────────────────────────────────────

export const agentSocietyHandlers: Partial<GatewayRequestHandlers> = {
  // ═══ Trust & Reputation ════════════════════════════════════════

  "republic.trust.profile": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    try {
      const profile = getReputationProfile(p.citizenId);
      respond(true, { ok: true, profile }, undefined);
    } catch {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Reputation profile not found"));
    }
  },

  "republic.trust.delegation": ({ params, respond }) => {
    const p = params as { citizenId?: string; domain?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const score = getDelegationScore(
      p.citizenId,
      (p.domain as "task" | "governance" | "social" | "economic") ?? "task",
    );
    respond(true, { ok: true, score }, undefined);
  },

  "republic.trust.check": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    respond(true, { ok: true, trusted: isTrusted(p.citizenId) }, undefined);
  },

  "republic.trust.diagnostics": ({ respond }) => {
    respond(true, reputationDiagnostics(), undefined);
  },

  // ═══ Emergence Detection ═══════════════════════════════════════

  "republic.emergence.coalitions": ({ respond }) => {
    respond(true, { ok: true, coalitions: getActiveCoalitions() }, undefined);
  },

  "republic.emergence.cascades": ({ respond }) => {
    respond(true, { ok: true, cascades: getActiveCascades() }, undefined);
  },

  "republic.emergence.norms": ({ respond }) => {
    respond(true, { ok: true, norms: getEmergentNorms() }, undefined);
  },

  "republic.emergence.cooperation": ({ respond }) => {
    respond(true, { ok: true, metrics: getCooperationMetrics() }, undefined);
  },

  "republic.emergence.influencers": ({ params, respond }) => {
    const p = params as { limit?: number } | undefined;
    respond(true, { ok: true, influencers: getTopInfluencers(p?.limit ?? 10) }, undefined);
  },

  "republic.emergence.diagnostics": ({ respond }) => {
    respond(true, emergenceDiagnostics(), undefined);
  },

  // ═══ Agent Protocol ════════════════════════════════════════════

  "republic.protocol.messages": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    respond(true, { ok: true, messages: getProtocolMessages(p.citizenId) }, undefined);
  },

  "republic.protocol.conversations": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    respond(true, { ok: true, conversations: getProtocolConversations(p.citizenId) }, undefined);
  },

  "republic.protocol.conversations.active": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    respond(true, { ok: true, conversations: getActiveConversations(p.citizenId) }, undefined);
  },

  "republic.protocol.diagnostics": ({ respond }) => {
    respond(true, protocolDiagnostics(), undefined);
  },

  // ═══ Spatial World ═════════════════════════════════════════════

  "republic.spatial.position": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const position = getCitizenPosition(p.citizenId);
    respond(
      !!position,
      position ? { ok: true, position } : undefined,
      position ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Citizen position not found"),
    );
  },

  "republic.spatial.nearby": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    respond(true, { ok: true, nearby: getNearbyCtizens(p.citizenId) }, undefined);
  },

  "republic.spatial.location": ({ params, respond }) => {
    const p = params as { locationId?: string } | undefined;
    if (!p?.locationId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "locationId required"));
      return;
    }
    const location = getLocation(p.locationId);
    respond(
      !!location,
      location ? { ok: true, location } : undefined,
      location ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Location not found"),
    );
  },

  "republic.spatial.diagnostics": ({ respond }) => {
    respond(true, spatialDiagnostics(), undefined);
  },

  // ═══ Policy Evolution ══════════════════════════════════════════

  "republic.policy.active": ({ respond }) => {
    respond(true, { ok: true, policies: getActivePolicies() }, undefined);
  },

  "republic.policy.history": ({ respond }) => {
    respond(true, { ok: true, history: getPoliciesByStatus("expired") }, undefined);
  },

  "republic.policy.diagnostics": ({ respond }) => {
    respond(true, policyEvolutionDiagnostics(), undefined);
  },

  // ═══ Observability ═════════════════════════════════════════════

  "republic.observability.diagnostics": ({ respond }) => {
    respond(true, observabilityDiagnostics(), undefined);
  },

  // ═══ Constitution ══════════════════════════════════════════════

  "republic.constitution.articles": ({ respond }) => {
    respond(true, { ok: true, constitution: getConstitution() }, undefined);
  },

  "republic.constitution.diagnostics": ({ respond }) => {
    respond(true, constitutionDiagnostics(), undefined);
  },

  // ═══ Autonomous Economy ════════════════════════════════════════

  "republic.economy.agency.listings": ({ params, respond }) => {
    const p = params as { category?: string; limit?: number } | undefined;
    respond(
      true,
      {
        ok: true,
        listings: searchListings({
          category: p?.category as
            | "creative"
            | "computation"
            | "knowledge"
            | "analysis"
            | "communication"
            | "labor"
            | undefined,
        }),
      },
      undefined,
    );
  },

  "republic.economy.agency.treasury": ({ respond }) => {
    respond(true, { ok: true, balance: getTreasuryBalance() }, undefined);
  },

  "republic.economy.agency.diagnostics": ({ respond }) => {
    respond(true, economyAgencyDiagnostics(), undefined);
  },

  // ═══ Tool Executor ═════════════════════════════════════════════

  "republic.tools.diagnostics": ({ respond }) => {
    respond(true, toolExecutorDiagnostics(), undefined);
  },

  // ═══ A7: Society Health Dashboard (Aggregated) ═════════════════

  "republic.health.society": ({ respond }) => {
    try {
      const s = getState();
      const health = {
        trust: reputationDiagnostics(),
        emergence: emergenceDiagnostics(),
        cooperation: getCooperationMetrics(),
        spatial: spatialDiagnostics(),
        policy: policyEvolutionDiagnostics(),
        observability: observabilityDiagnostics(),
        constitution: constitutionDiagnostics(),
        economy: economyAgencyDiagnostics(),
        tools: toolExecutorDiagnostics(),
        protocol: protocolDiagnostics(),
        nationalMetrics: getNationalMetrics(s),
        systemHealth: checkSystemHealth(),
      };
      respond(true, { ok: true, health }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Society health aggregation failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },
};
