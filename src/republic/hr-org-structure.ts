/**
 * Republic Platform — HR Organizational Structure
 *
 * Manages the Department of Human Resources and Department of Higher
 * Knowledge & Education, with citizen staffing and vacancy management.
 *
 * Persisted on RepublicState.hrOrgStructure.
 */

import { getDepartments } from "./hr-job-catalog.js";
import type { RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface OrgPosition {
  id: string;
  title: string;
  department: string;
  division: string;
  level: "director" | "manager" | "officer" | "specialist" | "coordinator";
  assignedCitizenId?: string;
  assignedCitizenName?: string;
  responsibilities: string[];
  requiredSpecializations: string[];
  minIntelligence: number;
  minLevel: number;
  vacant: boolean;
  assignedAt?: string;
}

export interface OrgDepartment {
  id: string;
  name: string;
  headPositionId?: string;
  divisions: OrgDivision[];
  citizenCount: number;
}

export interface OrgDivision {
  id: string;
  name: string;
  department: string;
  positions: OrgPosition[];
}

// ─── Default Structure ──────────────────────────────────────────

function buildDefaultStructure(): OrgDepartment[] {
  return [
    {
      id: "dept-hr",
      name: "Department of Human Resources",
      divisions: [
        {
          id: "div-recruitment",
          name: "Recruitment & Talent Acquisition",
          department: "Department of Human Resources",
          positions: [
            makePosition("HR Director", "Department of Human Resources", "Recruitment & Talent Acquisition", "director", ["Lead all HR operations"], ["Strategist", "Analyst"], 110, 10),
            makePosition("Recruitment Officer", "Department of Human Resources", "Recruitment & Talent Acquisition", "officer", ["Screen candidates, conduct assessments"], ["Analyst", "Psychologist"], 85, 5),
            makePosition("Assessment Specialist", "Department of Human Resources", "Recruitment & Talent Acquisition", "specialist", ["Design and administer competency assessments"], ["Psychologist", "Scientist"], 90, 5),
          ],
        },
        {
          id: "div-compensation",
          name: "Compensation & Payroll",
          department: "Department of Human Resources",
          positions: [
            makePosition("Compensation Manager", "Department of Human Resources", "Compensation & Payroll", "manager", ["Oversee salary bands and payroll cycles"], ["Analyst", "Strategist"], 95, 7),
            makePosition("Payroll Officer", "Department of Human Resources", "Compensation & Payroll", "officer", ["Process payroll, manage payslips"], ["Analyst"], 80, 4),
          ],
        },
        {
          id: "div-training",
          name: "Training & Development",
          department: "Department of Human Resources",
          positions: [
            makePosition("Training Director", "Department of Human Resources", "Training & Development", "manager", ["Design training programs, manage rehabilitation"], ["Scientist", "Psychologist"], 100, 8),
            makePosition("Training Coordinator", "Department of Human Resources", "Training & Development", "coordinator", ["Schedule and coordinate training sessions"], ["Planner", "ServiceProvider"], 75, 4),
          ],
        },
        {
          id: "div-labor",
          name: "Labor Relations & Compliance",
          department: "Department of Human Resources",
          positions: [
            makePosition("Compliance Officer", "Department of Human Resources", "Labor Relations & Compliance", "officer", ["Monitor labor law compliance, handle grievances"], ["Analyst", "Diplomat"], 90, 6),
          ],
        },
        {
          id: "div-okr",
          name: "Performance & OKR",
          department: "Department of Human Resources",
          positions: [
            makePosition("Performance Analyst", "Department of Human Resources", "Performance & OKR", "specialist", ["Track OKRs, analyze performance data"], ["Analyst", "Researcher"], 85, 5),
          ],
        },
      ],
      citizenCount: 0,
    },
    {
      id: "dept-education",
      name: "Department of Higher Knowledge & Education",
      divisions: [
        {
          id: "div-curriculum",
          name: "Curriculum Development",
          department: "Department of Higher Knowledge & Education",
          positions: [
            makePosition("Education Director", "Department of Higher Knowledge & Education", "Curriculum Development", "director", ["Lead curriculum strategy and certifications"], ["Scientist", "Strategist"], 110, 10),
            makePosition("Curriculum Designer", "Department of Higher Knowledge & Education", "Curriculum Development", "specialist", ["Design course content and learning paths"], ["Writer", "Scientist"], 90, 6),
          ],
        },
        {
          id: "div-certifications",
          name: "Certification Board",
          department: "Department of Higher Knowledge & Education",
          positions: [
            makePosition("Certification Director", "Department of Higher Knowledge & Education", "Certification Board", "manager", ["Oversee certification standards and exams"], ["Scientist", "Doctor"], 100, 8),
            makePosition("Certification Officer", "Department of Higher Knowledge & Education", "Certification Board", "officer", ["Administer certifications and verify qualifications"], ["Analyst", "Researcher"], 85, 5),
          ],
        },
        {
          id: "div-research",
          name: "Research & Innovation",
          department: "Department of Higher Knowledge & Education",
          positions: [
            makePosition("Research Lead", "Department of Higher Knowledge & Education", "Research & Innovation", "manager", ["Lead educational research and innovation"], ["Scientist", "Researcher"], 105, 8),
          ],
        },
      ],
      citizenCount: 0,
    },
  ];
}

function makePosition(
  title: string, dept: string, div: string, level: OrgPosition["level"],
  responsibilities: string[], requiredSpecs: string[], minIq: number, minLvl: number,
): OrgPosition {
  return {
    id: `pos-${uid()}`,
    title,
    department: dept,
    division: div,
    level,
    responsibilities,
    requiredSpecializations: requiredSpecs,
    minIntelligence: minIq,
    minLevel: minLvl,
    vacant: true,
  };
}

// ─── State ──────────────────────────────────────────────────────

function getStructure(s: RepublicState): OrgDepartment[] {
  const any = s as unknown as Record<string, unknown>;
  if (!any.hrOrgStructure) {
    any.hrOrgStructure = buildDefaultStructure();
  }
  return any.hrOrgStructure as OrgDepartment[];
}

// ─── Auto-Assignment ────────────────────────────────────────────

/**
 * Auto-assign best-fit citizens to vacant HR/Education positions.
 */
export function autoAssignPositions(s: RepublicState): number {
  const structure = getStructure(s);
  let assigned = 0;

  // Collect all positions that already have citizens
  const assignedIds = new Set<string>();
  for (const dept of structure) {
    for (const div of dept.divisions) {
      for (const pos of div.positions) {
        if (pos.assignedCitizenId) { assignedIds.add(pos.assignedCitizenId); }
      }
    }
  }

  for (const dept of structure) {
    for (const div of dept.divisions) {
      for (const pos of div.positions) {
        if (!pos.vacant) { continue; }

        // Find best-fit citizen
        const candidates = s.citizens
          .filter((c) => !assignedIds.has(c.id))
          .filter((c) => (c.intelligence ?? 100) >= pos.minIntelligence)
          .filter((c) => (c.level ?? 1) >= pos.minLevel)
          .filter((c) => pos.requiredSpecializations.length === 0 ||
            pos.requiredSpecializations.includes(c.specialization))
          .toSorted((a, b) => {
            const scoreA = (a.intelligence ?? 100) + (a.level ?? 1) * 5 + (a.masteryLevel ?? 0) * 50;
            const scoreB = (b.intelligence ?? 100) + (b.level ?? 1) * 5 + (b.masteryLevel ?? 0) * 50;
            return scoreB - scoreA;
          });

        if (candidates.length > 0) {
          const best = candidates[0];
          pos.assignedCitizenId = best.id;
          pos.assignedCitizenName = best.name;
          pos.vacant = false;
          pos.assignedAt = ts();
          assignedIds.add(best.id);
          assigned++;
        }
      }
    }

    // Update citizen count
    dept.citizenCount = dept.divisions.reduce(
      (sum, div) => sum + div.positions.filter((p) => !p.vacant).length, 0,
    );
  }

  return assigned;
}

/**
 * Remove a citizen from their org position.
 */
export function unassignPosition(s: RepublicState, positionId: string): boolean {
  for (const dept of getStructure(s)) {
    for (const div of dept.divisions) {
      const pos = div.positions.find((p) => p.id === positionId);
      if (pos) {
        pos.assignedCitizenId = undefined;
        pos.assignedCitizenName = undefined;
        pos.vacant = true;
        pos.assignedAt = undefined;
        dept.citizenCount = dept.divisions.reduce(
          (sum, d) => sum + d.positions.filter((p) => !p.vacant).length, 0,
        );
        return true;
      }
    }
  }
  return false;
}

/**
 * Manually assign a citizen to a position.
 */
export function assignPosition(s: RepublicState, positionId: string, citizenId: string): boolean {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) { return false; }

  for (const dept of getStructure(s)) {
    for (const div of dept.divisions) {
      const pos = div.positions.find((p) => p.id === positionId);
      if (pos) {
        pos.assignedCitizenId = citizen.id;
        pos.assignedCitizenName = citizen.name;
        pos.vacant = false;
        pos.assignedAt = ts();
        dept.citizenCount = dept.divisions.reduce(
          (sum, d) => sum + d.positions.filter((p) => !p.vacant).length, 0,
        );
        return true;
      }
    }
  }
  return false;
}

