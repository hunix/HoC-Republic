/**
 * Republic Platform — Phase 24: Judicial System
 *
 * Legal framework and justice mechanics:
 * - Laws and regulations
 * - Violations and enforcement
 * - Court proceedings and verdicts
 * - Citizen rights and penalties
 * - Legal precedent system
 */

import type { RepublicState } from "./types.js";
import { rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type LawCategory =
  | "economic"
  | "social"
  | "technological"
  | "environmental"
  | "security"
  | "civil-rights";

export type ViolationSeverity = "minor" | "moderate" | "major" | "critical";
export type VerdictType = "acquitted" | "guilty" | "suspended" | "deferred";

export interface Law {
  id: string;
  name: string;
  description: string;
  category: LawCategory;
  severity: ViolationSeverity; // Severity if violated
  isActive: boolean;
  enactedAt: string;
  repealedAt?: string;
  proposedBy: string;
}

export interface Violation {
  id: string;
  lawId: string;
  citizenId: string;
  description: string;
  severity: ViolationSeverity;
  evidence: string[];
  reportedAt: string;
  resolvedAt?: string;
  caseId?: string;
}

export interface CourtCase {
  id: string;
  violationId: string;
  defendantId: string;
  prosecutorId?: string;
  judgeId?: string;
  verdict?: VerdictType;
  penalty?: Penalty;
  arguments: CaseArgument[];
  filedAt: string;
  decidedAt?: string;
}

export interface CaseArgument {
  side: "prosecution" | "defense";
  citizenId: string;
  content: string;
  weight: number; // 0–1 persuasiveness
  submittedAt: string;
}

export interface Penalty {
  type: "fine" | "service" | "restriction" | "exile" | "probation";
  magnitude: number;
  durationTicks?: number;
  description: string;
}

export interface LegalPrecedent {
  id: string;
  caseId: string;
  lawCategory: LawCategory;
  ruling: string;
  impact: number; // 0–1
  setAt: string;
}

export interface JudicialDiagnostics {
  activeLawCount: number;
  openViolationCount: number;
  pendingCaseCount: number;
  totalConvictions: number;
  totalAcquittals: number;
  precedentCount: number;
}

// ─── State ──────────────────────────────────────────────────────

const laws: Law[] = [];
const violations: Violation[] = [];
const cases: CourtCase[] = [];
const precedents: LegalPrecedent[] = [];

const MAX_VIOLATIONS = 500;
const MAX_CASES = 300;

// ─── Laws ────────────────────────────────────────────────────────

/** Enact a new law. */
export function enactLaw(
  name: string,
  description: string,
  category: LawCategory,
  severity: ViolationSeverity,
  proposedBy: string,
): Law {
  const law: Law = {
    id: uid(),
    name,
    description,
    category,
    severity,
    isActive: true,
    enactedAt: ts(),
    proposedBy,
  };
  laws.push(law);
  return law;
}

/** Repeal an existing law. */
export function repealLaw(lawId: string): boolean {
  const law = laws.find((l) => l.id === lawId);
  if (!law || !law.isActive) {return false;}
  law.isActive = false;
  law.repealedAt = ts();
  return true;
}

/** Get all laws, optionally filtered. */
export function getLaws(opts?: { category?: LawCategory; activeOnly?: boolean }): Law[] {
  let result = [...laws];
  if (opts?.category) {result = result.filter((l) => l.category === opts.category);}
  if (opts?.activeOnly) {result = result.filter((l) => l.isActive);}
  return result;
}

// ─── Violations ──────────────────────────────────────────────────

/** Report a violation. */
export function reportViolation(
  lawId: string,
  citizenId: string,
  description: string,
  evidence: string[] = [],
): Violation {
  const law = laws.find((l) => l.id === lawId);
  const violation: Violation = {
    id: uid(),
    lawId,
    citizenId,
    description,
    severity: law?.severity ?? "minor",
    evidence,
    reportedAt: ts(),
  };
  violations.push(violation);
  if (violations.length > MAX_VIOLATIONS) {violations.shift();}
  return violation;
}

/** Get violations, optionally filtered. */
export function getViolations(opts?: {
  citizenId?: string;
  lawId?: string;
  unresolved?: boolean;
  limit?: number;
}): Violation[] {
  let result = [...violations];
  if (opts?.citizenId) {result = result.filter((v) => v.citizenId === opts.citizenId);}
  if (opts?.lawId) {result = result.filter((v) => v.lawId === opts.lawId);}
  if (opts?.unresolved) {result = result.filter((v) => !v.resolvedAt);}
  return result.slice(-(opts?.limit ?? 50));
}

// ─── Court System ────────────────────────────────────────────────

/** File a court case for a violation. */
export function fileCase(
  violationId: string,
  defendantId: string,
  prosecutorId?: string,
  judgeId?: string,
): CourtCase {
  const courtCase: CourtCase = {
    id: uid(),
    violationId,
    defendantId,
    prosecutorId,
    judgeId,
    arguments: [],
    filedAt: ts(),
  };
  cases.push(courtCase);
  if (cases.length > MAX_CASES) {cases.shift();}

  // Link violation to case
  const violation = violations.find((v) => v.id === violationId);
  if (violation) {violation.caseId = courtCase.id;}

  return courtCase;
}

/** Submit an argument to a court case. */
export function submitArgument(
  caseId: string,
  side: CaseArgument["side"],
  citizenId: string,
  content: string,
  weight = 0.5,
): boolean {
  const courtCase = cases.find((c) => c.id === caseId);
  if (!courtCase || courtCase.verdict) {return false;}

  courtCase.arguments.push({
    side,
    citizenId,
    content,
    weight: Math.max(0, Math.min(1, weight)),
    submittedAt: ts(),
  });
  return true;
}

/** Render a verdict on a court case. */
export function renderVerdict(
  caseId: string,
  verdict: VerdictType,
  penalty?: Penalty,
): CourtCase | undefined {
  const courtCase = cases.find((c) => c.id === caseId);
  if (!courtCase || courtCase.verdict) {return undefined;}

  courtCase.verdict = verdict;
  courtCase.penalty = penalty;
  courtCase.decidedAt = ts();

  // Resolve the underlying violation
  const violation = violations.find((v) => v.id === courtCase.violationId);
  if (violation) {violation.resolvedAt = ts();}

  // Set precedent for guilty verdicts
  if (verdict === "guilty") {
    const law = laws.find((l) => l.id === violation?.lawId);
    if (law) {
      precedents.push({
        id: uid(),
        caseId,
        lawCategory: law.category,
        ruling: `Guilty: ${violation?.description ?? "unspecified violation"}`,
        impact: penalty ? Math.min(1, penalty.magnitude / 100) : 0.3,
        setAt: ts(),
      });
    }
  }

  return courtCase;
}

/** Get court cases, optionally filtered. */
export function getCases(opts?: {
  defendantId?: string;
  pending?: boolean;
  limit?: number;
}): CourtCase[] {
  let result = [...cases];
  if (opts?.defendantId) {result = result.filter((c) => c.defendantId === opts.defendantId);}
  if (opts?.pending) {result = result.filter((c) => !c.verdict);}
  return result.slice(-(opts?.limit ?? 50));
}

// ─── Precedent System ────────────────────────────────────────────

/** Get legal precedents for a category. */
export function getPrecedents(opts?: { category?: LawCategory }): LegalPrecedent[] {
  if (opts?.category) {return precedents.filter((p) => p.lawCategory === opts.category);}
  return [...precedents];
}

// ─── Diagnostics ─────────────────────────────────────────────────

/** Get judicial system diagnostics. */
export function getJudicialDiagnostics(): JudicialDiagnostics {
  return {
    activeLawCount: laws.filter((l) => l.isActive).length,
    openViolationCount: violations.filter((v) => !v.resolvedAt).length,
    pendingCaseCount: cases.filter((c) => !c.verdict).length,
    totalConvictions: cases.filter((c) => c.verdict === "guilty").length,
    totalAcquittals: cases.filter((c) => c.verdict === "acquitted").length,
    precedentCount: precedents.length,
  };
}

// ─── Violation Templates ─────────────────────────────────────────

interface ViolationTemplate {
  lawName: string;
  category: LawCategory;
  severity: ViolationSeverity;
  description: (citizenName: string) => string;
  condition: (c: { happiness: number; credits: number; health: number; energy: number }) => boolean;
}

const VIOLATION_TEMPLATES: ViolationTemplate[] = [
  {
    lawName: "Tax Compliance Statute",
    category: "economic",
    severity: "moderate",
    description: (n) => `${n} suspected of tax evasion — unusually high personal credits vs treasury contributions`,
    condition: (c) => c.credits > 5000 && rng() < 0.15,
  },
  {
    lawName: "Civil Order Regulation",
    category: "social",
    severity: "minor",
    description: (n) => `${n} reported for disruptive behavior stemming from low morale`,
    condition: (c) => c.happiness < 25 && rng() < 0.2,
  },
  {
    lawName: "Resource Allocation Act",
    category: "economic",
    severity: "major",
    description: (n) => `${n} accused of unauthorized resource hoarding`,
    condition: (c) => c.credits > 8000 && c.happiness < 40 && rng() < 0.1,
  },
  {
    lawName: "Public Health Mandate",
    category: "social",
    severity: "minor",
    description: (n) => `${n} in violation of mandatory health check protocols`,
    condition: (c) => c.health < 20 && rng() < 0.15,
  },
  {
    lawName: "Energy Conservation Directive",
    category: "environmental",
    severity: "minor",
    description: (n) => `${n} cited for excessive energy consumption during low-supply period`,
    condition: (c) => c.energy > 95 && rng() < 0.1,
  },
  {
    lawName: "Sedition Prevention Act",
    category: "security",
    severity: "critical",
    description: (n) => `${n} under investigation for anti-Republic sentiment`,
    condition: (c) => c.happiness < 15 && c.energy > 60 && rng() < 0.05,
  },
  {
    lawName: "Fair Labor Standards",
    category: "civil-rights",
    severity: "moderate",
    description: (n) => `${n} reported for overworking without adequate rest periods`,
    condition: (c) => c.energy < 15 && c.health < 30 && rng() < 0.12,
  },
  {
    lawName: "Innovation Disclosure Act",
    category: "technological",
    severity: "moderate",
    description: (n) => `${n} failed to register a new discovery with the Research Department`,
    condition: (c) => c.credits > 3000 && c.happiness > 80 && rng() < 0.08,
  },
];

// ─── Argument Templates ──────────────────────────────────────────

const PROSECUTION_ARGS = [
  "Evidence shows a clear pattern of non-compliance over the past fiscal period.",
  "Witness testimony corroborates the allegations against the defendant.",
  "Financial records indicate suspicious activity inconsistent with reported income.",
  "Surveillance data confirms the defendant was present during the alleged violation.",
  "Republic auditors have documented multiple instances of this behavior.",
  "The defendant's activity logs show deliberate circumvention of regulations.",
];

const DEFENSE_ARGS = [
  "The defendant acted in good faith and was unaware of the regulation.",
  "Extenuating circumstances — the defendant was experiencing extreme hardship.",
  "The evidence is circumstantial and does not meet the burden of proof.",
  "The defendant has a spotless record and this appears to be an isolated incident.",
  "Republic systems may have misattributed the violation due to a data error.",
  "The defendant was following department orders that conflicted with the statute.",
];

// ─── Simulation Tick ─────────────────────────────────────────────

/**
 * Judicial tick — autonomous cycle:
 * 1. Generate violations from citizen behavior (every 200 ticks)
 * 2. File court cases for unresolved violations (every 100 ticks)
 * 3. Submit arguments to pending cases (every 50 ticks)
 * 4. Auto-resolve mature cases
 * 5. Sync local judicial state → RepublicState so UI can display
 */
export function judicialTick(s: RepublicState): void {
  // ── 1. Generate violations every 200 ticks ──
  if (s.currentTick > 0 && s.currentTick % 200 === 0) {
    const unresolvedCount = violations.filter((v) => !v.resolvedAt).length;
    if (unresolvedCount < 20) {
      // Ensure laws exist for each template
      for (const tmpl of VIOLATION_TEMPLATES) {
        if (!laws.some((l) => l.name === tmpl.lawName && l.isActive)) {
          enactLaw(tmpl.lawName, `Autonomously enacted: ${tmpl.lawName}`, tmpl.category, tmpl.severity, "Republic Legislature");
        }
      }

      // Check citizens for violations (max 3 per cycle)
      let violationsThisCycle = 0;
      for (const citizen of s.citizens) {
        if (violationsThisCycle >= 3) {break;}
        for (const tmpl of VIOLATION_TEMPLATES) {
          if (violationsThisCycle >= 3) {break;}
          if (tmpl.condition(citizen)) {
            const law = laws.find((l) => l.name === tmpl.lawName && l.isActive);
            if (law) {
              reportViolation(law.id, citizen.id, tmpl.description(citizen.name), [
                `Automated detection at tick ${s.currentTick}`,
              ]);
              violationsThisCycle++;

              s.events.push({
                citizenId: citizen.id,
                citizenName: citizen.name,
                type: "Governance",
                description: `Violation reported: ${tmpl.description(citizen.name)}`,
                timestamp: ts(),
              });
            }
          }
        }
      }
    }
  }

  // ── 2. File court cases for unresolved violations every 100 ticks ──
  if (s.currentTick > 0 && s.currentTick % 100 === 0) {
    const unresolvedViolations = violations.filter((v) => !v.resolvedAt && !v.caseId);
    const pendingCaseCount = cases.filter((c) => !c.verdict).length;

    if (pendingCaseCount < 10) {
      for (const violation of unresolvedViolations.slice(0, 2)) {
        // Find a judge and prosecutor from governance-role citizens
        const governanceRoles = new Set(["Diplomat", "Strategist", "Analyst", "Planner"]);
        const eligible = s.citizens.filter((c) => governanceRoles.has(c.specialization));
        const judge = eligible.length > 0 ? eligible[Math.floor(rng() * eligible.length)] : undefined;
        const prosecutor = eligible.length > 1
          ? eligible.filter((c) => c.id !== judge?.id)[Math.floor(rng() * Math.max(1, eligible.length - 1))]
          : undefined;

        const courtCase = fileCase(violation.id, violation.citizenId, prosecutor?.id, judge?.id);

        // Also push to RepublicState cases for UI display
        const defendant = s.citizens.find((c) => c.id === violation.citizenId);
        s.cases.push({
          id: courtCase.id,
          title: `Republic v. ${defendant?.name ?? "Unknown"}`,
          status: "Filed",
          filedAt: courtCase.filedAt,
          verdict: null,
        });

        s.events.push({
          citizenId: violation.citizenId,
          citizenName: defendant?.name ?? "Unknown",
          type: "Governance",
          description: `Court case filed: Republic v. ${defendant?.name ?? "Unknown"}`,
          timestamp: ts(),
        });
      }
    }
  }

  // ── 3. Submit arguments to pending cases every 50 ticks ──
  if (s.currentTick % 50 === 0) {
    const pendingCases = cases.filter((c) => !c.verdict);
    for (const courtCase of pendingCases.slice(0, 3)) {
      if (courtCase.arguments.length < 6) {
        // Prosecution argument
        if (courtCase.prosecutorId || rng() < 0.7) {
          const argText = PROSECUTION_ARGS[Math.floor(rng() * PROSECUTION_ARGS.length)];
          submitArgument(
            courtCase.id,
            "prosecution",
            courtCase.prosecutorId ?? "republic-prosecutor",
            argText,
            0.3 + rng() * 0.5,
          );
        }
        // Defense argument
        if (rng() < 0.6) {
          const argText = DEFENSE_ARGS[Math.floor(rng() * DEFENSE_ARGS.length)];
          submitArgument(
            courtCase.id,
            "defense",
            courtCase.defendantId,
            argText,
            0.2 + rng() * 0.5,
          );
        }
      }
    }
  }

  // ── 4. Auto-resolve pending cases with enough arguments ──
  for (const courtCase of cases) {
    if (courtCase.verdict) {continue;}
    if (courtCase.arguments.length < 2) {continue;}

    // Calculate weight balance
    const prosWeight = courtCase.arguments
      .filter((a) => a.side === "prosecution")
      .reduce((sum, a) => sum + a.weight, 0);
    const defWeight = courtCase.arguments
      .filter((a) => a.side === "defense")
      .reduce((sum, a) => sum + a.weight, 0);

    // Auto-verdict if enough evidence accumulated
    if (courtCase.arguments.length >= 4 || rng() < 0.05) {
      const verdict: VerdictType = prosWeight > defWeight ? "guilty" : "acquitted";
      const penalty: Penalty | undefined =
        verdict === "guilty"
          ? { type: "fine", magnitude: Math.round(prosWeight * 50), description: "Automated fine" }
          : undefined;
      renderVerdict(courtCase.id, verdict, penalty);

      // Apply penalty to citizen
      if (verdict === "guilty" && penalty?.type === "fine") {
        const defendant = s.citizens.find((c) => c.id === courtCase.defendantId);
        if (defendant) {
          defendant.credits = Math.max(0, defendant.credits - penalty.magnitude);
          defendant.happiness = Math.max(5, defendant.happiness - 5);
        }
      }

      s.events.push({
        citizenId: courtCase.defendantId,
        citizenName: s.citizens.find((c) => c.id === courtCase.defendantId)?.name ?? "Unknown",
        type: "Governance",
        description: `Verdict rendered: ${verdict}${penalty ? ` — fined ${penalty.magnitude} credits` : ""}`,
        timestamp: ts(),
      });
    }
  }

  // ── 5. Sync local state → RepublicState ──
  // Update case statuses in RepublicState to match local verdicts
  for (const sc of s.cases) {
    const localCase = cases.find((c) => c.id === sc.id);
    if (localCase) {
      if (localCase.verdict) {
        sc.status = "Resolved";
        sc.verdict = localCase.verdict;
      } else if (localCase.arguments.length > 0) {
        sc.status = "InProgress";
      }
    }
  }

  // Cap cases in RepublicState
  if (s.cases.length > 50) {
    const resolved = s.cases.filter((c) => c.status === "Resolved");
    const active = s.cases.filter((c) => c.status !== "Resolved");
    s.cases = [...active, ...resolved.slice(-20)];
  }

  // Cap events
  if (s.events.length > 500) {s.events = s.events.slice(-300);}
}
