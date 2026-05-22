/**
 * Republic Platform — HR Department RPC Handlers
 *
 * ~30 RPC methods covering job catalog, competency assessment,
 * OKRs, payroll, labor law, and organizational structure.
 */

import type { GatewayRequestHandlers } from "../types.js";
import { getState } from "../../../republic/state.js";

// ── Job Catalog ──
import {
  getAllJobDescriptions, getJobDescriptionById, getJobsByDepartment,
  getDepartments, getDivisions, getJobCatalogStats,
} from "../../../republic/hr-job-catalog.js";

// ── Competency & Assessment ──
import {
  assessCitizen, assessCitizenForJob, getCompetencyGap,
  generateQualificationReport, getAllCompetencyDefinitions,
  getCompetenciesByCategory, getAssessmentHistory, getCompetencyDiagnostics,
} from "../../../republic/hr-competency.js";

// ── OKRs ──
import {
  createOKR, updateKeyResult, generateCitizenOKRs,
  generateDepartmentOKRs, getOKRs, getCitizenOKRs, getOKRById,
  getOKRDiagnostics,
} from "../../../republic/hr-okr.js";

// ── Payroll ──
import {
  calculateSalary, processPayroll, getCitizenPayslips,
  getPayrollCycles, getPayrollDiagnostics,
} from "../../../republic/hr-payroll.js";

// ── Labor Law ──
import {
  checkCompliance, fileGrievance, resolveGrievance, resolveViolation,
  getViolations, getGrievances, getLaborPolicy, updateLaborPolicy,
  getLaborDiagnostics,
} from "../../../republic/hr-labor-law.js";

// ── Org Structure ──
import {
  autoAssignPositions, assignPosition, unassignPosition,
  getOrgStructure, getAllPositions, getVacantPositions,
  getOrgDiagnostics,
} from "../../../republic/hr-org-structure.js";