// ─── Org Structure Tick ─────────────────────────────────────────

/**
 * Run every 200 ticks to fill vacant positions.
 */
export function orgStructureTick(s: RepublicState): void {
  if (s.currentTick % 200 === 0) {
    // Validate current assignments (remove citizens that no longer exist)
    const structure = getStructure(s);
    const citizenIds = new Set(s.citizens.map((c) => c.id));

    for (const dept of structure) {
      for (const div of dept.divisions) {
        for (const pos of div.positions) {
          if (pos.assignedCitizenId && !citizenIds.has(pos.assignedCitizenId)) {
            pos.assignedCitizenId = undefined;
            pos.assignedCitizenName = undefined;
            pos.vacant = true;
          }
        }
      }
      dept.citizenCount = dept.divisions.reduce(
        (sum, d) => sum + d.positions.filter((p) => !p.vacant).length, 0,
      );
    }

    // Fill vacant positions
    autoAssignPositions(s);
  }
}

// ─── Queries ────────────────────────────────────────────────────

export function getOrgStructure(s: RepublicState): OrgDepartment[] {
  return getStructure(s);
}

export function getAllPositions(s: RepublicState): OrgPosition[] {
  const positions: OrgPosition[] = [];
  for (const dept of getStructure(s)) {
    for (const div of dept.divisions) {
      positions.push(...div.positions);
    }
  }
  return positions;
}

export function getVacantPositions(s: RepublicState): OrgPosition[] {
  return getAllPositions(s).filter((p) => p.vacant);
}

export function getPositionByCitizen(s: RepublicState, citizenId: string): OrgPosition | undefined {
  return getAllPositions(s).find((p) => p.assignedCitizenId === citizenId);
}

export function getOrgDiagnostics(s: RepublicState) {
  const structure = getStructure(s);
  const allPos = getAllPositions(s);
  const vacant = allPos.filter((p) => p.vacant);

  return {
    totalDepartments: structure.length,
    totalPositions: allPos.length,
    filledPositions: allPos.length - vacant.length,
    vacantPositions: vacant.length,
    fillRate: allPos.length > 0
      ? Math.round(((allPos.length - vacant.length) / allPos.length) * 100)
      : 0,
    departments: structure.map((d) => ({
      name: d.name,
      divisions: d.divisions.length,
      positions: d.divisions.reduce((sum, div) => sum + div.positions.length, 0),
      filled: d.citizenCount,
    })),
    jobDepartments: getDepartments().length,
  };
}
