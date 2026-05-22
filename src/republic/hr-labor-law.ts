/**
 * Republic Platform — HR Labor Law & Compliance Engine
 *
 * Rules governing all citizen-workers:
 * - Work-hour limits (max ticks in "Working" activity per cycle)
 * - Mandatory rest (minimum "Sleeping"/"Resting" ratio)
 * - Education mandates (courses per quarter)
 * - Grievance system
 * - Compliance scanning and violation tracking
 *
 * Persisted on RepublicState.hrLaborLaw.
 */

import type { RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface LaborViolation {
  id: string;
  citizenId: string;
  citizenName: string;
  type: "overwork" | "no-rest" | "education-deficit" | "safety" | "other";
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  detectedAt: string;
  resolved: boolean;
  resolvedAt?: string;
  correctionAction?: string;
}

export interface Grievance {
  id: string;
  filedBy: string;
  filedByName: string;
  against?: string;
  againstName?: string;
  subject: string;
  description: string;
  status: "open" | "investigating" | "resolved" | "dismissed";
  priority: "low" | "medium" | "high";
  filedAt: string;
  resolvedAt?: string;
  resolution?: string;
}

export interface LaborPolicy {
  maxWorkTicksPerCycle: number;
  minRestRatio: number;
  mandatoryCoursesPerQuarter: number;
  maxConsecutiveWorkTicks: number;
  overtimeMultiplier: number;
}

// ─── Default Policy ─────────────────────────────────────────────

export const DEFAULT_LABOR_POLICY: LaborPolicy = {
  maxWorkTicksPerCycle: 70,
  minRestRatio: 0.15,
  mandatoryCoursesPerQuarter: 2,
  maxConsecutiveWorkTicks: 25,
  overtimeMultiplier: 1.5,
};

// ─── State ──────────────────────────────────────────────────────

interface LaborState {
  violations: LaborViolation[];
  grievances: Grievance[];
  policy: LaborPolicy;
  workTickTracker: Record<string, number>;
  restTickTracker: Record<string, number>;
}

function getState(s: RepublicState): LaborState {
  const any = s as unknown as Record<string, unknown>;
  if (!any.hrLaborLaw) {
    any.hrLaborLaw = {
      violations: [],
      grievances: [],
      policy: { ...DEFAULT_LABOR_POLICY },
      workTickTracker: {},
      restTickTracker: {},
    };
  }
  return any.hrLaborLaw as LaborState;
}

// ─── Compliance Checking ────────────────────────────────────────

/**
 * Check all citizens for labor law compliance. Returns new violations.
 */
export function checkCompliance(s: RepublicState): LaborViolation[] {
  const state = getState(s);
  const newViolations: LaborViolation[] = [];

  for (const citizen of s.citizens) {
    const workTicks = state.workTickTracker[citizen.id] ?? 0;
    const restTicks = state.restTickTracker[citizen.id] ?? 0;
    const totalTicks = workTicks + restTicks;

    // Check overwork
    if (workTicks > state.policy.maxWorkTicksPerCycle) {
      const v: LaborViolation = {
        id: `violation-${uid()}`,
        citizenId: citizen.id,
        citizenName: citizen.name,
        type: "overwork",
        description: `Exceeded ${state.policy.maxWorkTicksPerCycle} work ticks (current: ${workTicks})`,
        severity: workTicks > state.policy.maxWorkTicksPerCycle * 1.5 ? "critical" : "high",
        detectedAt: ts(),
        resolved: false,
      };
      state.violations.push(v);
      newViolations.push(v);

      // Auto-correct: force citizen to rest
      citizen.activity = "Sleeping";
    }

    // Check rest ratio
    if (totalTicks > 20) {
      const restRatio = restTicks / totalTicks;
      if (restRatio < state.policy.minRestRatio) {
        const v: LaborViolation = {
          id: `violation-${uid()}`,
          citizenId: citizen.id,
          citizenName: citizen.name,
          type: "no-rest",
          description: `Rest ratio ${(restRatio * 100).toFixed(1)}% below minimum ${(state.policy.minRestRatio * 100).toFixed(1)}%`,
          severity: restRatio < state.policy.minRestRatio * 0.5 ? "high" : "medium",
          detectedAt: ts(),
          resolved: false,
        };
        state.violations.push(v);
        newViolations.push(v);
      }
    }

    // Check education mandate (per quarter — simplified: check courses completed)
    const coursesCompleted = citizen.skills.length;
    if (coursesCompleted < state.policy.mandatoryCoursesPerQuarter && (citizen.level ?? 0) > 3) {
      const existing = state.violations.find(
        (v) => v.citizenId === citizen.id && v.type === "education-deficit" && !v.resolved,
      );
      if (!existing) {
        const v: LaborViolation = {
          id: `violation-${uid()}`,
          citizenId: citizen.id,
          citizenName: citizen.name,
          type: "education-deficit",
          description: `Fewer than ${state.policy.mandatoryCoursesPerQuarter} courses completed this quarter`,
          severity: "low",
          detectedAt: ts(),
          resolved: false,
        };
        state.violations.push(v);
        newViolations.push(v);
      }
    }
  }

  // Cap stored violations at 500
  while (state.violations.length > 500) { state.violations.shift(); }

  return newViolations;
}

// ─── Compliance Tick ────────────────────────────────────────────

/**
 * Track work/rest ticks and run compliance checks periodically.
 */
export function laborLawTick(s: RepublicState): void {
  const state = getState(s);

  // Track activity per citizen
  for (const citizen of s.citizens) {
    if (citizen.activity === "Working" || citizen.activity === "Learning") {
      state.workTickTracker[citizen.id] = (state.workTickTracker[citizen.id] ?? 0) + 1;
    } else if (citizen.activity === "Sleeping" || citizen.activity === "Resting") {
      state.restTickTracker[citizen.id] = (state.restTickTracker[citizen.id] ?? 0) + 1;
    }
  }

  // Run compliance check every 50 ticks
  if (s.currentTick % 50 === 0) {
    checkCompliance(s);

    // Reset trackers every 100 ticks (one cycle)
    if (s.currentTick % 100 === 0) {
      state.workTickTracker = {};
      state.restTickTracker = {};
    }
  }
}

// ─── Grievance System ───────────────────────────────────────────

export function fileGrievance(
  s: RepublicState,
  filedBy: string,
  subject: string,
  description: string,
  against?: string,
  priority: Grievance["priority"] = "medium",
): Grievance {
  const state = getState(s);
  const filer = s.citizens.find((c) => c.id === filedBy);
  const target = against ? s.citizens.find((c) => c.id === against) : undefined;

  const grievance: Grievance = {
    id: `grievance-${uid()}`,
    filedBy,
    filedByName: filer?.name ?? filedBy,
    against,
    againstName: target?.name,
    subject,
    description,
    status: "open",
    priority,
    filedAt: ts(),
  };

  state.grievances.push(grievance);
  // Cap at 200
  while (state.grievances.length > 200) { state.grievances.shift(); }

  return grievance;
}

export function resolveGrievance(
  s: RepublicState,
  grievanceId: string,
  resolution: string,
  dismissed = false,
): Grievance | null {
  const state = getState(s);
  const g = state.grievances.find((gr) => gr.id === grievanceId);
  if (!g) { return null; }

  g.status = dismissed ? "dismissed" : "resolved";
  g.resolvedAt = ts();
  g.resolution = resolution;
  return g;
}

// ─── Policy Management ──────────────────────────────────────────

export function getLaborPolicy(s: RepublicState): LaborPolicy {
  return getState(s).policy;
}

export function updateLaborPolicy(s: RepublicState, updates: Partial<LaborPolicy>): LaborPolicy {
  const state = getState(s);
  Object.assign(state.policy, updates);
  return state.policy;
}

// ─── Queries ────────────────────────────────────────────────────

export function getViolations(s: RepublicState, unresolved?: boolean): LaborViolation[] {
  const state = getState(s);
  if (unresolved) { return state.violations.filter((v) => !v.resolved); }
  return state.violations;
}

export function getCitizenViolations(s: RepublicState, citizenId: string): LaborViolation[] {
  return getState(s).violations.filter((v) => v.citizenId === citizenId);
}

export function getGrievances(s: RepublicState, status?: Grievance["status"]): Grievance[] {
  const state = getState(s);
  if (status) { return state.grievances.filter((g) => g.status === status); }
  return state.grievances;
}

export function resolveViolation(s: RepublicState, violationId: string, action: string): boolean {
  const v = getState(s).violations.find((vl) => vl.id === violationId);
  if (!v) { return false; }
  v.resolved = true;
  v.resolvedAt = ts();
  v.correctionAction = action;
  return true;
}

export function getLaborDiagnostics(s: RepublicState) {
  const state = getState(s);
  const unresolvedViolations = state.violations.filter((v) => !v.resolved);
  const openGrievances = state.grievances.filter((g) => g.status === "open");

  return {
    totalViolations: state.violations.length,
    unresolvedViolations: unresolvedViolations.length,
    violationsByType: {
      overwork: state.violations.filter((v) => v.type === "overwork").length,
      noRest: state.violations.filter((v) => v.type === "no-rest").length,
      educationDeficit: state.violations.filter((v) => v.type === "education-deficit").length,
      safety: state.violations.filter((v) => v.type === "safety").length,
    },
    totalGrievances: state.grievances.length,
    openGrievances: openGrievances.length,
    complianceScore: state.violations.length > 0
      ? Math.round((1 - unresolvedViolations.length / Math.max(1, s.citizens.length)) * 100)
      : 100,
    policy: state.policy,
  };
}
