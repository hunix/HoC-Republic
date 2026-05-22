/**
 * Republic Platform — National Defense & Security
 *
 * Phase 32: Internal security, threat detection, and anti-corruption.
 *
 * - Per-citizen rate limiting to prevent resource abuse
 * - Anomalous behavior pattern detection
 * - Rogue citizen quarantine with process termination
 * - Treasury anti-corruption: multi-approval for large transfers
 * - Threat response automation
 */

import { emitNationalEvent } from "./event-sourcing.js";
import type { Citizen, RepublicState } from "./types.js";

// ─── Rate Limiter ───────────────────────────────────────────────

interface RateLimitEntry {
  citizenId: string;
  operation: string;
  timestamps: number[];
}

const rateLimits = new Map<string, RateLimitEntry>();
const MAX_RATE_HISTORY = 100;

export interface RateLimitConfig {
  /** Max operations per window */
  maxOps: number;
  /** Window size in milliseconds */
  windowMs: number;
}

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  inference: { maxOps: 50, windowMs: 60_000 },
  transaction: { maxOps: 100, windowMs: 60_000 },
  document_generation: { maxOps: 10, windowMs: 60_000 },
  api_call: { maxOps: 30, windowMs: 60_000 },
  resource_consumption: { maxOps: 200, windowMs: 60_000 },
};

/**
 * Check if a citizen's operation is within rate limits.
 * Returns true if allowed, false if rate-limited.
 */
export function checkRateLimit(citizenId: string, operation: string): boolean {
  const key = `${citizenId}:${operation}`;
  const config = DEFAULT_LIMITS[operation] ?? { maxOps: 100, windowMs: 60_000 };
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let entry = rateLimits.get(key);
  if (!entry) {
    entry = { citizenId, operation, timestamps: [] };
    rateLimits.set(key, entry);
  }

  // Prune old timestamps
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);
  if (entry.timestamps.length > MAX_RATE_HISTORY) {
    entry.timestamps = entry.timestamps.slice(-MAX_RATE_HISTORY);
  }

  if (entry.timestamps.length >= config.maxOps) {
    emitNationalEvent(
      "security",
      "rate_limited",
      "national-defense",
      {
        citizenId,
        operation,
        count: entry.timestamps.length,
        limit: config.maxOps,
        windowMs: config.windowMs,
      },
      citizenId,
    );
    return false;
  }

  entry.timestamps.push(now);
  return true;
}

/** Update rate limit configuration */
export function setRateLimit(operation: string, config: RateLimitConfig): void {
  DEFAULT_LIMITS[operation] = config;
}

// ─── Threat Detection ───────────────────────────────────────────

export type ThreatLevel = "low" | "medium" | "high" | "critical";

export interface ThreatAssessment {
  citizenId: string;
  citizenName: string;
  threatLevel: ThreatLevel;
  indicators: string[];
  recommendedAction: "monitor" | "warn" | "throttle" | "quarantine";
  assessedAt: string;
}

/**
 * Assess threat level for a citizen based on behavioral patterns.
 * Checks for: unusual spending, excessive resource consumption,
 * rapid credit changes, and suspicious activity patterns.
 */
export function assessCitizenThreat(citizen: Citizen, state: RepublicState): ThreatAssessment {
  const indicators: string[] = [];
  let score = 0;

  // 1. Credit anomaly: extreme wealth or rapid change
  const avgCredits =
    state.citizens.reduce((s, c) => s + c.credits, 0) / Math.max(1, state.citizens.length);
  if (citizen.credits > avgCredits * 10) {
    indicators.push(`Credits ${citizen.credits} are 10× the average (${Math.round(avgCredits)})`);
    score += 3;
  } else if (citizen.credits < 0) {
    indicators.push(`Negative credits (${citizen.credits}) — possible exploitation`);
    score += 4;
  }

  // 2. Energy anomaly: constant max energy suggests bypass
  if (citizen.energy > 99 && citizen.activity !== "Sleeping" && citizen.activity !== "Resting") {
    indicators.push(`Perpetual max energy (${citizen.energy}) while ${citizen.activity}`);
    score += 2;
  }

  // 3. Extreme low happiness — might require intervention
  if (citizen.happiness < 10) {
    indicators.push(`Dangerously low happiness (${citizen.happiness})`);
    score += 1;
  }

  // 4. Extreme skill count — possible abuse
  if (citizen.skillCount > 50) {
    indicators.push(`Unusually high skill count (${citizen.skillCount})`);
    score += 2;
  }

  // Determine threat level
  let threatLevel: ThreatLevel;
  let recommendedAction: ThreatAssessment["recommendedAction"];
  if (score >= 7) {
    threatLevel = "critical";
    recommendedAction = "quarantine";
  } else if (score >= 5) {
    threatLevel = "high";
    recommendedAction = "throttle";
  } else if (score >= 3) {
    threatLevel = "medium";
    recommendedAction = "warn";
  } else {
    threatLevel = "low";
    recommendedAction = "monitor";
  }

  return {
    citizenId: citizen.id,
    citizenName: citizen.name,
    threatLevel,
    indicators,
    recommendedAction,
    assessedAt: new Date().toISOString(),
  };
}

