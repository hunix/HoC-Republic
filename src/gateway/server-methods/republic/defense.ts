/**
 * Republic Gateway Handlers — Defense System
 *
 * Exposes the Republic Defense System via RPC:
 *   - Threat intelligence fusion (posture, threats, citizen profiles)
 *   - Behavioral baselines (anomaly detection)
 *   - Breach & Attack Simulation (scenarios, exercises)
 *   - Device fleet management
 *   - Counter-intelligence operations
 *   - Red team corps management
 */

import {
  getRepublicThreatPosture,
  getActiveThreats,
  getCitizenThreatProfile,
  ingestThreatFeed,
  correlateCitizenThreats,
  getFusionReports,
  getRepublicPlatforms,
  generateFusionReport,
} from "../../../republic/defense/threat-intel-fusion.js";

import {
  getBaselineDiagnostics,
  getCitizenBaseline,
  getAnomalyLog,
} from "../../../republic/defense/behavioral-baseline.js";

import {
  getBASOverview,
  getScenarios,
  registerScenario,
  simulateScenario,
  markPatched,
  validatePatch,
  runExercise,
  getExerciseHistory,
} from "../../../republic/defense/bas-engine.js";

import {
  getFleetOverview,
  listDevices,
  getDevice,
  getCitizenDevices,
  registerDevice,
  addRemediation,
  markRemediationApplied,
  markRemediationVerified,
} from "../../../republic/defense/citizen-device-registry.js";

import {
  getCIOverview,
  listCanaries,
  deployCanary,
  retireCanary,
  listOperations,
  getOperation,
  createOperation,
  advanceOperation,
  addEvidence,
} from "../../../republic/defense/counter-intel-ops.js";

import {
  getCorpsOverview,
  listUnits,
  getUnit,
  createUnit,
  activateUnit,
  deactivateUnit,
  listSchedules,
  scheduleExercise,
} from "../../../republic/defense/red-team-corps.js";

import { defineHandlers, toHandlerMap } from "../types.js";
import { registryRegister } from "../handler-registry.js";

