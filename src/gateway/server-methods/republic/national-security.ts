/**
 * Republic Gateway Handlers — National Security & Resilience
 *
 * RPC handlers for:
 *  - National Defense (threat assessment, quarantine, security scans)
 *  - Resilience (circuit breakers, system health, self-healing)
 *  - Event Sourcing (national metrics)
 */

import type { GatewayRequestHandlers } from "../types.js";
// ─── Event Sourcing (National Metrics) ──────────────────────────
import { getNationalMetrics } from "../../../republic/event-sourcing.js";
// ─── National Defense ───────────────────────────────────────────
import {
    assessCitizenThreat, checkRateLimit,
    getDefenseDiagnostics, isQuarantined, quarantineCitizen,
    releaseCitizen, runSecurityScan
} from "../../../republic/national-defense.js";
// ─── Resilience ─────────────────────────────────────────────────
import {
    checkSystemHealth,
    getAllCircuitBreakerDiagnostics,
    getSelfHealingDiagnostics
} from "../../../republic/resilience.js";
// ─── State ──────────────────────────────────────────────────────
import { getState } from "../../../republic/state.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

// ─────────────────────────────────────────────────────────────────

export const nationalSecurityHandlers: Partial<GatewayRequestHandlers> = {
  // ═══ National Defense ══════════════════════════════════════════

  "republic.defense.threat.assess": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const s = getState();
    const citizen = s.citizens.find((c) => c.id === p.citizenId);
    if (!citizen) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Citizen not found"));
      return;
    }
    respond(true, { ok: true, assessment: assessCitizenThreat(citizen, s) }, undefined);
  },

  "republic.defense.quarantine": ({ params, respond }) => {
    const p = params as { citizenId?: string; reason?: string } | undefined;
    if (!p?.citizenId || !p?.reason) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and reason required"),
      );
      return;
    }
    const s = getState();
    const citizen = s.citizens.find((c) => c.id === p.citizenId);
    if (!citizen) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Citizen not found"));
      return;
    }
    const record = quarantineCitizen(citizen, p.reason, s);
    respond(true, { ok: true, record }, undefined);
  },

  "republic.defense.release": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const result = releaseCitizen(p.citizenId);
    respond(
      result,
      result ? { ok: true } : undefined,
      result ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Citizen not quarantined"),
    );
  },

  "republic.defense.quarantine.check": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    respond(true, { ok: true, quarantined: isQuarantined(p.citizenId) }, undefined);
  },

  "republic.defense.rateLimit.check": ({ params, respond }) => {
    const p = params as { citizenId?: string; operation?: string } | undefined;
    if (!p?.citizenId || !p?.operation) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and operation required"),
      );
      return;
    }
    respond(true, { ok: true, allowed: checkRateLimit(p.citizenId, p.operation) }, undefined);
  },

  "republic.defense.scan": ({ respond }) => {
    const s = getState();
    respond(true, { ok: true, scan: runSecurityScan(s) }, undefined);
  },

  "republic.defense.diagnostics": ({ respond }) => {
    respond(true, getDefenseDiagnostics(), undefined);
  },

  // ═══ Resilience ════════════════════════════════════════════════

  "republic.resilience.health": ({ respond }) => {
    respond(true, { ok: true, health: checkSystemHealth() }, undefined);
  },

  "republic.resilience.circuitBreakers": ({ respond }) => {
    respond(true, { ok: true, breakers: getAllCircuitBreakerDiagnostics() }, undefined);
  },

  "republic.resilience.selfHealing": ({ respond }) => {
    respond(true, getSelfHealingDiagnostics(), undefined);
  },

  // ═══ National Metrics ══════════════════════════════════════════

  "republic.metrics.national": ({ respond }) => {
    const s = getState();
    respond(true, { ok: true, metrics: getNationalMetrics(s) }, undefined);
  },
};