// ─── Quarantine System ──────────────────────────────────────────

export interface QuarantineRecord {
  citizenId: string;
  citizenName: string;
  reason: string;
  quarantinedAt: string;
  releasedAt?: string;
  threatAssessment: ThreatAssessment;
}

const quarantineLog: QuarantineRecord[] = [];
const quarantinedCitizens = new Set<string>();
const MAX_QUARANTINE_LOG = 200;

/** Check if a citizen is quarantined */
export function isQuarantined(citizenId: string): boolean {
  return quarantinedCitizens.has(citizenId);
}

/** Quarantine a rogue citizen — prevents them from acting */
export function quarantineCitizen(
  citizen: Citizen,
  reason: string,
  state: RepublicState,
): QuarantineRecord {
  quarantinedCitizens.add(citizen.id);

  // Terminate any active processes
  if (citizen.activeProcessId) {
    citizen.activeProcessId = null;
  }

  // Force to idle
  citizen.activity = "Idle";

  const assessment = assessCitizenThreat(citizen, state);
  const record: QuarantineRecord = {
    citizenId: citizen.id,
    citizenName: citizen.name,
    reason,
    quarantinedAt: new Date().toISOString(),
    threatAssessment: assessment,
  };

  quarantineLog.push(record);
  if (quarantineLog.length > MAX_QUARANTINE_LOG) {
    quarantineLog.splice(0, quarantineLog.length - MAX_QUARANTINE_LOG);
  }

  emitNationalEvent(
    "security",
    "citizen_quarantined",
    "national-defense",
    {
      citizenId: citizen.id,
      citizenName: citizen.name,
      reason,
      threatLevel: assessment.threatLevel,
    },
    citizen.id,
  );

  return record;
}

/** Release a citizen from quarantine */
export function releaseCitizen(citizenId: string): boolean {
  if (!quarantinedCitizens.has(citizenId)) {return false;}
  quarantinedCitizens.delete(citizenId);

  const record = quarantineLog.find((r) => r.citizenId === citizenId && !r.releasedAt);
  if (record) {
    record.releasedAt = new Date().toISOString();
  }

  emitNationalEvent(
    "security",
    "citizen_released",
    "national-defense",
    {
      citizenId,
    },
    citizenId,
  );

  return true;
}

// ─── Anti-Corruption: Multi-Approval Treasury ───────────────────

export interface TreasuryApproval {
  id: string;
  amount: number;
  description: string;
  requestedBy: string;
  approvals: Array<{ citizenId: string; citizenName: string; approvedAt: string }>;
  requiredApprovals: number;
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: string;
  expiresAt: string;
}

const LARGE_TRANSACTION_THRESHOLD = 10_000;
const APPROVAL_EXPIRY_MS = 300_000; // 5 minutes
const pendingApprovals: Map<string, TreasuryApproval> = new Map();

/** Check if a treasury operation requires multi-approval */
export function requiresApproval(amount: number): boolean {
  return Math.abs(amount) >= LARGE_TRANSACTION_THRESHOLD;
}

/** Request approval for a large treasury operation */
export function requestTreasuryApproval(
  amount: number,
  description: string,
  requestedBy: string,
): TreasuryApproval {
  const approval: TreasuryApproval = {
    id: `tap-${Date.now().toString(36)}`,
    amount,
    description,
    requestedBy,
    approvals: [],
    requiredApprovals: amount >= 50_000 ? 3 : 2,
    status: "pending",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + APPROVAL_EXPIRY_MS).toISOString(),
  };

  pendingApprovals.set(approval.id, approval);

  emitNationalEvent("security", "treasury_approval_requested", "national-defense", {
    approvalId: approval.id,
    amount,
    description,
    requestedBy,
    requiredApprovals: approval.requiredApprovals,
  });

  return approval;
}

