/**
 * Republic Platform — Inter-Module Diplomacy & Event Bus
 *
 * Cross-cutting event bus enabling modules to react to each other:
 * - Event publishing & typed subscription
 * - Treaty system — formal inter-module cooperation agreements
 * - Conflict resolution when modules produce contradictory effects
 * - Diplomatic history & audit trail
 * - diplomacyTick() for treaty evaluation and event delivery
 */

import type { RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type DiplomacyDomain =
  | "economy"
  | "governance"
  | "education"
  | "military"
  | "technology"
  | "culture"
  | "infrastructure"
  | "agency"
  | "ai-fusion"
  | "creative"
  | "social";

export type DiplomacyEventKind =
  | "citizen_promoted"
  | "bill_passed"
  | "bill_vetoed"
  | "emergency_declared"
  | "budget_allocated"
  | "job_created"
  | "service_completed"
  | "chaos_started"
  | "proposal_deployed"
  | "model_selected"
  | "image_generated"
  | "document_generated"
  | "team_formed"
  | "workspace_created"
  | "goal_achieved"
  | "law_enacted"
  | "treaty_signed"
  | "conflict_resolved"
  | "custom";

export interface DiplomacyEvent {
  id: string;
  kind: DiplomacyEventKind;
  sourceDomain: DiplomacyDomain;
  payload: Record<string, unknown>;
  timestamp: string;
  citizenId?: string;
}

export type SubscriptionHandler = (event: DiplomacyEvent) => void;

export interface Subscription {
  id: string;
  domain: DiplomacyDomain;
  eventKinds: DiplomacyEventKind[];
  handler: SubscriptionHandler;
  registeredAt: string;
}

export type TreatyStatus = "proposed" | "active" | "suspended" | "expired" | "terminated";

export interface Treaty {
  id: string;
  name: string;
  parties: [DiplomacyDomain, DiplomacyDomain];
  status: TreatyStatus;
  terms: TreatyTerm[];
  proposedBy: string;
  signedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface TreatyTerm {
  description: string;
  effectType: "boost" | "restrict" | "share" | "sync";
  targetMetric: string;
  magnitude: number;
}

export type ConflictSeverity = "low" | "medium" | "high" | "critical";
export type ConflictResolution =
  | "domainA_wins"
  | "domainB_wins"
  | "compromise"
  | "escalate"
  | "dismissed";

export interface Conflict {
  id: string;
  domainA: DiplomacyDomain;
  domainB: DiplomacyDomain;
  description: string;
  severity: ConflictSeverity;
  resolution?: ConflictResolution;
  resolvedAt?: string;
  createdAt: string;
}

// ─── State ──────────────────────────────────────────────────────

const eventLog: DiplomacyEvent[] = [];
const subscriptions: Subscription[] = [];
const treaties: Treaty[] = [];
const conflicts: Conflict[] = [];
const MAX_EVENT_LOG = 500;
const MAX_CONFLICT_LOG = 200;

// ─── Event Bus ──────────────────────────────────────────────────

/**
 * Publish a diplomacy event. All matching subscribers are notified synchronously.
 */
export function publishEvent(
  kind: DiplomacyEventKind,
  sourceDomain: DiplomacyDomain,
  payload: Record<string, unknown>,
  citizenId?: string,
): DiplomacyEvent {
  const event: DiplomacyEvent = {
    id: uid(),
    kind,
    sourceDomain,
    payload,
    timestamp: ts(),
    citizenId,
  };

  eventLog.push(event);
  if (eventLog.length > MAX_EVENT_LOG) {
    eventLog.splice(0, eventLog.length - MAX_EVENT_LOG);
  }

  // Deliver to subscribers
  for (const sub of subscriptions) {
    if (sub.eventKinds.includes(kind) || sub.eventKinds.length === 0) {
      try {
        sub.handler(event);
      } catch {
        // Subscriber errors must never break the event bus
      }
    }
  }

  return event;
}

/**
 * Subscribe a domain to events of specific kinds.
 * Pass an empty array for eventKinds to receive all events.
 */
export function subscribe(
  domain: DiplomacyDomain,
  eventKinds: DiplomacyEventKind[],
  handler: SubscriptionHandler,
): Subscription {
  const sub: Subscription = {
    id: uid(),
    domain,
    eventKinds,
    handler,
    registeredAt: ts(),
  };
  subscriptions.push(sub);
  return sub;
}

/**
 * Unsubscribe by subscription ID.
 */
export function unsubscribe(subscriptionId: string): boolean {
  const idx = subscriptions.findIndex((s) => s.id === subscriptionId);
  if (idx >= 0) {
    subscriptions.splice(idx, 1);
    return true;
  }
  return false;
}

/**
 * Get recent events, optionally filtered by domain or kind.
 */
export function getEvents(opts?: {
  domain?: DiplomacyDomain;
  kind?: DiplomacyEventKind;
  limit?: number;
}): DiplomacyEvent[] {
  let result = eventLog.slice();
  if (opts?.domain) {
    result = result.filter((e) => e.sourceDomain === opts.domain);
  }
  if (opts?.kind) {
    result = result.filter((e) => e.kind === opts.kind);
  }
  return result.slice(-(opts?.limit ?? 50));
}

/**
 * Get active subscriptions.
 */
export function getSubscriptions(): Subscription[] {
  return [...subscriptions];
}

// ─── Treaty System ──────────────────────────────────────────────

/**
 * Propose a new treaty between two domains.
 */
export function proposeTreaty(
  name: string,
  partyA: DiplomacyDomain,
  partyB: DiplomacyDomain,
  terms: TreatyTerm[],
  proposedBy: string,
  durationDays?: number,
): Treaty {
  const now = new Date();
  const treaty: Treaty = {
    id: uid(),
    name,
    parties: [partyA, partyB],
    status: "proposed",
    terms,
    proposedBy,
    expiresAt: durationDays
      ? new Date(now.getTime() + durationDays * 86_400_000).toISOString()
      : undefined,
    createdAt: now.toISOString(),
  };
  treaties.push(treaty);

  publishEvent("treaty_signed", partyA, {
    treatyId: treaty.id,
    name,
    partyB,
    status: "proposed",
  });

  return treaty;
}

/**
 * Sign (activate) a proposed treaty.
 */
export function signTreaty(treatyId: string): Treaty | undefined {
  const treaty = treaties.find((t) => t.id === treatyId);
  if (!treaty || treaty.status !== "proposed") {
    return undefined;
  }

  treaty.status = "active";
  treaty.signedAt = ts();

  publishEvent("treaty_signed", treaty.parties[0], {
    treatyId: treaty.id,
    name: treaty.name,
    status: "active",
  });

  return treaty;
}

/**
 * Suspend an active treaty.
 */
export function suspendTreaty(treatyId: string, reason: string): Treaty | undefined {
  const treaty = treaties.find((t) => t.id === treatyId);
  if (!treaty || treaty.status !== "active") {
    return undefined;
  }

  treaty.status = "suspended";

  publishEvent("custom", treaty.parties[0], {
    treatyId: treaty.id,
    action: "suspended",
    reason,
  });

  return treaty;
}

/**
 * Terminate a treaty.
 */
export function terminateTreaty(treatyId: string): Treaty | undefined {
  const treaty = treaties.find((t) => t.id === treatyId);
  if (!treaty) {
    return undefined;
  }

  treaty.status = "terminated";
  return treaty;
}

/**
 * Get all treaties, optionally filtered by status or domain.
 */
export function getTreaties(opts?: { status?: TreatyStatus; domain?: DiplomacyDomain }): Treaty[] {
  let result = treaties.slice();
  if (opts?.status) {
    result = result.filter((t) => t.status === opts.status);
  }
  if (opts?.domain) {
    result = result.filter((t) => t.parties.includes(opts.domain!));
  }
  return result;
}

/**
 * Apply treaty effects — returns accumulated effect magnitudes per metric.
 */
export function getActiveTreatyEffects(domain: DiplomacyDomain): Record<string, number> {
  const effects: Record<string, number> = {};

  for (const treaty of treaties) {
    if (treaty.status !== "active") {
      continue;
    }
    if (!treaty.parties.includes(domain)) {
      continue;
    }

    for (const term of treaty.terms) {
      const sign = term.effectType === "restrict" ? -1 : 1;
      effects[term.targetMetric] = (effects[term.targetMetric] ?? 0) + term.magnitude * sign;
    }
  }

  return effects;
}

// ─── Conflict Resolution ────────────────────────────────────────

/**
 * Register a conflict between two domains.
 */
export function registerConflict(
  domainA: DiplomacyDomain,
  domainB: DiplomacyDomain,
  description: string,
  severity: ConflictSeverity = "medium",
): Conflict {
  const conflict: Conflict = {
    id: uid(),
    domainA,
    domainB,
    description,
    severity,
    createdAt: ts(),
  };
  conflicts.push(conflict);
  if (conflicts.length > MAX_CONFLICT_LOG) {
    conflicts.splice(0, conflicts.length - MAX_CONFLICT_LOG);
  }

  publishEvent("custom", domainA, {
    conflictId: conflict.id,
    domainB,
    severity,
    description,
  });

  return conflict;
}

/**
 * Resolve an existing conflict.
 */
export function resolveConflict(
  conflictId: string,
  resolution: ConflictResolution,
): Conflict | undefined {
  const conflict = conflicts.find((c) => c.id === conflictId);
  if (!conflict || conflict.resolution) {
    return undefined;
  }

  conflict.resolution = resolution;
  conflict.resolvedAt = ts();

  publishEvent("conflict_resolved", conflict.domainA, {
    conflictId: conflict.id,
    resolution,
    domainA: conflict.domainA,
    domainB: conflict.domainB,
  });

  return conflict;
}

/**
 * Get conflicts, optionally filtered.
 */
export function getConflicts(opts?: {
  resolved?: boolean;
  severity?: ConflictSeverity;
  domain?: DiplomacyDomain;
}): Conflict[] {
  let result = conflicts.slice();
  if (opts?.resolved !== undefined) {
    result = result.filter((c) => (opts.resolved ? !!c.resolution : !c.resolution));
  }
  if (opts?.severity) {
    result = result.filter((c) => c.severity === opts.severity);
  }
  if (opts?.domain) {
    result = result.filter((c) => c.domainA === opts.domain || c.domainB === opts.domain);
  }
  return result;
}

// ─── Tick ───────────────────────────────────────────────────────

/**
 * Diplomacy tick — expire treaties, auto-resolve stale conflicts.
 */
export function diplomacyTick(_s: RepublicState): void {
  const now = Date.now();

  // Expire treaties past their expiry date
  for (const treaty of treaties) {
    if (treaty.status === "active" && treaty.expiresAt) {
      if (new Date(treaty.expiresAt).getTime() < now) {
        treaty.status = "expired";
        publishEvent("custom", treaty.parties[0], {
          treatyId: treaty.id,
          action: "expired",
        });
      }
    }
  }

  // Auto-dismiss low-severity conflicts older than 100 ticks
  const cutoff = new Date(now - 100 * 5_000).toISOString(); // ~500 sec
  for (const conflict of conflicts) {
    if (!conflict.resolution && conflict.severity === "low" && conflict.createdAt < cutoff) {
      conflict.resolution = "dismissed";
      conflict.resolvedAt = ts();
    }
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface DiplomacyDiagnostics {
  totalEvents: number;
  activeSubscriptions: number;
  totalTreaties: number;
  activeTreaties: number;
  totalConflicts: number;
  unresolvedConflicts: number;
  eventsByDomain: Record<string, number>;
  treatyByStatus: Record<string, number>;
}

export function getDiplomacyDiagnostics(): DiplomacyDiagnostics {
  const eventsByDomain: Record<string, number> = {};
  for (const e of eventLog) {
    eventsByDomain[e.sourceDomain] = (eventsByDomain[e.sourceDomain] ?? 0) + 1;
  }

  const treatyByStatus: Record<string, number> = {};
  for (const t of treaties) {
    treatyByStatus[t.status] = (treatyByStatus[t.status] ?? 0) + 1;
  }

  return {
    totalEvents: eventLog.length,
    activeSubscriptions: subscriptions.length,
    totalTreaties: treaties.length,
    activeTreaties: treaties.filter((t) => t.status === "active").length,
    totalConflicts: conflicts.length,
    unresolvedConflicts: conflicts.filter((c) => !c.resolution).length,
    eventsByDomain,
    treatyByStatus,
  };
}
