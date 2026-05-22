/**
 * Republic Platform — Trust & Reputation System
 *
 * Phase 38: AAMAS "Actual Trust" + ETHOS-inspired reputation.
 *
 * Global reputation ledger with domain-specific scores tracking
 * economic reliability, task completion, social cooperation, and
 * governance participation. Trust-weighted delegation ensures
 * critical tasks go to reliable citizens.
 *
 * Research basis:
 * - AAMAS 2024 "Actual Trust": trust as prospective task delivery capacity
 * - ETHOS (arXiv Dec 2024): blockchain-based dynamic risk classification
 * - ERC-8004 (Jan 2026): on-chain agent identity and reputation scoring
 *
 * Key capabilities:
 * 1. Domain-specific reputation scores (economic, task, social, governance)
 * 2. Trust-weighted task delegation scoring
 * 3. Reputation decay and rehabilitation
 * 4. Whistleblower/accountability mechanism
 * 5. reputationTick() — tick loop integration
 */

import { ts, uid } from "./utils.js";

// ─── Reputation Domains ─────────────────────────────────────────

export interface ReputationProfile {
  citizenId: string;
  /** Economic reliability: honoring trades, paying debts, resource stewardship */
  economic: number;
  /** Task completion: delivering quality work on time */
  task: number;
  /** Social cooperation: helping others, sharing knowledge, positive interactions */
  social: number;
  /** Governance participation: voting, proposing, debating constructively */
  governance: number;
  /** Composite score (weighted average) */
  composite: number;
  /** Total positive events recorded */
  positiveEvents: number;
  /** Total negative events recorded */
  negativeEvents: number;
  /** History of significant reputation changes */
  history: ReputationEvent[];
  /** Last update timestamp */
  updatedAt: string;
}

export interface ReputationEvent {
  id: string;
  domain: "economic" | "task" | "social" | "governance";
  delta: number;
  reason: string;
  witnessId?: string;
  tick: number;
  timestamp: string;
}

// ─── Configuration ──────────────────────────────────────────────

/** Starting reputation for new citizens */
const DEFAULT_REPUTATION = 0.5;

/** How quickly reputation decays toward neutral (per tick) */
const REPUTATION_DECAY_RATE = 0.0005;

/** Minimum reputation (even worst offenders get a floor) */
const MIN_REPUTATION = 0.05;

/** Maximum reputation */
const MAX_REPUTATION = 1.0;

/** Domain weights for composite score */
const DOMAIN_WEIGHTS = {
  economic: 0.25,
  task: 0.35,
  social: 0.2,
  governance: 0.2,
};

/** Max events to keep in history per citizen */
const MAX_HISTORY = 100;

/** Tick interval for decay processing */
const DECAY_INTERVAL = 50;

/** Threshold below which a citizen is "untrusted" */
const UNTRUSTED_THRESHOLD = 0.3;

/** Threshold above which a citizen is "highly trusted" */
const TRUSTED_THRESHOLD = 0.75;

// ─── State ──────────────────────────────────────────────────────

const reputationLedger = new Map<string, ReputationProfile>();

/** Reports filed (whistleblower/accountability) */
interface Report {
  id: string;
  reporterId: string;
  targetId: string;
  domain: ReputationEvent["domain"];
  description: string;
  severity: "minor" | "moderate" | "severe";
  tick: number;
  timestamp: string;
  resolved: boolean;
}

const reports: Report[] = [];
const MAX_REPORTS = 500;

// ─── Profile Management ─────────────────────────────────────────

/** Get or create a reputation profile for a citizen */
export function getReputationProfile(citizenId: string): ReputationProfile {
  let profile = reputationLedger.get(citizenId);
  if (!profile) {
    profile = {
      citizenId,
      economic: DEFAULT_REPUTATION,
      task: DEFAULT_REPUTATION,
      social: DEFAULT_REPUTATION,
      governance: DEFAULT_REPUTATION,
      composite: DEFAULT_REPUTATION,
      positiveEvents: 0,
      negativeEvents: 0,
      history: [],
      updatedAt: ts(),
    };
    reputationLedger.set(citizenId, profile);
  }
  return profile;
}

/** Compute composite score from domain scores */
function computeComposite(profile: ReputationProfile): number {
  return (
    profile.economic * DOMAIN_WEIGHTS.economic +
    profile.task * DOMAIN_WEIGHTS.task +
    profile.social * DOMAIN_WEIGHTS.social +
    profile.governance * DOMAIN_WEIGHTS.governance
  );
}

// ─── Reputation Updates ─────────────────────────────────────────

/**
 * Record a reputation event for a citizen.
 *
 * Positive deltas increase reputation; negative deltas decrease it.
 * All changes are bounded to [MIN_REPUTATION, MAX_REPUTATION].
 */
