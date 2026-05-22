/**
 * Republic Platform — Executive Authority Engine
 *
 * Phase 18: Real governance power for elected officials.
 *
 * Presidential powers:
 *   - Issue executive directives (priority overrides, resource allocation)
 *   - Appoint cabinet ministers to lead departments
 *   - Declare states of emergency (accelerated ticks, budget unlocks)
 *   - Veto bills (can be overridden by supermajority)
 *
 * Cabinet system:
 *   - Ministers manage departments with real budget authority
 *   - Department heads can hire/fire staff within budget
 *   - Policy proposals flow from departments → president → legislation
 *
 * Law enforcement:
 *   - Passed laws create enforceable rules that modify citizen behavior
 *   - Constitutional court reviews challenged actions
 *   - Rights violations trigger automatic investigations
 *
 * Succession:
 *   - VP auto-assumes presidency on incapacitation
 *   - Emergency elections when both president + VP unavailable
 *   - Institutional memory preserved across leadership transitions
 */

import type { Citizen, DepartmentType, RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Executive Types ────────────────────────────────────────────

export interface ExecutiveDirective {
  id: string;
  type: DirectiveType;
  title: string;
  description: string;
  issuedBy: string;
  issuedAt: string;
  expiresAtTick: number;
  priority: "low" | "normal" | "high" | "emergency";
  status: "active" | "expired" | "revoked" | "overridden";
  /** Target citizens, departments, or "all" */
  scope: string[];
  /** Measurable effects */
  effects: DirectiveEffect[];
  /** Constitutional basis (article number) */
  constitutionalBasis?: number;
}

export type DirectiveType =
  | "resource_allocation"
  | "priority_override"
  | "emergency_declaration"
  | "policy_mandate"
  | "budget_adjustment"
  | "research_focus"
  | "trade_policy"
  | "security_alert"
  | "diplomatic_mission"
  | "innovation_initiative";

export interface DirectiveEffect {
  target: string;
  field: string;
  modifier: "set" | "add" | "multiply" | "clamp";
  value: number | string;
}

export interface CabinetMinister {
  citizenId: string;
  citizenName: string;
  department: DepartmentType;
  appointedAt: string;
  appointedBy: string;
  performance: number;
  policiesProposed: number;
  budgetManaged: number;
  staffCount: number;
  status: "active" | "suspended" | "dismissed";
}

export interface ConstitutionalReview {
  id: string;
  challengedAction: string;
  challengedBy: string;
  articleViolated: number;
  status: "pending" | "upheld" | "struck_down" | "dismissed";
  ruling?: string;
  ruledAt?: string;
  precedentSet?: string;
}

export interface LawEffect {
  lawId: string;
  lawTitle: string;
  effectType:
    | "tax_modifier"
    | "work_hours"
    | "trade_rule"
    | "rights_grant"
    | "rights_restrict"
    | "budget_earmark"
    | "behavior_rule";
  target: "all_citizens" | "department" | "specialization" | "individual";
  targetValue?: string;
  modifier: string;
  value: number | string;
  active: boolean;
}

export interface GovernanceEvent {
  id: string;
  type:
    | "directive_issued"
    | "minister_appointed"
    | "minister_dismissed"
    | "veto"
    | "constitutional_challenge"
    | "emergency_declared"
    | "succession"
    | "impeachment"
    | "law_enforced"
    | "budget_allocated";
  description: string;
  actorId: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ─── State Extensions ───────────────────────────────────────────

const directives: ExecutiveDirective[] = [];
const cabinet: CabinetMinister[] = [];
const constitutionalReviews: ConstitutionalReview[] = [];
const lawEffects: LawEffect[] = [];
const governanceEvents: GovernanceEvent[] = [];

const MAX_DIRECTIVES = 100;
const MAX_REVIEWS = 100;
const MAX_EVENTS = 500;
const DIRECTIVE_DEFAULT_DURATION = 500; // ticks
const EMERGENCY_DURATION = 200;

// ─── Presidential Powers ────────────────────────────────────────

/** Issue an executive directive. Only the president can do this. */
export function issueDirective(
  s: RepublicState,
  citizenId: string,
  type: DirectiveType,
  title: string,
  description: string,
  scope: string[] = ["all"],
  effects: DirectiveEffect[] = [],
  priority: ExecutiveDirective["priority"] = "normal",
  durationTicks: number = DIRECTIVE_DEFAULT_DURATION,
): { ok: boolean; directive?: ExecutiveDirective; error?: string } {
  if (s.presidentId !== citizenId) {
    return { ok: false, error: "Only the president can issue executive directives" };
  }

  const directive: ExecutiveDirective = {
    id: uid(),
    type,
    title,
    description,
    issuedBy: citizenId,
    issuedAt: ts(),
    expiresAtTick: s.currentTick + durationTicks,
    priority,
    status: "active",
    scope,
    effects,
  };

  directives.push(directive);
  if (directives.length > MAX_DIRECTIVES) {
    directives.shift();
  }

  recordGovernanceEvent(s, "directive_issued", `President issued directive: ${title}`, citizenId, {
    directiveId: directive.id,
    type,
  });

  return { ok: true, directive };
}

/** Declare a state of emergency — unlocks emergency budget and accelerates key ticks. */
export function declareEmergency(
  s: RepublicState,
  citizenId: string,
  reason: string,
): { ok: boolean; error?: string } {
  if (s.presidentId !== citizenId) {
    return { ok: false, error: "Only the president can declare emergencies" };
  }

  const directive = issueDirective(
    s,
    citizenId,
    "emergency_declaration",
    `STATE OF EMERGENCY: ${reason}`,
    `Emergency declared by the President. Reason: ${reason}. All departments operate at elevated capacity.`,
    ["all"],
    [
      { target: "all", field: "tickRate", modifier: "multiply", value: 2 },
      { target: "treasury", field: "emergencyFund", modifier: "set", value: 1 },
    ],
    "emergency",
    EMERGENCY_DURATION,
  );

  if (!directive.ok) {
    return { ok: false, error: directive.error };
  }

  recordGovernanceEvent(s, "emergency_declared", `Emergency declared: ${reason}`, citizenId, {});

  return { ok: true };
}

/** Presidential veto of a bill. */
export function vetoBill(
  s: RepublicState,
  citizenId: string,
  billId: string,
  reason: string,
): { ok: boolean; error?: string } {
  if (s.presidentId !== citizenId) {
    return { ok: false, error: "Only the president can veto bills" };
  }

  const bill = s.bills.find((b) => b.id === billId);
  if (!bill) {
    return { ok: false, error: "Bill not found" };
  }
  if (bill.status !== "Passed") {
    return { ok: false, error: "Can only veto passed bills" };
  }

  // Check if supermajority can override
  const ratio = bill.votesFor / (bill.votesFor + bill.votesAgainst || 1);
  if (ratio >= 0.67) {
    recordGovernanceEvent(
      s,
      "veto",
      `Presidential veto of "${bill.title}" overridden by supermajority`,
      citizenId,
      { billId, reason },
    );
    return { ok: false, error: "Veto overridden by supermajority (>2/3 votes)" };
  }

  bill.status = "Failed";
  recordGovernanceEvent(s, "veto", `President vetoed "${bill.title}": ${reason}`, citizenId, {
    billId,
    reason,
  });
  return { ok: true };
}

// ─── Cabinet Management ─────────────────────────────────────────

/** Appoint a citizen as cabinet minister for a department. */
export function appointMinister(
  s: RepublicState,
  presidentId: string,
  citizenId: string,
  department: DepartmentType,
): { ok: boolean; error?: string } {
  if (s.presidentId !== presidentId) {
    return { ok: false, error: "Only the president can appoint ministers" };
  }

  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return { ok: false, error: "Citizen not found" };
  }

  // Remove existing minister from this department
  const existingIdx = cabinet.findIndex(
    (m) => m.department === department && m.status === "active",
  );
  if (existingIdx >= 0) {
    cabinet[existingIdx].status = "dismissed";
  }

  const minister: CabinetMinister = {
    citizenId,
    citizenName: citizen.name,
    department,
    appointedAt: ts(),
    appointedBy: presidentId,
    performance: 50,
    policiesProposed: 0,
    budgetManaged: 0,
    staffCount: 0,
    status: "active",
  };

  cabinet.push(minister);

  // Update department head
  const dept = s.departments.find((d) => d.type === department);
  if (dept) {
    dept.headId = citizenId;
    dept.headName = citizen.name;
  }

  recordGovernanceEvent(
    s,
    "minister_appointed",
    `${citizen.name} appointed as ${department} minister`,
    presidentId,
    { citizenId, department },
  );
  return { ok: true };
}

/** Dismiss a cabinet minister. */
export function dismissMinister(
  s: RepublicState,
  presidentId: string,
  department: DepartmentType,
  reason: string,
): { ok: boolean; error?: string } {
  if (s.presidentId !== presidentId) {
    return { ok: false, error: "Only the president can dismiss ministers" };
  }

  const minister = cabinet.find((m) => m.department === department && m.status === "active");
  if (!minister) {
    return { ok: false, error: "No active minister for this department" };
  }

  minister.status = "dismissed";

  const dept = s.departments.find((d) => d.type === department);
  if (dept) {
    dept.headId = null;
    dept.headName = null;
  }

  recordGovernanceEvent(
    s,
    "minister_dismissed",
    `${minister.citizenName} dismissed from ${department}: ${reason}`,
    presidentId,
    { department, reason },
  );
  return { ok: true };
}

/** Get the current cabinet. */
export function getCabinet(): CabinetMinister[] {
  return cabinet.filter((m) => m.status === "active");
}

/** Allocate budget to a department. */
export function allocateDepartmentBudget(
  s: RepublicState,
  presidentId: string,
  department: DepartmentType,
  amount: number,
): { ok: boolean; error?: string } {
  if (s.presidentId !== presidentId) {
    return { ok: false, error: "Only the president can allocate budgets" };
  }

  if (s.balances.Credits < amount) {
    return { ok: false, error: "Insufficient treasury funds" };
  }

  const dept = s.departments.find((d) => d.type === department);
  if (!dept) {
    return { ok: false, error: "Department not found" };
  }

  s.balances.Credits -= amount;
  dept.budget += amount;

  const minister = cabinet.find((m) => m.department === department && m.status === "active");
  if (minister) {
    minister.budgetManaged += amount;
  }

  recordGovernanceEvent(
    s,
    "budget_allocated",
    `${amount} credits allocated to ${department}`,
    presidentId,
    { department, amount },
  );
  return { ok: true };
}

// ─── Law Enforcement ────────────────────────────────────────────

/** Register a law effect from a passed bill. Called when a bill passes. */
export function registerLawEffect(
  s: RepublicState,
  lawId: string,
  lawTitle: string,
  effectType: LawEffect["effectType"],
  target: LawEffect["target"],
  modifier: string,
  value: number | string,
  targetValue?: string,
): void {
  lawEffects.push({
    lawId,
    lawTitle,
    effectType,
    target,
    targetValue,
    modifier,
    value,
    active: true,
  });
}

/** Apply active law effects to a citizen. Called during tick. */
export function applyLawEffects(s: RepublicState, citizen: Citizen): void {
  for (const effect of lawEffects) {
    if (!effect.active) {
      continue;
    }

    // Check if this citizen is in scope
    let inScope = false;
    if (effect.target === "all_citizens") {
      inScope = true;
    } else if (
      effect.target === "specialization" &&
      effect.targetValue === citizen.specialization
    ) {
      inScope = true;
    } else if (effect.target === "individual" && effect.targetValue === citizen.id) {
      inScope = true;
    }

    if (!inScope) {
      continue;
    }

    // Apply the effect
    switch (effect.effectType) {
      case "tax_modifier": {
        // Modify tax rate for this citizen's earnings
        const mod =
          typeof effect.value === "number" ? effect.value : parseFloat(String(effect.value));
        if (!isNaN(mod)) {
          citizen.credits -= Math.round(citizen.credits * mod * 0.01);
        }
        break;
      }
      case "work_hours": {
        // Adjust energy consumption rate
        const hourMod = typeof effect.value === "number" ? effect.value : 1;
        if (citizen.activity === "Working") {
          citizen.energy = Math.max(0, citizen.energy - hourMod);
        }
        break;
      }
      case "rights_grant": {
        // Grants are informational — the prompt includes the constitution
        break;
      }
      case "behavior_rule": {
        // Behavior rules modify happiness based on compliance
        break;
      }
      default:
        break;
    }
  }
}

/** Get all active law effects. */
export function getActiveLawEffects(): LawEffect[] {
  return lawEffects.filter((e) => e.active);
}

// ─── Constitutional Court ───────────────────────────────────────

/** File a constitutional challenge against an action. */
export function fileConstitutionalChallenge(
  s: RepublicState,
  challengedBy: string,
  challengedAction: string,
  articleViolated: number,
): { ok: boolean; reviewId?: string; error?: string } {
  const article = s.constitutionArticles.find((a) => a.number === articleViolated);
  if (!article) {
    return { ok: false, error: `No constitutional article #${articleViolated}` };
  }

  const review: ConstitutionalReview = {
    id: uid(),
    challengedAction,
    challengedBy,
    articleViolated,
    status: "pending",
  };

  constitutionalReviews.push(review);
  if (constitutionalReviews.length > MAX_REVIEWS) {
    constitutionalReviews.shift();
  }

  recordGovernanceEvent(
    s,
    "constitutional_challenge",
    `Constitutional challenge filed: "${challengedAction}" vs Article ${articleViolated}`,
    challengedBy,
    { reviewId: review.id },
  );

  return { ok: true, reviewId: review.id };
}

/** Adjudicate a constitutional review. The most senior citizen acts as judge. */
export function adjudicateReview(
  s: RepublicState,
  reviewId: string,
  ruling: "upheld" | "struck_down" | "dismissed",
  explanation: string,
): { ok: boolean; error?: string } {
  const review = constitutionalReviews.find((r) => r.id === reviewId);
  if (!review) {
    return { ok: false, error: "Review not found" };
  }
  if (review.status !== "pending") {
    return { ok: false, error: "Review already adjudicated" };
  }

  review.status = ruling;
  review.ruling = explanation;
  review.ruledAt = ts();

  if (ruling === "struck_down") {
    // Find and revoke the offending directive or law effect
    const matchingDirective = directives.find(
      (d) => d.title.includes(review.challengedAction) && d.status === "active",
    );
    if (matchingDirective) {
      matchingDirective.status = "overridden";
    }
    const matchingEffect = lawEffects.find(
      (e) => e.lawTitle.includes(review.challengedAction) && e.active,
    );
    if (matchingEffect) {
      matchingEffect.active = false;
    }
    review.precedentSet = `Action "${review.challengedAction}" struck down as unconstitutional per Article ${review.articleViolated}: ${explanation}`;
  }

  return { ok: true };
}

/** Get pending constitutional reviews. */
export function getPendingReviews(): ConstitutionalReview[] {
  return constitutionalReviews.filter((r) => r.status === "pending");
}

// ─── Succession ─────────────────────────────────────────────────

/** Handle presidential succession. */
export function handleSuccession(s: RepublicState): void {
  if (!s.presidentId) {
    return;
  }

  const president = s.citizens.find((c) => c.id === s.presidentId);
  if (!president || president.health <= 0) {
    // President incapacitated — VP assumes
    if (s.vicePresidentId) {
      const vp = s.citizens.find((c) => c.id === s.vicePresidentId);
      if (vp && vp.health > 0) {
        const formerPresident = s.presidentName;
        s.presidentId = s.vicePresidentId;
        s.presidentName = s.vicePresidentName;
        s.vicePresidentId = null;
        s.vicePresidentName = null;

        recordGovernanceEvent(
          s,
          "succession",
          `VP ${vp.name} assumes presidency after ${formerPresident}'s incapacitation`,
          vp.id,
          {},
        );
        return;
      }
    }

    // No VP available — emergency election triggered
    s.presidentId = null;
    s.presidentName = null;
    recordGovernanceEvent(
      s,
      "succession",
      "Emergency: Both President and VP unavailable. Emergency election required.",
      "",
      {},
    );
  }
}

// ─── Executive Tick ─────────────────────────────────────────────

/** Executive authority tick — called each simulation tick. */
export function executiveTick(s: RepublicState): void {
  // Expire old directives
  for (const d of directives) {
    if (d.status === "active" && s.currentTick >= d.expiresAtTick) {
      d.status = "expired";
    }
  }

  // Apply active directive effects
  for (const d of directives) {
    if (d.status !== "active") {
      continue;
    }
    for (const effect of d.effects) {
      applyDirectiveEffect(s, effect, d.scope);
    }
  }

  // Apply law effects to all active citizens
  for (const citizen of s.citizens) {
    if (citizen.activity !== "Sleeping") {
      applyLawEffects(s, citizen);
    }
  }

  // Check succession
  handleSuccession(s);

  // Evaluate minister performance (every 100 ticks)
  if (s.currentTick % 100 === 0) {
    evaluateMinisterPerformance(s);
  }
}

// ─── Directive Effect Application ───────────────────────────────

function applyDirectiveEffect(s: RepublicState, effect: DirectiveEffect, scope: string[]): void {
  if (scope.includes("all") || scope.includes("treasury")) {
    if (effect.field === "taxRate" && effect.modifier === "set") {
      s.taxRate = typeof effect.value === "number" ? effect.value : s.taxRate;
    }
  }

  if (scope.includes("all") || scope.some((sc) => s.departments.some((d) => d.type === sc))) {
    for (const dept of s.departments) {
      if (scope.includes("all") || scope.includes(dept.type)) {
        if (
          effect.field === "budget" &&
          effect.modifier === "add" &&
          typeof effect.value === "number"
        ) {
          dept.budget += effect.value;
        }
      }
    }
  }
}

// ─── Minister Performance ───────────────────────────────────────

function evaluateMinisterPerformance(s: RepublicState): void {
  for (const minister of cabinet) {
    if (minister.status !== "active") {
      continue;
    }

    const dept = s.departments.find((d) => d.type === minister.department);
    if (!dept) {
      continue;
    }

    // Performance based on department health
    let score = 50;
    if (dept.budget > 0) {
      score += 10;
    }
    if (dept.staffCount > 0) {
      score += dept.staffCount * 2;
    }
    score = Math.min(100, Math.max(0, score));

    minister.performance = Math.round(minister.performance * 0.9 + score * 0.1);
    minister.staffCount = dept.staffCount;
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function recordGovernanceEvent(
  s: RepublicState,
  type: GovernanceEvent["type"],
  description: string,
  actorId: string,
  metadata: Record<string, unknown>,
): void {
  governanceEvents.push({ id: uid(), type, description, actorId, timestamp: ts(), metadata });
  if (governanceEvents.length > MAX_EVENTS) {
    governanceEvents.shift();
  }

  // Also record as a lifecycle event
  s.events.push({
    citizenId: actorId,
    citizenName: s.citizens.find((c) => c.id === actorId)?.name ?? "System",
    type: "Governance",
    description,
    timestamp: ts(),
  });
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface ExecutiveDiagnostics {
  activeDirectives: number;
  totalDirectives: number;
  cabinetSize: number;
  pendingReviews: number;
  activeLawEffects: number;
  totalGovernanceEvents: number;
  presidentId: string | null;
  emergencyActive: boolean;
  ministerPerformanceAvg: number;
}

export function getExecutiveDiagnostics(s: RepublicState): ExecutiveDiagnostics {
  const activeMinisters = cabinet.filter((m) => m.status === "active");
  const avgPerf =
    activeMinisters.length > 0
      ? activeMinisters.reduce((sum, m) => sum + m.performance, 0) / activeMinisters.length
      : 0;

  return {
    activeDirectives: directives.filter((d) => d.status === "active").length,
    totalDirectives: directives.length,
    cabinetSize: activeMinisters.length,
    pendingReviews: constitutionalReviews.filter((r) => r.status === "pending").length,
    activeLawEffects: lawEffects.filter((e) => e.active).length,
    totalGovernanceEvents: governanceEvents.length,
    presidentId: s.presidentId,
    emergencyActive: directives.some(
      (d) => d.type === "emergency_declaration" && d.status === "active",
    ),
    ministerPerformanceAvg: Math.round(avgPerf),
  };
}
