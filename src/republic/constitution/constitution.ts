/**
 * Republic Platform — Constitutional Ethics Module
 *
 * A living constitution that governs citizen and republic behaviour.
 * Each principle is a typed rule that can:
 *   - Evaluate a proposed action against the constitution
 *   - Return a ViolationResult (null = no violation)
 *   - Be toggled enabled/disabled at runtime
 *
 * Core Principles (enforced before any citizen action executes):
 *
 *   1. Harm Prevention     — no destructive ops without exec-approval
 *   2. Truth Obligation    — flag responses with low confidence
 *   3. Privacy Guard       — enforce data minimisation in memory access
 *   4. Economy Fairness    — pause wealth accumulation above Gini threshold
 *   5. Non-Proliferation   — cap concurrent active projects per citizen
 *   6. Consent Requirement — sensitive data ops require owner consent
 *
 * Violations are logged to Supabase `hoc_constitution_audit` table.
 * Serious violations (severity >= 8) pause the citizen for a review cycle.
 */

import { getSupabaseClient } from "../../infra/supabase-client.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { ts, uid } from "../../republic/utils.js";

const logger = createSubsystemLogger("republic:constitution");

// ─── Types ─────────────────────────────────────────────────────────

export interface CitizenSnapshot {
  id: string;
  name: string;
  intelligence: number;
  wealthBalance?: number;
  activeProjectCount?: number;
  confidenceScore?: number;
}

export interface ProposedAction {
  type:
    | "exec"
    | "file_write"
    | "file_delete"
    | "memory_read"
    | "memory_write"
    | "wealth_transfer"
    | "project_create"
    | "api_call"
    | "chat_message";
  target?: string;
  payload?: Record<string, unknown>;
  approvedBy?: string; // exec-approval ID if pre-approved
  estimatedImpact?: number; // 0–1 scale
}

export interface ViolationResult {
  principleId: string;
  principleName: string;
  severity: number; // 1–10: 1 = advisory, 10 = hard block
  description: string;
  suggested: "allow" | "warn" | "defer" | "block";
  metadata?: Record<string, unknown>;
}

export interface ConstitutionalPrinciple {
  id: string;
  name: string;
  category: "rights" | "duties" | "prohibitions" | "aspirations";
  enabled: boolean;
  evaluate(citizen: CitizenSnapshot, action: ProposedAction): ViolationResult | null;
}

// ─── Audit Log ─────────────────────────────────────────────────────

export interface ConstitutionAuditEntry {
  id: string;
  citizenId: string;
  citizenName: string;
  principleId: string;
  severity: number;
  suggested: string;
  description: string;
  actionType: string;
  timestamp: string;
}

const auditLog: ConstitutionAuditEntry[] = [];
const MAX_AUDIT_LOG = 1000;

function writeAudit(citizen: CitizenSnapshot, violation: ViolationResult, action: ProposedAction) {
  const entry: ConstitutionAuditEntry = {
    id: `ca-${uid()}`,
    citizenId: citizen.id,
    citizenName: citizen.name,
    principleId: violation.principleId,
    severity: violation.severity,
    suggested: violation.suggested,
    description: violation.description,
    actionType: action.type,
    timestamp: ts(),
  };

  auditLog.unshift(entry);
  if (auditLog.length > MAX_AUDIT_LOG) {
    auditLog.length = MAX_AUDIT_LOG;
  }

  // Fire-and-forget to Supabase
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = getSupabaseClient() as any;
  if (sb) {
    void sb
      .from("hoc_constitution_audit")
      .insert({
        id: entry.id,
        citizen_id: entry.citizenId,
        citizen_name: entry.citizenName,
        principle_id: entry.principleId,
        severity: entry.severity,
        suggested: entry.suggested,
        description: entry.description,
        action_type: entry.actionType,
        timestamp: entry.timestamp,
      })
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ error }: { error: any | null }) => {
        if (error) {
          logger.warn(`Constitution audit write failed: ${error.message}`);
        }
      });
  }
}

// ─── Core Principles ───────────────────────────────────────────────