export function recordReputationEvent(
  citizenId: string,
  domain: ReputationEvent["domain"],
  delta: number,
  reason: string,
  opts?: { witnessId?: string; tick?: number },
): ReputationEvent {
  const profile = getReputationProfile(citizenId);
  const tick = opts?.tick ?? 0;

  const event: ReputationEvent = {
    id: `rep-${uid().slice(0, 8)}`,
    domain,
    delta,
    reason,
    witnessId: opts?.witnessId,
    tick,
    timestamp: ts(),
  };

  // Apply delta
  profile[domain] = Math.max(MIN_REPUTATION, Math.min(MAX_REPUTATION, profile[domain] + delta));
  profile.composite = computeComposite(profile);
  profile.updatedAt = ts();

  if (delta > 0) {
    profile.positiveEvents++;
  } else {
    profile.negativeEvents++;
  }

  // Add to history
  profile.history.push(event);
  while (profile.history.length > MAX_HISTORY) {
    profile.history.shift();
  }

  return event;
}

/**
 * Batch-record a successful task completion.
 * Boosts task reputation and optionally economic reputation.
 */
export function recordTaskSuccess(
  citizenId: string,
  opts?: { quality?: number; onTime?: boolean; tick?: number },
): void {
  const quality = opts?.quality ?? 0.7;
  const bonus = quality * 0.05;

  recordReputationEvent(citizenId, "task", bonus, "Successful task completion", {
    tick: opts?.tick,
  });

  if (opts?.onTime) {
    recordReputationEvent(citizenId, "task", 0.01, "Delivered on time", {
      tick: opts?.tick,
    });
  }
}

/**
 * Record a task failure.
 */
export function recordTaskFailure(
  citizenId: string,
  reason: string,
  opts?: { tick?: number },
): void {
  recordReputationEvent(citizenId, "task", -0.08, `Task failure: ${reason}`, {
    tick: opts?.tick,
  });
}

/**
 * Record a positive social interaction.
 */
export function recordSocialPositive(
  citizenId: string,
  reason: string,
  opts?: { witnessId?: string; tick?: number },
): void {
  recordReputationEvent(citizenId, "social", 0.03, reason, opts);
}

/**
 * Record governance participation.
 */
export function recordGovernanceParticipation(
  citizenId: string,
  action: string,
  opts?: { tick?: number },
): void {
  recordReputationEvent(citizenId, "governance", 0.02, `Governance: ${action}`, opts);
}

// ─── Trust-Weighted Delegation ──────────────────────────────────

/**
 * Score a citizen's suitability for a task based on reputation.
 *
 * Returns a delegation score 0.0–1.0 that factors in:
 * - Domain-specific reputation (the domain most relevant to the task)
 * - Composite reputation
 * - Recent trend (improving or declining)
 */
export function getDelegationScore(
  citizenId: string,
  taskDomain: ReputationEvent["domain"],
): number {
  const profile = getReputationProfile(citizenId);

  // Domain-specific score (60% weight)
  const domainScore = profile[taskDomain];

  // Composite score (30% weight)
  const compositeScore = profile.composite;

  // Recent trend (10% weight) — based on last 10 events
  const recentEvents = profile.history.slice(-10);
  let trendScore = 0.5;
  if (recentEvents.length > 0) {
    const avgDelta = recentEvents.reduce((sum, e) => sum + e.delta, 0) / recentEvents.length;
    trendScore = Math.max(0, Math.min(1, 0.5 + avgDelta * 10));
  }

  return domainScore * 0.6 + compositeScore * 0.3 + trendScore * 0.1;
}

/**
 * Rank citizens by suitability for a task in a specific domain.
 */
export function rankCitizensForTask(
  citizenIds: string[],
  domain: ReputationEvent["domain"],
): Array<{ citizenId: string; score: number; trusted: boolean }> {
  return citizenIds
    .map((citizenId) => {
      const score = getDelegationScore(citizenId, domain);
      return {
        citizenId,
        score,
        trusted: score >= TRUSTED_THRESHOLD,
      };
    })
    .toSorted((a, b) => b.score - a.score);
}

/**
 * Check if a citizen is trusted enough for a sensitive task.
 */
export function isTrusted(citizenId: string, domain?: ReputationEvent["domain"]): boolean {
  const profile = getReputationProfile(citizenId);
  if (domain) {
    return profile[domain] >= TRUSTED_THRESHOLD;
  }
  return profile.composite >= TRUSTED_THRESHOLD;
}

/**
 * Check if a citizen is flagged as untrusted.
 */
export function isUntrusted(citizenId: string): boolean {
  const profile = getReputationProfile(citizenId);
  return profile.composite < UNTRUSTED_THRESHOLD;
}

// ─── Action-Level Trust Gating ──────────────────────────────────

/**
 * Trust thresholds for different action types.
 * Higher-risk actions require higher trust scores.
 */
const ACTION_TRUST_THRESHOLDS: Record<string, { domain: ReputationEvent["domain"]; threshold: number }> = {
  tool_call:      { domain: "task",       threshold: 0.25 },
  communication:  { domain: "social",     threshold: 0.20 },
  financial:      { domain: "economic",   threshold: 0.45 },
  governance:     { domain: "governance", threshold: 0.50 },
  internal:       { domain: "task",       threshold: 0.15 },
};

