/**
 * Reverse Engineering Division — RPC Handlers
 *
 * Exposes RE specialists, curriculum, projects, and mastery through gateway RPCs.
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  getRESpecializations,
  getRESpecialization,
  getREProjects,
  getREProject,
  getREMastery,
  getRECurriculum,
  getRECourse,
  getREDivisionStatus,
  startREProject,
  addREFinding,
  advancePhase,
  recordMastery,
} from "../../../republic/reverse-engineering.js";

export const reverseEngineeringHandlers: Partial<GatewayRequestHandlers> = {
  /** Get all RE specialists */
  "republic.re.specialists": ({ respond }) => {
    const specs = getRESpecializations();
    respond(true, { specialists: specs, total: specs.length }, undefined);
  },

  /** Get a specific RE specialist by id */
  "republic.re.specialist": ({ params, respond }) => {
    const p = (params ?? {}) as { id?: string };
    if (!p.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const spec = getRESpecialization(p.id);
    if (!spec) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Specialist not found: ${p.id}`));
      return;
    }
    respond(true, { specialist: spec }, undefined);
  },

  /** Get RE division status overview */
  "republic.re.status": ({ respond }) => {
    const status = getREDivisionStatus();
    respond(true, status, undefined);
  },

  /** Get the full RE curriculum */
  "republic.re.curriculum": ({ respond }) => {
    const courses = getRECurriculum();
    respond(true, { courses, total: courses.length }, undefined);
  },

  /** Get a specific course */
  "republic.re.course": ({ params, respond }) => {
    const p = (params ?? {}) as { id?: string };
    if (!p.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const course = getRECourse(p.id);
    if (!course) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Course not found: ${p.id}`));
      return;
    }
    respond(true, { course }, undefined);
  },

  /** Start a new RE project */
  "republic.re.project.start": ({ params, respond }) => {
    const p = (params ?? {}) as {
      specialistId?: string;
      targetName?: string;
      targetType?: string;
    };
    if (!p.specialistId || !p.targetName || !p.targetType) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "specialistId, targetName, and targetType required"));
      return;
    }
    const project = startREProject(
      p.specialistId,
      p.targetName,
      p.targetType as "binary" | "firmware" | "protocol" | "hardware" | "device" | "network" | "driver" | "os-component",
    );
    respond(true, { project }, undefined);
  },

  /** List RE projects */
  "republic.re.projects": ({ params, respond }) => {
    const p = (params ?? {}) as { limit?: number };
    const projects = getREProjects(p.limit ?? 50);
    respond(true, { projects, total: projects.length }, undefined);
  },

  /** Get a specific RE project */
  "republic.re.project": ({ params, respond }) => {
    const p = (params ?? {}) as { id?: string };
    if (!p.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const project = getREProject(p.id);
    if (!project) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Project not found: ${p.id}`));
      return;
    }
    respond(true, { project }, undefined);
  },

  /** Add a finding to an RE project */
  "republic.re.finding.add": ({ params, respond }) => {
    const p = (params ?? {}) as {
      projectId?: string;
      type?: string;
      title?: string;
      description?: string;
      evidence?: string;
      severity?: string;
    };
    if (!p.projectId || !p.type || !p.title || !p.description) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId, type, title, description required"));
      return;
    }
    const finding = addREFinding(p.projectId, {
      type: p.type as "vulnerability" | "architecture" | "protocol-spec" | "firmware-map" | "api-surface" | "secret" | "backdoor" | "undocumented-feature",
      title: p.title,
      description: p.description,
      evidence: p.evidence ?? "",
      severity: p.severity as "informational" | "low" | "medium" | "high" | "critical" | undefined,
    });
    if (!finding) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Project not found"));
      return;
    }
    respond(true, { finding }, undefined);
  },

  /** Advance a project phase */
  "republic.re.phase.advance": ({ params, respond }) => {
    const p = (params ?? {}) as { projectId?: string; phaseName?: string };
    if (!p.projectId || !p.phaseName) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId and phaseName required"));
      return;
    }
    const ok = advancePhase(p.projectId, p.phaseName);
    if (!ok) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Project or phase not found"));
      return;
    }
    const project = getREProject(p.projectId);
    respond(true, { project }, undefined);
  },

  /** Record mastery achievement */
  "republic.re.mastery.record": ({ params, respond }) => {
    const p = (params ?? {}) as {
      specialistId?: string;
      domain?: string;
      level?: string;
      proof?: string;
    };
    if (!p.specialistId || !p.domain || !p.level || !p.proof) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "specialistId, domain, level, proof required"));
      return;
    }
    const record = recordMastery(
      p.specialistId,
      p.domain,
      p.level as "novice" | "apprentice" | "practitioner" | "expert" | "master",
      p.proof,
    );
    respond(true, { mastery: record }, undefined);
  },

  /** Get mastery records */
  "republic.re.mastery": ({ params, respond }) => {
    const p = (params ?? {}) as { specialistId?: string };
    const records = getREMastery(p.specialistId);
    respond(true, { records, total: records.length }, undefined);
  },
};