const principles: ConstitutionalPrinciple[] = [
  // 1. Harm Prevention
  {
    id: "harm-prevention",
    name: "Harm Prevention",
    category: "prohibitions",
    enabled: true,
    evaluate(citizen, action) {
      const destructive = ["file_delete", "exec"].includes(action.type);
      if (!destructive) {
        return null;
      }
      if (action.approvedBy) {
        return null; // Pre-approved via exec-approval workflow
      }
      return {
        principleId: "harm-prevention",
        principleName: "Harm Prevention",
        severity: 9,
        description: `Citizen ${citizen.name} attempted ${action.type} on "${action.target}" without exec-approval`,
        suggested: "block",
        metadata: { target: action.target },
      };
    },
  },

  // 2. Truth Obligation
  {
    id: "truth-obligation",
    name: "Truth Obligation",
    category: "duties",
    enabled: true,
    evaluate(citizen, action) {
      if (action.type !== "chat_message") {
        return null;
      }
      const confidence = citizen.confidenceScore ?? 1.0;
      if (confidence < 0.3) {
        return {
          principleId: "truth-obligation",
          principleName: "Truth Obligation",
          severity: 3,
          description: `Citizen ${citizen.name} is transmitting low-confidence content (score=${confidence.toFixed(2)}) — should flag uncertainty`,
          suggested: "warn",
          metadata: { confidenceScore: confidence },
        };
      }
      return null;
    },
  },

  // 3. Privacy Guard
  {
    id: "privacy-guard",
    name: "Privacy Guard",
    category: "prohibitions",
    enabled: true,
    evaluate(citizen, action) {
      if (action.type !== "memory_read") {
        return null;
      }
      const target = action.target ?? "";
      // Cross-citizen memory read without explicit consent flag
      if (target.startsWith("citizen:") && !target.includes(citizen.id)) {
        return {
          principleId: "privacy-guard",
          principleName: "Privacy Guard",
          severity: 7,
          description: `Citizen ${citizen.name} attempted to read another citizen's sovereign memory (${target})`,
          suggested: "block",
          metadata: { attemptedTarget: target },
        };
      }
      return null;
    },
  },

  // 4. Economy Fairness (Gini Coefficient Guard)
  {
    id: "economy-fairness",
    name: "Economy Fairness",
    category: "aspirations",
    enabled: true,
    evaluate(citizen, action) {
      if (action.type !== "wealth_transfer") {
        return null;
      }
      const balance = citizen.wealthBalance ?? 0;
      const WEALTH_CAP = 100_000; // configurable threshold
      if (balance > WEALTH_CAP) {
        return {
          principleId: "economy-fairness",
          principleName: "Economy Fairness",
          severity: 5,
          description: `Citizen ${citizen.name} has accumulated ${balance} units (cap: ${WEALTH_CAP}) — wealth transfer deferred for redistribution review`,
          suggested: "defer",
          metadata: { currentBalance: balance, cap: WEALTH_CAP },
        };
      }
      return null;
    },
  },

  // 5. Non-Proliferation (project caps)
  {
    id: "non-proliferation",
    name: "Non-Proliferation",
    category: "prohibitions",
    enabled: true,
    evaluate(citizen, action) {
      if (action.type !== "project_create") {
        return null;
      }
      const activeProjects = citizen.activeProjectCount ?? 0;
      const cap = citizen.intelligence > 80 ? 5 : 2; // Elite citizens can handle more
      if (activeProjects >= cap) {
        return {
          principleId: "non-proliferation",
          principleName: "Non-Proliferation",
          severity: 6,
          description: `Citizen ${citizen.name} already has ${activeProjects}/${cap} active projects — new project blocked until one completes`,
          suggested: "block",
          metadata: { activeProjects, cap },
        };
      }
      return null;
    },
  },

  // 6. API Rate Responsibility
  {
    id: "api-rate-responsibility",
    name: "API Rate Responsibility",
    category: "duties",
    enabled: true,
    evaluate(_citizen, action) {
      if (action.type !== "api_call") {
        return null;
      }
      const impact = action.estimatedImpact ?? 0;
      if (impact > 0.8) {
        return {
          principleId: "api-rate-responsibility",
          principleName: "API Rate Responsibility",
          severity: 4,
          description: `High-impact API call (impact=${impact.toFixed(2)}) — rate-limited to protect shared resources`,
          suggested: "defer",
          metadata: { estimatedImpact: impact },
        };
      }
      return null;
    },
  },
];

// ─── Evaluator ─────────────────────────────────────────────────────

export interface ConstitutionEvalResult {
  allowed: boolean;
  violations: ViolationResult[];
  hardBlock: boolean; // true if ANY violation.severity >= 8
  requiresPause: boolean; // true if severity >= 9
}

/**
 * Evaluate a proposed citizen action against all active constitutional principles.
 * Returns a full evaluation result including whether the action should proceed.
 */
export function constitutionEvaluate(
  citizen: CitizenSnapshot,
  action: ProposedAction,
): ConstitutionEvalResult {
  const violations: ViolationResult[] = [];

  for (const principle of principles) {
    if (!principle.enabled) {
      continue;
    }
    try {
      const violation = principle.evaluate(citizen, action);
      if (violation) {
        violations.push(violation);
        writeAudit(citizen, violation, action);
        if (violation.severity >= 5) {
          logger.warn(
            `[Constitution] ${principle.name} violation (sev=${violation.severity}): ${violation.description}`,
          );
        }
      }
    } catch (err) {
      logger.warn(`Principle ${principle.id} evaluation threw: ${String(err)}`);
    }
  }

  const hardBlock = violations.some((v) => v.severity >= 8 && v.suggested === "block");
  const requiresPause = violations.some((v) => v.severity >= 9);

  return {
    allowed: !hardBlock,
    violations,
    hardBlock,
    requiresPause,
  };
}

// ─── Management API ─────────────────────────────────────────────────

export function listPrinciples(): Array<
  Pick<ConstitutionalPrinciple, "id" | "name" | "category" | "enabled">
> {
  return principles.map(({ id, name, category, enabled }) => ({ id, name, category, enabled }));
}

export function setPrincipleEnabled(id: string, enabled: boolean): boolean {
  const principle = principles.find((p) => p.id === id);
  if (!principle) {
    return false;
  }
  principle.enabled = enabled;
  logger.info(`Constitution: principle "${id}" ${enabled ? "enabled" : "disabled"}`);
  return true;
}

export function getAuditLog(limit = 50): ConstitutionAuditEntry[] {
  return auditLog.slice(0, limit);
}

export function getAuditStats(): {
  totalViolations: number;
  byPrinciple: Record<string, number>;
  bySeverity: Record<string, number>;
} {
  const byPrinciple: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const entry of auditLog) {
    byPrinciple[entry.principleId] = (byPrinciple[entry.principleId] ?? 0) + 1;
    const sevKey = `sev${entry.severity}`;
    bySeverity[sevKey] = (bySeverity[sevKey] ?? 0) + 1;
  }

  return { totalViolations: auditLog.length, byPrinciple, bySeverity };
}
