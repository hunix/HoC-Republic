/**
 * Republic Gateway Handlers â€” diplomacy
 * Auto-extracted from republic.ts for maintainability.
 */

/**
 * Republic Platform — Gateway RPC Handlers
 *
 * Thin adapter layer that maps JSON-RPC methods to the modular
 * Republic engine. All logic lives in src/republic/*.ts.
 *
 * This file ONLY contains the handler wiring — no types, no business
 * logic, no state management. Just delegation.
 */

import type {
  ConflictResolution,
  ConflictSeverity,
  DiplomacyDomain,
  DiplomacyEventKind,
  TreatyStatus,
  TreatyTerm,
} from "../../../republic/diplomacy.js";
import type { GatewayRequestHandlers } from "../types.js";
import {
  generateIdentityCard,
  generateAppearance,
  generateAvatarSVG,
  generateVoiceProfile,
} from "../../../republic/citizen-identity.js";
import {
  getConflicts,
  getDiplomacyDiagnostics,
  getEvents as getDiplomacyEvents,
  getTreaties,
  proposeTreaty,
  publishEvent,
  registerConflict,
  resolveConflict,
  signTreaty,
  suspendTreaty,
  terminateTreaty,
} from "../../../republic/diplomacy.js";
// Phase 35: Docker Orchestration Engine
// ─── Module Imports ─────────────────────────────────────────────
// Phase 33: Infrastructure Control Plane
import {
  checkEligibility,
  checkInfraHealth,
  discoverRuntimes,
  getInfraDiagnostics,
  getRuntimeStatus,
  lookupModelRequirements,
  probeSystemResources,
  restartRuntime,
  startInfraMonitor,
  startRuntime,
  stopInfraMonitor,
  stopRuntime,
  type RuntimeName,
} from "../../../republic/infra-control-plane.js";
// Phase 34: HuggingFace Model Provisioner
// Phase 37: Database Persistence Layer
import { getState } from "../../../republic/state.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const diplomacyHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Phase 23: Diplomacy & Event Bus ───────────────────────

  "republic.diplomacy.event.publish": ({ params, respond }) => {
    const p = params as
      | {
          kind?: string;
          sourceDomain?: string;
          payload?: Record<string, unknown>;
          citizenId?: string;
        }
      | undefined;
    if (!p?.kind || !p?.sourceDomain) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "kind and sourceDomain required"),
      );
      return;
    }
    const event = publishEvent(
      p.kind as DiplomacyEventKind,
      p.sourceDomain as DiplomacyDomain,
      p.payload ?? {},
      p.citizenId,
    );
    respond(true, { ok: true, event }, undefined);
  },

  "republic.diplomacy.events": ({ params, respond }) => {
    const p = params as { domain?: string; kind?: string; limit?: number } | undefined;
    respond(
      true,
      {
        ok: true,
        events: getDiplomacyEvents({
          domain: p?.domain as DiplomacyDomain | undefined,
          kind: p?.kind as DiplomacyEventKind | undefined,
          limit: p?.limit,
        }),
      },
      undefined,
    );
  },

  "republic.diplomacy.treaty.propose": ({ params, respond }) => {
    const p = params as
      | {
          name?: string;
          partyA?: string;
          partyB?: string;
          terms?: TreatyTerm[];
          proposedBy?: string;
          durationDays?: number;
        }
      | undefined;
    if (!p?.name || !p?.partyA || !p?.partyB || !p?.terms?.length) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "name, partyA, partyB, and terms required"),
      );
      return;
    }
    const treaty = proposeTreaty(
      p.name,
      p.partyA as DiplomacyDomain,
      p.partyB as DiplomacyDomain,
      p.terms,
      p.proposedBy ?? "system",
      p.durationDays,
    );
    respond(true, { ok: true, treaty }, undefined);
  },

  "republic.diplomacy.treaty.sign": ({ params, respond }) => {
    const p = params as { treatyId?: string } | undefined;
    if (!p?.treatyId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "treatyId required"));
      return;
    }
    const treaty = signTreaty(p.treatyId);
    respond(
      !!treaty,
      treaty ? { ok: true, treaty } : undefined,
      treaty
        ? undefined
        : errorShape(ErrorCodes.NOT_FOUND, "Treaty not found or not in proposed status"),
    );
  },

  "republic.diplomacy.treaty.suspend": ({ params, respond }) => {
    const p = params as { treatyId?: string; reason?: string } | undefined;
    if (!p?.treatyId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "treatyId required"));
      return;
    }
    const treaty = suspendTreaty(p.treatyId, p.reason ?? "unspecified");
    respond(
      !!treaty,
      treaty ? { ok: true, treaty } : undefined,
      treaty ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Treaty not found or not active"),
    );
  },

  "republic.diplomacy.treaty.terminate": ({ params, respond }) => {
    const p = params as { treatyId?: string } | undefined;
    if (!p?.treatyId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "treatyId required"));
      return;
    }
    const treaty = terminateTreaty(p.treatyId);
    respond(
      !!treaty,
      treaty ? { ok: true, treaty } : undefined,
      treaty ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Treaty not found"),
    );
  },

  "republic.diplomacy.treaties": ({ params, respond }) => {
    const p = params as { status?: string; domain?: string } | undefined;
    respond(
      true,
      {
        ok: true,
        treaties: getTreaties({
          status: p?.status as TreatyStatus | undefined,
          domain: p?.domain as DiplomacyDomain | undefined,
        }),
      },
      undefined,
    );
  },

  "republic.diplomacy.conflict.register": ({ params, respond }) => {
    const p = params as
      | { domainA?: string; domainB?: string; description?: string; severity?: string }
      | undefined;
    if (!p?.domainA || !p?.domainB || !p?.description) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "domainA, domainB, and description required"),
      );
      return;
    }
    const conflict = registerConflict(
      p.domainA as DiplomacyDomain,
      p.domainB as DiplomacyDomain,
      p.description,
      (p.severity as ConflictSeverity) ?? "medium",
    );
    respond(true, { ok: true, conflict }, undefined);
  },

  "republic.diplomacy.conflict.resolve": ({ params, respond }) => {
    const p = params as { conflictId?: string; resolution?: string } | undefined;
    if (!p?.conflictId || !p?.resolution) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "conflictId and resolution required"),
      );
      return;
    }
    const conflict = resolveConflict(p.conflictId, p.resolution as ConflictResolution);
    respond(
      !!conflict,
      conflict ? { ok: true, conflict } : undefined,
      conflict
        ? undefined
        : errorShape(ErrorCodes.NOT_FOUND, "Conflict not found or already resolved"),
    );
  },

  "republic.diplomacy.conflicts": ({ params, respond }) => {
    const p = params as { resolved?: boolean; severity?: string; domain?: string } | undefined;
    respond(
      true,
      {
        ok: true,
        conflicts: getConflicts({
          resolved: p?.resolved,
          severity: p?.severity as ConflictSeverity | undefined,
          domain: p?.domain as DiplomacyDomain | undefined,
        }),
      },
      undefined,
    );
  },

  "republic.diplomacy.diagnostics": ({ respond }) => {
    respond(true, getDiplomacyDiagnostics(), undefined);
  },

  // ─── Phase 27: Citizen Identity & Avatar ─────────────────────
  "republic.citizen.identity": ({ params, respond }) => {
    const p = params as { citizenId: string } | undefined;
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
    respond(true, { ok: true, identity: generateIdentityCard(citizen) }, undefined);
  },

  "republic.citizen.avatar.svg": ({ params, respond }) => {
    const p = params as { citizenId: string } | undefined;
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
    const appearance = citizen.appearance ?? generateAppearance(citizen.id);
    respond(true, { ok: true, svg: generateAvatarSVG(appearance) }, undefined);
  },

  "republic.citizen.voice": ({ params, respond }) => {
    const p = params as { citizenId: string } | undefined;
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
    const voice = citizen.voiceProfile ?? generateVoiceProfile(citizen.id, citizen.personality);
    respond(true, { ok: true, voice }, undefined);
  },

  // ─── Phase 33: Infrastructure Control Plane ──────────────────

  "republic.infra.probe": async ({ respond }) => {
    const resources = await probeSystemResources();
    respond(true, { ok: true, resources }, undefined);
  },

  "republic.infra.runtimes": async ({ respond }) => {
    const runtimes = await discoverRuntimes();
    respond(true, { ok: true, runtimes }, undefined);
  },

  "republic.infra.runtime.start": async ({ params, respond }) => {
    const p = params as { name: string } | undefined;
    if (!p?.name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name required"));
      return;
    }
    const result = await startRuntime(p.name as RuntimeName);
    respond(true, { ok: result }, undefined);
  },

  "republic.infra.runtime.stop": async ({ params, respond }) => {
    const p = params as { name: string } | undefined;
    if (!p?.name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name required"));
      return;
    }
    const result = await stopRuntime(p.name as RuntimeName);
    respond(true, { ok: result }, undefined);
  },

  "republic.infra.runtime.restart": async ({ params, respond }) => {
    const p = params as { name: string } | undefined;
    if (!p?.name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name required"));
      return;
    }
    const result = await restartRuntime(p.name as RuntimeName);
    respond(true, { ok: result }, undefined);
  },

  "republic.infra.runtime.status": ({ params, respond }) => {
    const p = params as { name: string } | undefined;
    if (!p?.name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name required"));
      return;
    }
    const status = getRuntimeStatus(p.name as RuntimeName);
    respond(true, { ok: true, status }, undefined);
  },

  "republic.infra.eligibility": async ({ params, respond }) => {
    const p = params as { model: string; quantization?: string } | undefined;
    if (!p?.model) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "model required"));
      return;
    }
    const requirements = lookupModelRequirements(p.model, p.quantization);
    if (!requirements) {
      respond(
        true,
        {
          ok: true,
          eligible: false,
          reasons: ["Model not in catalog"],
          recommendation: "Model not found in built-in catalog",
        },
        undefined,
      );
      return;
    }
    const result = await checkEligibility(requirements);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.infra.requirements": ({ params, respond }) => {
    const p = params as { model: string } | undefined;
    if (!p?.model) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "model required"));
      return;
    }
    const requirements = lookupModelRequirements(p.model);
    respond(true, { ok: true, requirements }, undefined);
  },

  "republic.infra.health.check": async ({ respond }) => {
    const health = await checkInfraHealth();
    respond(true, { ok: true, health }, undefined);
  },

  "republic.infra.monitor.start": ({ respond }) => {
    startInfraMonitor();
    respond(true, { ok: true }, undefined);
  },

  "republic.infra.monitor.stop": ({ respond }) => {
    stopInfraMonitor();
    respond(true, { ok: true }, undefined);
  },

  "republic.infra.controlplane.diagnostics": ({ respond }) => {
    const diag = getInfraDiagnostics();
    respond(true, { ok: true, ...diag }, undefined);
  },

  // ─── Phase 34: Model Provisioner ─────────────────────────────
};