export const hrHandlers: GatewayRequestHandlers = {
  // ─── Overview ──────────────────────────────────────────────────
  "republic.hr.overview": ({ respond }) => {
    const s = getState();
    respond(true, {
      jobCatalog: getJobCatalogStats(),
      competencies: getCompetencyDiagnostics(s),
      okrs: getOKRDiagnostics(s),
      payroll: getPayrollDiagnostics(s),
      labor: getLaborDiagnostics(s),
      orgStructure: getOrgDiagnostics(s),
    });
  },

  // ─── Job Catalog ───────────────────────────────────────────────
  "republic.hr.jd.list": ({ params, respond }) => {
    const { department } = params as { department?: string };
    const jobs = department ? getJobsByDepartment(department) : getAllJobDescriptions();
    respond(true, { items: jobs, total: jobs.length });
  },

  "republic.hr.jd.get": ({ params, respond }) => {
    const { id } = params as { id: string };
    if (!id) { throw new Error("Missing id parameter"); }
    const jd = getJobDescriptionById(id);
    if (!jd) { throw new Error(`Job description ${id} not found`); }
    respond(true, jd);
  },

  "republic.hr.departments": ({ respond }) => {
    respond(true, { departments: getDepartments(), divisions: getDivisions() });
  },

  // ─── Competency ────────────────────────────────────────────────
  "republic.hr.competency.list": ({ params, respond }) => {
    const { category } = params as { category?: "technical" | "behavioral" | "leadership" };
    const competencies = category ? getCompetenciesByCategory(category) : getAllCompetencyDefinitions();
    respond(true, { items: competencies, total: competencies.length });
  },

  "republic.hr.competency.assess": ({ params, respond }) => {
    const { citizenId, competencyId, difficulty } = params as {
      citizenId: string; competencyId: string; difficulty?: 1|2|3|4|5;
    };
    if (!citizenId || !competencyId) { throw new Error("Missing citizenId or competencyId"); }
    const s = getState();
    respond(true, assessCitizen(s, citizenId, competencyId, difficulty));
  },

  "republic.hr.competency.assessForJob": ({ params, respond }) => {
    const { citizenId, jobDescriptionId } = params as { citizenId: string; jobDescriptionId: string };
    if (!citizenId || !jobDescriptionId) { throw new Error("Missing citizenId or jobDescriptionId"); }
    const s = getState();
    respond(true, { items: assessCitizenForJob(s, citizenId, jobDescriptionId) });
  },

  "republic.hr.competency.gap": ({ params, respond }) => {
    const { citizenId, jobDescriptionId } = params as { citizenId: string; jobDescriptionId: string };
    if (!citizenId || !jobDescriptionId) { throw new Error("Missing citizenId or jobDescriptionId"); }
    const s = getState();
    respond(true, { items: getCompetencyGap(s, citizenId, jobDescriptionId) });
  },

  "republic.hr.competency.qualify": ({ params, respond }) => {
    const { citizenId, jobDescriptionId } = params as { citizenId: string; jobDescriptionId: string };
    if (!citizenId || !jobDescriptionId) { throw new Error("Missing citizenId or jobDescriptionId"); }
    const s = getState();
    respond(true, generateQualificationReport(s, citizenId, jobDescriptionId));
  },

  "republic.hr.assessment.history": ({ params, respond }) => {
    const { citizenId } = params as { citizenId: string };
    if (!citizenId) { throw new Error("Missing citizenId"); }
    const s = getState();
    respond(true, { items: getAssessmentHistory(s, citizenId) });
  },

  // ─── OKRs ─────────────────────────────────────────────────────
  "republic.hr.okr.list": ({ params, respond }) => {
    const { type } = params as { type?: "citizen" | "department" | "republic" };
    const s = getState();
    const okrs = getOKRs(s, type);
    respond(true, { items: okrs, total: okrs.length });
  },

  "republic.hr.okr.get": ({ params, respond }) => {
    const { id } = params as { id: string };
    if (!id) { throw new Error("Missing id"); }
    const s = getState();
    const okr = getOKRById(s, id);
    if (!okr) { throw new Error(`OKR ${id} not found`); }
    respond(true, okr);
  },

  "republic.hr.okr.create": ({ params, respond }) => {
    const { type, ownerId, ownerName, objective, keyResults } = params as {
      type: "citizen" | "department" | "republic";
      ownerId: string; ownerName: string; objective: string;
      keyResults: Array<{ description: string; target: number; current: number; unit: string; weight: number }>;
    };
    const s = getState();
    respond(true, createOKR(s, type, ownerId, ownerName, objective, keyResults));
  },

  "republic.hr.okr.updateKR": ({ params, respond }) => {
    const { okrId, krId, current } = params as { okrId: string; krId: string; current: number };
    const s = getState();
    const okr = updateKeyResult(s, okrId, krId, current);
    if (!okr) { throw new Error("OKR or Key Result not found"); }
    respond(true, okr);
  },

  "republic.hr.okr.generate": ({ params, respond }) => {
    const { citizenId } = params as { citizenId?: string };
    const s = getState();
    if (citizenId) {
      const okr = generateCitizenOKRs(s, citizenId);
      respond(true, { generated: okr ? 1 : 0, okr });
      return;
    }
    const okrs = generateDepartmentOKRs(s);
    respond(true, { generated: okrs.length, items: okrs });
  },

  "republic.hr.okr.citizen": ({ params, respond }) => {
    const { citizenId } = params as { citizenId: string };
    if (!citizenId) { throw new Error("Missing citizenId"); }
    const s = getState();
    respond(true, { items: getCitizenOKRs(s, citizenId) });
  },

  // ─── Payroll ──────────────────────────────────────────────────
  "republic.hr.payroll.status": ({ respond }) => {
    const s = getState();
    respond(true, getPayrollDiagnostics(s));
  },

  "republic.hr.payroll.run": ({ respond }) => {
    const s = getState();
    respond(true, processPayroll(s));
  },

  "republic.hr.payroll.history": ({ respond }) => {
    const s = getState();
    respond(true, { items: getPayrollCycles(s) });
  },

  "republic.hr.payroll.citizen": ({ params, respond }) => {
    const { citizenId } = params as { citizenId: string };
    if (!citizenId) { throw new Error("Missing citizenId"); }
    const s = getState();
    const citizen = s.citizens.find((c) => c.id === citizenId);
    const salary = calculateSalary(citizen ?? { specialization: "Generalist", skills: [] } as Parameters<typeof calculateSalary>[0], s);
    respond(true, { salary, payslips: getCitizenPayslips(s, citizenId) });
  },

  // ─── Labor Law ────────────────────────────────────────────────
  "republic.hr.labor.compliance": ({ respond }) => {
    const s = getState();
    respond(true, getLaborDiagnostics(s));
  },

  "republic.hr.labor.violations": ({ params, respond }) => {
    const { unresolved } = params as { unresolved?: boolean };
    const s = getState();
    const violations = getViolations(s, unresolved);
    respond(true, { items: violations, total: violations.length });
  },

  "republic.hr.labor.check": ({ respond }) => {
    const s = getState();
    const newViolations = checkCompliance(s);
    respond(true, { newViolations: newViolations.length, items: newViolations });
  },

  "republic.hr.labor.grievance.file": ({ params, respond }) => {
    const { filedBy, subject, description, against, priority } = params as {
      filedBy: string; subject: string; description: string; against?: string; priority?: "low" | "medium" | "high";
    };
    const s = getState();
    respond(true, fileGrievance(s, filedBy, subject, description, against, priority));
  },

  "republic.hr.labor.grievance.resolve": ({ params, respond }) => {
    const { grievanceId, resolution, dismissed } = params as { grievanceId: string; resolution: string; dismissed?: boolean };
    const s = getState();
    const g = resolveGrievance(s, grievanceId, resolution, dismissed);
    if (!g) { throw new Error("Grievance not found"); }
    respond(true, g);
  },

  "republic.hr.labor.grievances": ({ params, respond }) => {
    const { status } = params as { status?: "open" | "investigating" | "resolved" | "dismissed" };
    const s = getState();
    respond(true, { items: getGrievances(s, status) });
  },

  "republic.hr.labor.policy": ({ respond }) => {
    const s = getState();
    respond(true, getLaborPolicy(s));
  },

  "republic.hr.labor.policy.update": ({ params, respond }) => {
    const s = getState();
    respond(true, updateLaborPolicy(s, params as Record<string, unknown>));
  },

  "republic.hr.labor.violation.resolve": ({ params, respond }) => {
    const { violationId, action } = params as { violationId: string; action: string };
    const s = getState();
    const ok = resolveViolation(s, violationId, action);
    if (!ok) { throw new Error("Violation not found"); }
    respond(true, { resolved: true });
  },

  // ─── Org Structure ────────────────────────────────────────────
  "republic.hr.org.structure": ({ respond }) => {
    const s = getState();
    respond(true, { departments: getOrgStructure(s) });
  },

  "republic.hr.org.positions": ({ params, respond }) => {
    const { vacantOnly } = params as { vacantOnly?: boolean };
    const s = getState();
    const positions = vacantOnly ? getVacantPositions(s) : getAllPositions(s);
    respond(true, { items: positions, total: positions.length });
  },

  "republic.hr.org.assign": ({ params, respond }) => {
    const { positionId, citizenId } = params as { positionId: string; citizenId: string };
    if (!positionId || !citizenId) { throw new Error("Missing positionId or citizenId"); }
    const s = getState();
    const ok = assignPosition(s, positionId, citizenId);
    if (!ok) { throw new Error("Assignment failed"); }
    respond(true, { assigned: true });
  },

  "republic.hr.org.unassign": ({ params, respond }) => {
    const { positionId } = params as { positionId: string };
    if (!positionId) { throw new Error("Missing positionId"); }
    const s = getState();
    const ok = unassignPosition(s, positionId);
    if (!ok) { throw new Error("Position not found"); }
    respond(true, { unassigned: true });
  },

  "republic.hr.org.autoAssign": ({ respond }) => {
    const s = getState();
    const assigned = autoAssignPositions(s);
    respond(true, { assigned, diagnostics: getOrgDiagnostics(s) });
  },

  "republic.hr.org.diagnostics": ({ respond }) => {
    const s = getState();
    respond(true, getOrgDiagnostics(s));
  },
};
