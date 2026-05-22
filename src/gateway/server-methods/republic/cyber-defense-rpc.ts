/**
 * Cyber Defense RPC Handlers — Phase 2: Fortress Republic
 * republic.cyber.defense.*
 *
 * Active defense, counter-strike, security labs, honeypots,
 * perimeter scanning, playbooks, war gaming, SIGINT, education.
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  getDefenseStatus,
  getAllThreats,
  containThreat,
  resolveThreat,
  respondToThreat,
  reportThreat,
  generateCounterPlan,
  getCounterPlans,
  authorizeCounterPlan,
  abortCounterPlan,
  launchSecurityLab,
  listSecurityLabs,
  destroySecurityLab,
  execInLab,
  getAvailableLabPresets,
  deployHoneypot,
  listHoneypots,
  deactivateHoneypot,
  runPerimeterScan,
  getScanHistory,
  getPlaybooks,
  executePlaybook,
  getPlaybookExecutions,
  launchWarGame,
  getWarGames,
  getClusterSecurityStatus,
  getCyberCurriculum,
  getCyberCourse,
} from "../../../republic/cyber-defense.js";

export const cyberDefenseHandlers: Partial<GatewayRequestHandlers> = {

  /** Overall defense posture and status */
  "republic.cyber.defense.status": ({ respond }) => {
    respond(true, getDefenseStatus(), undefined);
  },

  /** List all threats */
  "republic.cyber.defense.threats": ({ params, respond }) => {
    const p = params as { limit?: number } | null;
    respond(true, { threats: getAllThreats(p?.limit ?? 50) }, undefined);
  },

  /** Report a new threat */
  "republic.cyber.defense.report": ({ params, respond }) => {
    const p = params as {
      type?: string; severity?: string; source?: string;
      target?: string; description?: string; indicators?: string[];
      mitreTactics?: string[];
    } | null;
    if (!p?.type || !p?.severity || !p?.source || !p?.target || !p?.description) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "type, severity, source, target, description required"));
      return;
    }
    const threat = reportThreat(
      p.type as Parameters<typeof reportThreat>[0],
      p.severity as Parameters<typeof reportThreat>[1],
      p.source,
      p.target,
      p.description,
      p.indicators,
      p.mitreTactics,
    );
    respond(true, threat, undefined);
  },

  /** Respond to a threat with an action */
  "republic.cyber.defense.respond": ({ params, respond }) => {
    const p = params as { threatId?: string; action?: string } | null;
    if (!p?.threatId || !p?.action) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "threatId and action required"));
      return;
    }
    const threat = respondToThreat(p.threatId, p.action);
    if (!threat) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Threat ${p.threatId} not found`));
      return;
    }
    respond(true, threat, undefined);
  },

  /** Contain a threat */
  "republic.cyber.defense.contain": ({ params, respond }) => {
    const p = params as { threatId?: string } | null;
    if (!p?.threatId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "threatId required"));
      return;
    }
    const threat = containThreat(p.threatId);
    if (!threat) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Threat ${p.threatId} not found`));
      return;
    }
    respond(true, threat, undefined);
  },

  /** Resolve a threat */
  "republic.cyber.defense.resolve": ({ params, respond }) => {
    const p = params as { threatId?: string; resolution?: string } | null;
    if (!p?.threatId || !p?.resolution) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "threatId and resolution required"));
      return;
    }
    const threat = resolveThreat(p.threatId, p.resolution);
    if (!threat) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Threat ${p.threatId} not found`));
      return;
    }
    respond(true, threat, undefined);
  },

  /** Generate a counter-strike plan for a threat */
  "republic.cyber.defense.counter-plan": ({ params, respond }) => {
    const p = params as { threatId?: string; specialistId?: string } | null;
    if (!p?.threatId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "threatId required"));
      return;
    }
    generateCounterPlan(p.threatId, p.specialistId)
      .then((plan) => respond(true, plan, undefined))
      .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err))));
  },

  /** List counter-strike plans */
  "republic.cyber.defense.counter-plans": ({ params, respond }) => {
    const p = params as { limit?: number } | null;
    respond(true, { plans: getCounterPlans(p?.limit ?? 20) }, undefined);
  },

  /** Authorize a counter-strike plan */
  "republic.cyber.defense.counter-authorize": ({ params, respond }) => {
    const p = params as { planId?: string } | null;
    if (!p?.planId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "planId required"));
      return;
    }
    const plan = authorizeCounterPlan(p.planId);
    if (!plan) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Plan ${p.planId} not found`));
      return;
    }
    respond(true, plan, undefined);
  },

  /** Abort a counter-strike plan */
  "republic.cyber.defense.counter-abort": ({ params, respond }) => {
    const p = params as { planId?: string } | null;
    if (!p?.planId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "planId required"));
      return;
    }
    const plan = abortCounterPlan(p.planId);
    if (!plan) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Plan ${p.planId} not found`));
      return;
    }
    respond(true, plan, undefined);
  },

  /** List available security lab presets */
  "republic.cyber.defense.labs": ({ respond }) => {
    respond(true, {
      presets: getAvailableLabPresets(),
      active: listSecurityLabs(),
    }, undefined);
  },

  /** Launch a security lab */
  "republic.cyber.defense.lab.launch": ({ params, respond }) => {
    const p = params as { preset?: string; purpose?: string; createdBy?: string } | null;
    if (!p?.preset || !p?.purpose) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "preset and purpose required"));
      return;
    }
    launchSecurityLab(p.preset, p.purpose, p.createdBy)
      .then((lab) => respond(true, lab, undefined))
      .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err))));
  },

  /** Destroy a security lab */
  "republic.cyber.defense.lab.destroy": ({ params, respond }) => {
    const p = params as { labId?: string } | null;
    if (!p?.labId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "labId required"));
      return;
    }
    destroySecurityLab(p.labId)
      .then((ok) => {
        if (ok) { respond(true, { ok: true }, undefined); }
        else { respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Lab ${p.labId} not found`)); }
      })
      .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err))));
  },

  /** Execute a command inside a security lab */
  "republic.cyber.defense.lab.exec": ({ params, respond }) => {
    const p = params as { labId?: string; command?: string } | null;
    if (!p?.labId || !p?.command) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "labId and command required"));
      return;
    }
    try {
      const output = execInLab(p.labId, p.command);
      respond(true, { output }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)));
    }
  },

  /** Deploy a honeypot */
  "republic.cyber.defense.honeypot.deploy": ({ params, respond }) => {
    const p = params as { type?: string; port?: number; description?: string } | null;
    if (!p?.type || !p?.port || !p?.description) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "type, port, description required"));
      return;
    }
    const hp = deployHoneypot(
      p.type as Parameters<typeof deployHoneypot>[0],
      p.port,
      p.description,
    );
    respond(true, hp, undefined);
  },

  /** List honeypots */
  "republic.cyber.defense.honeypot.list": ({ respond }) => {
    respond(true, { honeypots: listHoneypots() }, undefined);
  },

  /** Deactivate a honeypot */
  "republic.cyber.defense.honeypot.deactivate": ({ params, respond }) => {
    const p = params as { honeypotId?: string } | null;
    if (!p?.honeypotId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "honeypotId required"));
      return;
    }
    const ok = deactivateHoneypot(p.honeypotId);
    respond(ok, ok ? { ok: true } : undefined, ok ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Honeypot not found"));
  },

  /** Run a perimeter/network scan */
  "republic.cyber.defense.scan": ({ params, respond }) => {
    const p = params as { scanType?: string; target?: string } | null;
    if (!p?.scanType || !p?.target) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "scanType and target required"));
      return;
    }
    runPerimeterScan(p.scanType as Parameters<typeof runPerimeterScan>[0], p.target)
      .then((result) => respond(true, result, undefined))
      .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err))));
  },

  /** Scan history */
  "republic.cyber.defense.scans": ({ params, respond }) => {
    const p = params as { limit?: number } | null;
    respond(true, { scans: getScanHistory(p?.limit ?? 20) }, undefined);
  },

  // ═══ Phase 2: Playbooks, War Games, SIGINT, Curriculum ═════════

  /** List NIST 800-61 incident response playbooks */
  "republic.cyber.defense.playbooks": ({ respond }) => {
    respond(true, { playbooks: getPlaybooks() }, undefined);
  },

  /** Execute a playbook against a threat */
  "republic.cyber.defense.playbook.execute": ({ params, respond }) => {
    const p = params as { threatId?: string; playbookId?: string } | null;
    if (!p?.threatId || !p?.playbookId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "threatId and playbookId required"));
      return;
    }
    try {
      const execution = executePlaybook(p.threatId, p.playbookId);
      respond(true, execution, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)));
    }
  },

  /** Playbook execution history */
  "republic.cyber.defense.playbook.history": ({ params, respond }) => {
    const p = params as { limit?: number } | null;
    respond(true, { executions: getPlaybookExecutions(p?.limit ?? 20) }, undefined);
  },

  /** Launch a war game (red team vs blue team exercise) */
  "republic.cyber.defense.wargame.launch": ({ params, respond }) => {
    const p = params as { scenario?: string; attackerSpecId?: string; defenderSpecId?: string } | null;
    if (!p?.scenario) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "scenario required"));
      return;
    }
    launchWarGame(p.scenario, p.attackerSpecId, p.defenderSpecId)
      .then((wg) => respond(true, wg, undefined))
      .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err))));
  },

  /** War game history */
  "republic.cyber.defense.wargame.history": ({ params, respond }) => {
    const p = params as { limit?: number } | null;
    respond(true, { warGames: getWarGames(p?.limit ?? 20) }, undefined);
  },

  /** Cluster SIGINT / security node status */
  "republic.cyber.defense.sigint": ({ respond }) => {
    respond(true, getClusterSecurityStatus(), undefined);
  },

  /** Cybersecurity education curriculum */
  "republic.cyber.defense.curriculum": ({ respond }) => {
    respond(true, { courses: getCyberCurriculum() }, undefined);
  },

  /** Get individual course details */
  "republic.cyber.defense.curriculum.course": ({ params, respond }) => {
    const p = params as { courseId?: string } | null;
    if (!p?.courseId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "courseId required"));
      return;
    }
    const course = getCyberCourse(p.courseId);
    if (!course) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Course ${p.courseId} not found`));
      return;
    }
    respond(true, course, undefined);
  },
};