/**
 * Check if a citizen is trusted enough to perform a specific action type.
 *
 * Returns `{ allowed, reason }` — used by guardrail pipeline to
 * enforce trust-based restrictions on low-reputation citizens.
 *
 * @example
 * ```ts
 * const check = canPerformAction("citizen-42", "financial");
 * if (!check.allowed) {
 *   // block action with check.reason
 * }
 * ```
 */
export function canPerformAction(
  citizenId: string,
  actionType: string,
): { allowed: boolean; reason: string; trustScore: number } {
  const profile = getReputationProfile(citizenId);
  const config = ACTION_TRUST_THRESHOLDS[actionType] ?? ACTION_TRUST_THRESHOLDS.internal;

  const domainScore = profile[config.domain];
  const compositeScore = profile.composite;

  // Use the lower of domain and composite score for safety
  const effectiveScore = Math.min(domainScore, compositeScore);

  if (effectiveScore < config.threshold) {
    return {
      allowed: false,
      reason: `Citizen ${citizenId} trust too low for "${actionType}" actions (score: ${effectiveScore.toFixed(2)}, required: ${config.threshold})`,
      trustScore: effectiveScore,
    };
  }

  return {
    allowed: true,
    reason: "Trust check passed",
    trustScore: effectiveScore,
  };
}

// ─── Whistleblower / Accountability ─────────────────────────────

/**
 * File a report against a citizen (whistleblower mechanism).
 *
 * Reports with sufficient severity automatically reduce reputation.
 * Multiple reports against the same citizen trigger escalation.
 */
export function fileReport(
  reporterId: string,
  targetId: string,
  domain: ReputationEvent["domain"],
  description: string,
  severity: Report["severity"],
  tick: number,
): Report {
  const report: Report = {
    id: `rpt-${uid().slice(0, 8)}`,
    reporterId,
    targetId,
    domain,
    description,
    severity,
    tick,
    timestamp: ts(),
    resolved: false,
  };

  reports.push(report);
  while (reports.length > MAX_REPORTS) {
    reports.shift();
  }

  // Apply reputation penalty based on severity
  const penalties: Record<Report["severity"], number> = {
    minor: -0.02,
    moderate: -0.05,
    severe: -0.1,
  };

  recordReputationEvent(targetId, domain, penalties[severity], `Report: ${description}`, {
    witnessId: reporterId,
    tick,
  });

  // Reward reporter (small incentive for accountability)
  recordReputationEvent(reporterId, "governance", 0.01, "Filed accountability report", { tick });

  return report;
}

/** Get unresolved reports */
export function getUnresolvedReports(): Report[] {
  return reports.filter((r) => !r.resolved);
}

/** Resolve a report */
export function resolveReport(reportId: string): boolean {
  const report = reports.find((r) => r.id === reportId);
  if (!report) {
    return false;
  }
  report.resolved = true;
  return true;
}

// ─── Reputation Decay ───────────────────────────────────────────

/**
 * Apply reputation decay — scores slowly drift toward neutral (0.5).
 *
 * This ensures that:
 * - High-reputation citizens must stay active to maintain status
 * - Low-reputation citizens can rehabilitate over time
 */
function applyDecay(): void {
  for (const profile of reputationLedger.values()) {
    for (const domain of ["economic", "task", "social", "governance"] as const) {
      const current = profile[domain];
      const diff = current - DEFAULT_REPUTATION;
      if (Math.abs(diff) > 0.001) {
        profile[domain] = current - diff * REPUTATION_DECAY_RATE;
      }
    }
    profile.composite = computeComposite(profile);
  }
}

// ─── Tick Integration ───────────────────────────────────────────

export interface ReputationTickResult {
  profilesTracked: number;
  totalReports: number;
  untrustedCitizens: number;
  decayApplied: boolean;
}

/**
 * Per-tick maintenance for the reputation system.
 *
 * - Applies reputation decay every N ticks
 * - Counts untrusted citizens for monitoring
 */
export function reputationTick(currentTick: number): ReputationTickResult {
  const decayApplied = currentTick > 0 && currentTick % DECAY_INTERVAL === 0;

  if (decayApplied) {
    applyDecay();
  }

  let untrusted = 0;
  for (const profile of reputationLedger.values()) {
    if (profile.composite < UNTRUSTED_THRESHOLD) {
      untrusted++;
    }
  }

  return {
    profilesTracked: reputationLedger.size,
    totalReports: reports.length,
    untrustedCitizens: untrusted,
    decayApplied,
  };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function reputationDiagnostics() {
  const profiles = [...reputationLedger.values()];
  const avgComposite =
    profiles.length > 0 ? profiles.reduce((sum, p) => sum + p.composite, 0) / profiles.length : 0;

  return {
    totalProfiles: reputationLedger.size,
    averageComposite: parseFloat(avgComposite.toFixed(3)),
    trustedCitizens: profiles.filter((p) => p.composite >= TRUSTED_THRESHOLD).length,
    untrustedCitizens: profiles.filter((p) => p.composite < UNTRUSTED_THRESHOLD).length,
    totalReports: reports.length,
    unresolvedReports: reports.filter((r) => !r.resolved).length,
  };
}

/** Reset reputation state (for testing) */
export function resetReputationState(): void {
  reputationLedger.clear();
  reports.length = 0;
}
