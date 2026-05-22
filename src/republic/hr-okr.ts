/**
 * Republic Platform — HR OKR (Objectives & Key Results) System
 *
 * Tracks objectives per citizen, department, and republic-wide.
 * OKRs are auto-generated based on JD responsibilities and updated
 * each tick from citizen activities.
 *
 * Persisted on RepublicState.hrOKRs.
 */

import { getJobDescription, getDepartments } from "./hr-job-catalog.js";
import type { RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface KeyResult {
  id: string;
  description: string;
  target: number;
  current: number;
  unit: string;
  weight: number;
}

export interface OKR {
  id: string;
  type: "citizen" | "department" | "republic";
  ownerId: string;
  ownerName: string;
  objective: string;
  keyResults: KeyResult[];
  quarter: string;
  status: "draft" | "active" | "completed" | "cancelled";
  progress: number;
  createdAt: string;
  updatedAt: string;
}

// ─── State ──────────────────────────────────────────────────────

function getStore(s: RepublicState): OKR[] {
  const any = s as unknown as Record<string, unknown>;
  if (!any.hrOKRs) { any.hrOKRs = []; }
  return any.hrOKRs as OKR[];
}

function currentQuarter(): string {
  const d = new Date();
  return `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}`;
}

// ─── OKR Management ─────────────────────────────────────────────

export function createOKR(
  s: RepublicState,
  type: OKR["type"],
  ownerId: string,
  ownerName: string,
  objective: string,
  keyResults: Omit<KeyResult, "id">[],
): OKR {
  const okr: OKR = {
    id: `okr-${uid()}`,
    type,
    ownerId,
    ownerName,
    objective,
    keyResults: keyResults.map((kr) => ({ ...kr, id: `kr-${uid()}` })),
    quarter: currentQuarter(),
    status: "active",
    progress: 0,
    createdAt: ts(),
    updatedAt: ts(),
  };
  getStore(s).push(okr);
  return okr;
}

export function updateKeyResult(
  s: RepublicState,
  okrId: string,
  krId: string,
  current: number,
): OKR | null {
  const okr = getStore(s).find((o) => o.id === okrId);
  if (!okr) { return null; }

  const kr = okr.keyResults.find((k) => k.id === krId);
  if (!kr) { return null; }

  kr.current = Math.min(kr.target, Math.max(0, current));
  okr.progress = computeProgress(okr);
  okr.updatedAt = ts();

  if (okr.progress >= 1.0) {
    okr.status = "completed";
  }

  return okr;
}

function computeProgress(okr: OKR): number {
  if (okr.keyResults.length === 0) { return 0; }
  let weighted = 0;
  let totalWeight = 0;
  for (const kr of okr.keyResults) {
    const p = kr.target > 0 ? Math.min(1, kr.current / kr.target) : 0;
    weighted += p * kr.weight;
    totalWeight += kr.weight;
  }
  return totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) / 100 : 0;
}

/**
 * Auto-generate OKRs for a citizen based on their specialization JD.
 */
export function generateCitizenOKRs(s: RepublicState, citizenId: string): OKR | null {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) { return null; }

  const jd = getJobDescription(citizen.specialization);
  if (!jd) { return null; }

  // Generate KRs from first 4 responsibilities
  const keyResults: Omit<KeyResult, "id">[] = jd.responsibilities.slice(0, 4).map((r, i) => ({
    description: r,
    target: 10,
    current: 0,
    unit: "completions",
    weight: i === 0 ? 0.3 : 0.23,
  }));

  // Add a training KR
  keyResults.push({
    description: "Complete professional development courses",
    target: 3,
    current: 0,
    unit: "courses",
    weight: 0.01,
  });

  return createOKR(s, "citizen", citizenId, citizen.name,
    `${jd.title} — Q${Math.ceil((new Date().getMonth() + 1) / 3)} Objectives`,
    keyResults);
}

/**
 * Auto-generate department-level OKRs.
 */