/** Add an approval to a pending treasury operation */
export function approveTreasuryOperation(
  approvalId: string,
  citizenId: string,
  citizenName: string,
): boolean {
  const approval = pendingApprovals.get(approvalId);
  if (!approval || approval.status !== "pending") {return false;}

  // Check expiry
  if (new Date(approval.expiresAt).getTime() < Date.now()) {
    approval.status = "expired";
    return false;
  }

  // No self-approval
  if (approval.requestedBy === citizenId) {return false;}

  // No duplicate approvals
  if (approval.approvals.some((a) => a.citizenId === citizenId)) {return false;}

  approval.approvals.push({
    citizenId,
    citizenName,
    approvedAt: new Date().toISOString(),
  });

  if (approval.approvals.length >= approval.requiredApprovals) {
    approval.status = "approved";
    emitNationalEvent("security", "treasury_approved", "national-defense", {
      approvalId: approval.id,
      amount: approval.amount,
      approvers: approval.approvals.map((a) => a.citizenName),
    });
  }

  return true;
}

// ─── Security Scan ──────────────────────────────────────────────

/**
 * Run a full security scan across all citizens.
 * Returns citizens grouped by threat level.
 */
export function runSecurityScan(state: RepublicState) {
  const assessments = state.citizens.map((c) => assessCitizenThreat(c, state));

  return {
    scanTimestamp: new Date().toISOString(),
    totalCitizens: state.citizens.length,
    quarantined: quarantinedCitizens.size,
    byThreatLevel: {
      critical: assessments.filter((a) => a.threatLevel === "critical"),
      high: assessments.filter((a) => a.threatLevel === "high"),
      medium: assessments.filter((a) => a.threatLevel === "medium"),
      low: assessments.filter((a) => a.threatLevel === "low"),
    },
    pendingTreasuryApprovals: [...pendingApprovals.values()].filter((a) => a.status === "pending"),
    recentQuarantines: quarantineLog.slice(-10),
  };
}

/** Get national defense diagnostics */
export function getDefenseDiagnostics() {
  return {
    quarantinedCount: quarantinedCitizens.size,
    quarantinedIds: [...quarantinedCitizens],
    rateLimitEntries: rateLimits.size,
    pendingApprovals: pendingApprovals.size,
    recentQuarantines: quarantineLog.slice(-5),
  };
}

// ─── Autonomous Defense Tick ────────────────────────────────────

/**
 * Autonomous national defense tick — periodic security sweeps
 * and automated threat response.
 *
 * Cadence:
 *   - Security scan:       every 50 ticks
 *   - Quarantine review:   every 30 ticks (release rehabilitated)
 *   - Treasury housekeeper: every 100 ticks (expire old approvals)
 *   - Rate limit cleanup:  every 200 ticks
 */
export function defenseTick(s: RepublicState): void {
  const t = s.currentTick;
  if (s.citizens.length === 0) {return;}

  // ── Every 50 ticks: security scan + auto-quarantine ──
  if (t % 50 === 0) {
    for (const citizen of s.citizens) {
      if (quarantinedCitizens.has(citizen.id)) {continue;}

      const assessment = assessCitizenThreat(citizen, s);

      if (assessment.threatLevel === "critical") {
        quarantineCitizen(citizen, `Auto-quarantine: ${assessment.indicators.join("; ")}`, s);
      } else if (assessment.threatLevel === "high") {
        // Throttle: reduce energy to slow down
        citizen.energy = Math.max(10, citizen.energy - 20);
      }
    }
  }

  // ── Every 30 ticks: review quarantined citizens ──
  if (t % 30 === 0) {
    for (const citizenId of quarantinedCitizens) {
      const citizen = s.citizens.find((c) => c.id === citizenId);
      if (!citizen) {
        quarantinedCitizens.delete(citizenId);
        continue;
      }

      // Re-assess — if threat level has dropped, release
      const reassessment = assessCitizenThreat(citizen, s);
      if (reassessment.threatLevel === "low" || reassessment.threatLevel === "medium") {
        releaseCitizen(citizenId);
        citizen.activity = "Idle";
        citizen.happiness = Math.min(100, citizen.happiness + 5);
      }
    }
  }

  // ── Every 100 ticks: expire old treasury approvals ──
  if (t % 100 === 0) {
    const now = Date.now();
    for (const [id, approval] of pendingApprovals) {
      if (approval.status === "pending" && new Date(approval.expiresAt).getTime() < now) {
        approval.status = "expired";
      }
      // Clean up old resolved approvals
      if (approval.status !== "pending") {
        const age = now - new Date(approval.createdAt).getTime();
        if (age > 600_000) { // 10 minutes
          pendingApprovals.delete(id);
        }
      }
    }
  }

  // ── Every 200 ticks: prune stale rate limit entries ──
  if (t % 200 === 0) {
    const now = Date.now();
    const staleThreshold = 120_000; // 2 minutes
    for (const [key, entry] of rateLimits) {
      entry.timestamps = entry.timestamps.filter((ts) => now - ts < staleThreshold);
      if (entry.timestamps.length === 0) {
        rateLimits.delete(key);
      }
    }
  }
}