const defenseDescriptors = defineHandlers({

  // ═══════════════════════════════════════════════════════════════════════════
  // THREAT INTELLIGENCE FUSION
  // ═══════════════════════════════════════════════════════════════════════════

  /** Republic-wide threat posture overview */
  "republic.defense.posture": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, ...getRepublicThreatPosture() }, undefined);
    },
  },

  /** Active threats list with optional filtering */
  "republic.defense.threats.list": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { platform?: string; severity?: string; limit?: number };
      respond(true, { ok: true, threats: getActiveThreats(p) }, undefined);
    },
  },

  /** Per-citizen threat profile */
  "republic.defense.threats.citizen": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string };
      if (!p.citizenId) { respond(true, { ok: false, error: "citizenId required" }, undefined); return; }
      const profile = getCitizenThreatProfile(p.citizenId);
      respond(true, { ok: true, profile }, undefined);
    },
  },

  /** Ingest threat feed (from scheduled scan or manual trigger) */
  "republic.defense.threats.ingest": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { vulns?: unknown[] };
      if (!Array.isArray(p.vulns)) { respond(true, { ok: false, error: "vulns (array) required" }, undefined); return; }
      const result = ingestThreatFeed(p.vulns as Parameters<typeof ingestThreatFeed>[0]);
      respond(true, { ok: true, ...result }, undefined);
    },
  },

  /** Correlate threats for a citizen */
  "republic.defense.threats.correlate": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string; platforms?: string[] };
      if (!p.citizenId) { respond(true, { ok: false, error: "" }, undefined); return; }
      const profile = correlateCitizenThreats(p.citizenId, p.platforms ?? getRepublicPlatforms());
      respond(true, { ok: true, profile }, undefined);
    },
  },

  /** Get fusion reports */
  "republic.defense.fusion.reports": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number };
      respond(true, { ok: true, reports: getFusionReports(p.limit) }, undefined);
    },
  },

  /** Generate a fusion report */
  "republic.defense.fusion.analyze": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as Parameters<typeof generateFusionReport>[0];
      if (!p.title || !p.description) { respond(true, { ok: false, error: "" }, undefined); return; }
      const report = generateFusionReport(p);
      respond(true, { ok: true, report }, undefined);
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BEHAVIORAL BASELINES
  // ═══════════════════════════════════════════════════════════════════════════

  /** Baseline diagnostics overview */
  "republic.defense.baseline.overview": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, ...getBaselineDiagnostics() }, undefined);
    },
  },

  /** Per-citizen baseline */
  "republic.defense.baseline.citizen": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string };
      if (!p.citizenId) { respond(true, { ok: false, error: "" }, undefined); return; }
      respond(true, { ok: true, baseline: getCitizenBaseline(p.citizenId) }, undefined);
    },
  },

  /** Recent anomaly log */
  "republic.defense.anomalies": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string; severity?: string; limit?: number };
      respond(true, { ok: true, anomalies: getAnomalyLog(p) }, undefined);
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BREACH & ATTACK SIMULATION
  // ═══════════════════════════════════════════════════════════════════════════

  /** BAS overview */
  "republic.defense.bas.overview": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, ...getBASOverview() }, undefined);
    },
  },

  /** List attack scenarios */
  "republic.defense.bas.scenarios": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { status?: string; priority?: string; limit?: number };
      respond(true, { ok: true, scenarios: getScenarios(p) }, undefined);
    },
  },

  /** Register a new attack scenario */
  "republic.defense.bas.register": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { cveId?: string; targetPlatform?: string; [k: string]: unknown };
      if (!p.cveId || !p.targetPlatform) { respond(true, { ok: false, error: "" }, undefined); return; }
      const scenario = registerScenario(p as Parameters<typeof registerScenario>[0]);
      respond(true, { ok: true, scenario }, undefined);
    },
  },

  /** Simulate an attack scenario */
  "republic.defense.bas.simulate": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { scenarioId?: string };
      if (!p.scenarioId) { respond(true, { ok: false, error: "" }, undefined); return; }
      const result = simulateScenario(p.scenarioId);
      respond(true, { ok: true, result }, undefined);
    },
  },

  /** Mark scenario as patched */
  "republic.defense.bas.patch": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { scenarioId?: string };
      if (!p.scenarioId) { respond(true, { ok: false, error: "" }, undefined); return; }
      respond(true, { ok: true, patched: markPatched(p.scenarioId) }, undefined);
    },
  },

  /** Validate patch effectiveness */
  "republic.defense.bas.validate": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { scenarioId?: string };
      if (!p.scenarioId) { respond(true, { ok: false, error: "" }, undefined); return; }
      const result = validatePatch(p.scenarioId);
      respond(true, { ok: true, result }, undefined);
    },
  },

  /** Run a red team exercise */
  "republic.defense.bas.exercise": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { name?: string; scenarioIds?: string[]; redTeamUnit?: string[] };
      if (!p.name || !Array.isArray(p.scenarioIds)) { respond(true, { ok: false, error: "" }, undefined); return; }
      const exercise = runExercise({ name: p.name, scenarioIds: p.scenarioIds, redTeamUnit: p.redTeamUnit ?? [] });
      respond(true, { ok: true, exercise }, undefined);
    },
  },

  /** Exercise history */
  "republic.defense.bas.history": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number };
      respond(true, { ok: true, exercises: getExerciseHistory(p.limit) }, undefined);
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVICE FLEET
  // ═══════════════════════════════════════════════════════════════════════════

  /** Fleet overview */
  "republic.defense.fleet.overview": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, ...getFleetOverview() }, undefined);
    },
  },

  /** List devices */
  "republic.defense.fleet.list": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { riskLevel?: string; deviceType?: string; limit?: number };
      respond(true, { ok: true, devices: listDevices(p) }, undefined);
    },
  },

  /** Get specific device */
  "republic.defense.fleet.device": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { deviceId?: string };
      if (!p.deviceId) { respond(true, { ok: false, error: "" }, undefined); return; }
      respond(true, { ok: true, device: getDevice(p.deviceId) }, undefined);
    },
  },

  /** Get citizen's devices */
  "republic.defense.fleet.citizen": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string };
      if (!p.citizenId) { respond(true, { ok: false, error: "" }, undefined); return; }
      respond(true, { ok: true, devices: getCitizenDevices(p.citizenId) }, undefined);
    },
  },

  /** Register a device */
  "republic.defense.fleet.register": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string; osName?: string; [k: string]: unknown };
      if (!p.citizenId || !p.osName) { respond(true, { ok: false, error: "" }, undefined); return; }
      const device = registerDevice(p as Parameters<typeof registerDevice>[0]);
      respond(true, { ok: true, device }, undefined);
    },
  },

  /** Add remediation to device */
  "republic.defense.fleet.remediate": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { deviceId?: string; cveId?: string; patch?: string };
      if (!p.deviceId || !p.cveId) { respond(true, { ok: false, error: "" }, undefined); return; }
      respond(true, { ok: true, added: addRemediation(p.deviceId, p.cveId, p.patch ?? "") }, undefined);
    },
  },

  /** Mark remediation applied */
  "republic.defense.fleet.remediate.apply": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { deviceId?: string; cveId?: string };
      if (!p.deviceId || !p.cveId) { respond(true, { ok: false, error: "" }, undefined); return; }
      respond(true, { ok: true, applied: markRemediationApplied(p.deviceId, p.cveId) }, undefined);
    },
  },

  /** Verify remediation */
  "republic.defense.fleet.remediate.verify": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { deviceId?: string; cveId?: string };
      if (!p.deviceId || !p.cveId) { respond(true, { ok: false, error: "" }, undefined); return; }
      respond(true, { ok: true, verified: markRemediationVerified(p.deviceId, p.cveId) }, undefined);
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // COUNTER-INTELLIGENCE
  // ═══════════════════════════════════════════════════════════════════════════

  /** CI overview */
  "republic.defense.ci.overview": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, ...getCIOverview() }, undefined);
    },
  },

  /** List canaries */
  "republic.defense.ci.canaries": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { status?: string; limit?: number };
      respond(true, { ok: true, canaries: listCanaries(p) }, undefined);
    },
  },

  /** Deploy a canary */
  "republic.defense.ci.canary.deploy": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { type?: string; description?: string; payload?: string; deployedTo?: string[] };
      if (!p.description || !p.payload) { respond(true, { ok: false, error: "" }, undefined); return; }
      const canary = deployCanary({
        type: (p.type ?? "data_fragment") as "document" | "credential" | "endpoint" | "data_fragment",
        description: p.description,
        payload: p.payload,
        deployedTo: p.deployedTo ?? [],
      });
      respond(true, { ok: true, canary }, undefined);
    },
  },

  /** Retire canary */
  "republic.defense.ci.canary.retire": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { canaryId?: string };
      if (!p.canaryId) { respond(true, { ok: false, error: "" }, undefined); return; }
      respond(true, { ok: true, retired: retireCanary(p.canaryId) }, undefined);
    },
  },

  /** List CI operations */
  "republic.defense.ci.operations": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { phase?: string; type?: string; priority?: string; limit?: number };
      respond(true, { ok: true, operations: listOperations(p) }, undefined);
    },
  },

  /** Get specific CI operation */
  "republic.defense.ci.operation": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { opId?: string };
      if (!p.opId) { respond(true, { ok: false, error: "" }, undefined); return; }
      respond(true, { ok: true, operation: getOperation(p.opId) }, undefined);
    },
  },

  /** Create CI operation */
  "republic.defense.ci.operation.create": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as Parameters<typeof createOperation>[0];
      if (!p.type) { respond(true, { ok: false, error: "" }, undefined); return; }
      const op = createOperation(p);
      respond(true, { ok: true, operation: op }, undefined);
    },
  },

  /** Advance CI operation phase */
  "republic.defense.ci.operation.advance": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { opId?: string; findings?: string };
      if (!p.opId) { respond(true, { ok: false, error: "" }, undefined); return; }
      respond(true, { ok: true, advanced: advanceOperation(p.opId, p.findings) }, undefined);
    },
  },

  /** Add evidence to CI operation */
  "republic.defense.ci.operation.evidence": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { opId?: string; type?: string; description?: string; data?: unknown; confidence?: number };
      if (!p.opId || !p.description) { respond(true, { ok: false, error: "" }, undefined); return; }
      respond(true, {
        ok: true,
        added: addEvidence(p.opId, {
          type: (p.type ?? "behavioral") as "anomaly" | "canary_trigger" | "access_violation" | "behavioral" | "external",
          description: p.description,
          data: p.data,
          confidence: p.confidence ?? 0.5,
        }),
      }, undefined);
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RED TEAM CORPS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Corps overview */
  "republic.defense.corps.overview": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, ...getCorpsOverview() }, undefined);
    },
  },

  /** List units */
  "republic.defense.corps.units": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, units: listUnits() }, undefined);
    },
  },

  /** Get specific unit */
  "republic.defense.corps.unit": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { unitId?: string };
      if (!p.unitId) { respond(true, { ok: false, error: "" }, undefined); return; }
      respond(true, { ok: true, unit: getUnit(p.unitId) }, undefined);
    },
  },

  /** Create unit */
  "republic.defense.corps.unit.create": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as Parameters<typeof createUnit>[0];
      if (!p.name || !Array.isArray(p.members)) { respond(true, { ok: false, error: "" }, undefined); return; }
      respond(true, { ok: true, unit: createUnit(p) }, undefined);
    },
  },

  /** Activate unit */
  "republic.defense.corps.unit.activate": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { unitId?: string };
      if (!p.unitId) { respond(true, { ok: false, error: "" }, undefined); return; }
      respond(true, { ok: true, activated: activateUnit(p.unitId) }, undefined);
    },
  },

  /** Deactivate unit */
  "republic.defense.corps.unit.deactivate": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { unitId?: string };
      if (!p.unitId) { respond(true, { ok: false, error: "" }, undefined); return; }
      respond(true, { ok: true, deactivated: deactivateUnit(p.unitId) }, undefined);
    },
  },

  /** List exercise schedules */
  "republic.defense.corps.schedules": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, schedules: listSchedules() }, undefined);
    },
  },

  /** Schedule an exercise */
  "republic.defense.corps.schedule.create": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { unitId?: string; interval?: string; targetPlatforms?: string[] };
      if (!p.unitId) { respond(true, { ok: false, error: "" }, undefined); return; }
      const schedule = scheduleExercise({
        unitId: p.unitId,
        interval: (p.interval ?? "weekly") as "daily" | "weekly" | "monthly",
        targetPlatforms: p.targetPlatforms ?? [],
      });
      respond(true, { ok: true, schedule }, undefined);
    },
  },
});

export const defenseHandlers = toHandlerMap(defenseDescriptors);
registryRegister(defenseDescriptors);