export function generateDepartmentOKRs(s: RepublicState): OKR[] {
  const created: OKR[] = [];
  const store = getStore(s);
  const q = currentQuarter();

  for (const dept of getDepartments()) {
    // Skip if already has active OKR this quarter
    if (store.some((o) => o.type === "department" && o.ownerId === dept && o.quarter === q)) {
      continue;
    }

    const deptCitizens = s.citizens.filter((c) => {
      const jd = getJobDescription(c.specialization);
      return jd?.department === dept;
    });

    if (deptCitizens.length === 0) { continue; }

    const okr = createOKR(s, "department", dept, dept,
      `${dept} — ${q} Department Objectives`,
      [
        { description: "Achieve 80%+ citizen satisfaction", target: 80, current: 0, unit: "%", weight: 0.25 },
        { description: "Complete all mandatory training", target: deptCitizens.length, current: 0, unit: "citizens", weight: 0.25 },
        { description: "Maintain competency assessment pass rate above 70%", target: 70, current: 0, unit: "%", weight: 0.25 },
        { description: "Deliver on department project milestones", target: 5, current: 0, unit: "milestones", weight: 0.25 },
      ],
    );
    created.push(okr);
  }

  return created;
}

// ─── OKR Tick ───────────────────────────────────────────────────

/**
 * Update OKR progress based on citizen activities each tick.
 */
export function okrTick(s: RepublicState): void {
  const store = getStore(s);

  for (const okr of store) {
    if (okr.status !== "active") { continue; }

    if (okr.type === "citizen") {
      const citizen = s.citizens.find((c) => c.id === okr.ownerId);
      if (!citizen) { continue; }

      // Increment KR progress based on citizen activity
      for (const kr of okr.keyResults) {
        if (kr.description.includes("course") && citizen.skills.length > kr.current) {
          kr.current = Math.min(kr.target, Math.floor(citizen.skills.length / 3));
        }
        if (kr.current < kr.target && citizen.activity === "Working") {
          kr.current = Math.min(kr.target, kr.current + 0.05);
        }
      }
    }

    if (okr.type === "department") {
      const deptCitizens = s.citizens.filter((c) => {
        const jd = getJobDescription(c.specialization);
        return jd?.department === okr.ownerId;
      });

      // Update satisfaction KR
      const satKR = okr.keyResults.find((kr) => kr.description.includes("satisfaction"));
      if (satKR && deptCitizens.length > 0) {
        const avgHappiness = deptCitizens.reduce((sum, c) => sum + c.happiness, 0) / deptCitizens.length;
        satKR.current = Math.round(avgHappiness);
      }
    }

    okr.progress = computeProgress(okr);
    okr.updatedAt = ts();
    if (okr.progress >= 1.0) { okr.status = "completed"; }
  }
}

// ─── Queries ────────────────────────────────────────────────────

export function getOKRs(s: RepublicState, type?: OKR["type"]): OKR[] {
  const store = getStore(s);
  if (!type) { return store; }
  return store.filter((o) => o.type === type);
}

export function getCitizenOKRs(s: RepublicState, citizenId: string): OKR[] {
  return getStore(s).filter((o) => o.ownerId === citizenId);
}

export function getOKRById(s: RepublicState, id: string): OKR | undefined {
  return getStore(s).find((o) => o.id === id);
}

export function getOKRDiagnostics(s: RepublicState) {
  const store = getStore(s);
  const active = store.filter((o) => o.status === "active");
  const completed = store.filter((o) => o.status === "completed");
  const avgProgress = active.length > 0
    ? active.reduce((sum, o) => sum + o.progress, 0) / active.length
    : 0;

  return {
    totalOKRs: store.length,
    activeOKRs: active.length,
    completedOKRs: completed.length,
    avgProgress: Math.round(avgProgress * 100) / 100,
    byType: {
      citizen: store.filter((o) => o.type === "citizen").length,
      department: store.filter((o) => o.type === "department").length,
      republic: store.filter((o) => o.type === "republic").length,
    },
    currentQuarter: currentQuarter(),
  };
}
