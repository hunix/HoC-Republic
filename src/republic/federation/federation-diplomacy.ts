/**
 * Republic Platform — Inter-Republic Federation Diplomacy
 *
 * Enables multiple independent Republic instances operating in a cluster
 * to establish formal inter-republic relations:
 *
 *   PEACE TREATIES      — mutual non-aggression, trade bonuses
 *   TRADE AGREEMENTS    — citizen credit exchange rates, resource sharing
 *   MILITARY ALLIANCES  — combined defense, joint military ticks
 *   BORDER CONFLICTS    — territory or resource disputes with escalation
 *   CULTURAL EXCHANGES  — citizen migration, meme propagation across borders
 *   FEDERATION CHARTER  — multi-republic democratic council (voting on global laws)
 *
 * Each Republic is identified by its instance ID (from hoc_instances table).
 * Relations are stored locally and synced to Supabase for cluster coordination.
 *
 * Action pipeline:
 *   propose → negotiate → ratify → active → (expire | terminate | war)
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { ts, uid } from "../utils.js";

const logger = createSubsystemLogger("republic:federation-diplomacy");

// ─── Types ──────────────────────────────────────────────────────

export type FederationRelationType =
  | "neutral"
  | "peace_treaty"
  | "trade_agreement"
  | "military_alliance"
  | "cultural_exchange"
  | "federation_charter"
  | "border_dispute"
  | "cold_war"
  | "war";

export type RelationStatus =
  | "proposed"
  | "negotiating"
  | "active"
  | "suspended"
  | "expired"
  | "terminated";
export type EscalationLevel = "none" | "tension" | "sanctions" | "proxy_war" | "open_war";
export type VoteChoice = "yes" | "no" | "abstain";

export interface FederationRelation {
  id: string;
  type: FederationRelationType;
  instanceIdA: string;
  instanceIdB: string;
  status: RelationStatus;
  proposedBy: string; // instance ID who proposed
  terms: RelationTerm[];
  trustScore: number; // 0–1 (decays on violations, grows with cooperation)
  tradeVolume: number; // USD equivalent exchanged historically
  createdAt: string;
  activatedAt?: string;
  expiresAt?: string;
  lastInteraction: string;
}

export interface RelationTerm {
  id: string;
  description: string;
  type:
    | "credit_exchange"
    | "citizen_migration"
    | "military_pact"
    | "data_sharing"
    | "resource_pool"
    | "cultural_bond";
  value: number; // exchange rate, pct, or count depending on type
  binding: boolean; // binding terms cause trust penalty if violated
}

export interface TradeTransaction {
  id: string;
  relationId: string;
  fromInstanceId: string;
  toInstanceId: string;
  resourceType: "credits" | "data" | "citizens" | "compute";
  amount: number;
  exchangeRate: number;
  timestamp: string;
}

export interface BorderIncident {
  id: string;
  instanceIdA: string;
  instanceIdB: string;
  description: string;
  escalation: EscalationLevel;
  resolvedAt?: string;
  createdAt: string;
}

export interface FederationCouncilMotion {
  id: string;
  title: string;
  description: string;
  proposedBy: string; // instance ID
  votes: Record<string, VoteChoice>; // instanceId → vote
  eligibleVoters: string[]; // instance IDs in federation
  status: "open" | "passed" | "rejected" | "withdrawn";
  quorum: number; // pct required, e.g. 0.6
  passThreshold: number; // pct of yes votes required, e.g. 0.5
  createdAt: string;
  closedAt?: string;
}

export interface FederationDiagnostics {
  localInstanceId: string;
  totalRelations: number;
  activeRelations: number;
  warRelations: number;
  avgTrustScore: number;
  totalTradeVolume: number;
  openBorderIncidents: number;
  openCouncilMotions: number;
  relationsByType: Record<FederationRelationType, number>;
}

// ─── State ──────────────────────────────────────────────────────

let localInstanceId = "unknown";
const relations = new Map<string, FederationRelation>();
const tradeHistory: TradeTransaction[] = [];
const borderIncidents: BorderIncident[] = [];
const councilMotions: FederationCouncilMotion[] = [];

const MAX_TRADE_HISTORY = 1000;
const MAX_BORDER_INCIDENTS = 500;

// ─── Initialization ──────────────────────────────────────────────

export function setLocalInstanceId(instanceId: string): void {
  localInstanceId = instanceId;
  logger.info(`Federation diplomacy initialized — local instance: ${instanceId}`);
}

export function getLocalInstanceId(): string {
  return localInstanceId;
}

// ─── Relation Management ─────────────────────────────────────────

/**
 * Propose a new inter-republic relation of any type.
 * The other party must call ratifyRelation() to activate it.
 */
export function proposeRelation(
  targetInstanceId: string,
  type: FederationRelationType,
  terms: Omit<RelationTerm, "id">[],
  durationDays?: number,
): FederationRelation {
  const relation: FederationRelation = {
    id: uid(),
    type,
    instanceIdA: localInstanceId,
    instanceIdB: targetInstanceId,
    status: "proposed",
    proposedBy: localInstanceId,
    terms: terms.map((t) => ({ ...t, id: uid() })),
    trustScore: getOrInitTrust(targetInstanceId),
    tradeVolume: 0,
    createdAt: ts(),
    lastInteraction: ts(),
    expiresAt: durationDays
      ? new Date(Date.now() + durationDays * 86_400_000).toISOString()
      : undefined,
  };

  relations.set(relation.id, relation);

  logger.info(
    `Proposed ${type} with ${targetInstanceId} (${terms.length} terms, expires: ${relation.expiresAt ?? "never"})`,
  );

  return relation;
}

/**
 * Ratify (activate) a proposed relation from the other party.
 */
export function ratifyRelation(relationId: string): FederationRelation | null {
  const relation = relations.get(relationId);
  if (!relation || relation.status !== "proposed") {
    return null;
  }

  relation.status = "active";
  relation.activatedAt = ts();
  relation.lastInteraction = ts();
  relation.trustScore = Math.min(1, relation.trustScore + 0.05);

  logger.info(`Relation ${relation.type} with ${relation.instanceIdB} ACTIVATED`);
  return relation;
}

/**
 * Suspend a relation (without terminating — negotiation can resume it).
 */
export function suspendRelation(relationId: string, reason: string): FederationRelation | null {
  const relation = relations.get(relationId);
  if (!relation || relation.status !== "active") {
    return null;
  }

  relation.status = "suspended";
  relation.trustScore = Math.max(0, relation.trustScore - 0.1);
  relation.lastInteraction = ts();

  logger.warn(`Relation ${relation.type} with ${relation.instanceIdB} SUSPENDED — ${reason}`);
  return relation;
}

/**
 * Terminate a relation permanently and downgrade to "neutral".
 */
export function terminateRelation(relationId: string, reason: string): FederationRelation | null {
  const relation = relations.get(relationId);
  if (!relation) {
    return null;
  }

  relation.status = "terminated";
  relation.trustScore = Math.max(0, relation.trustScore - 0.2);
  relation.lastInteraction = ts();

  logger.warn(`Relation ${relation.type} with ${relation.instanceIdB} TERMINATED — ${reason}`);
  return relation;
}

/**
 * Escalate a relation to active war.
 * Creates a BorderIncident and sets relation type to "war".
 */
export function declareWar(targetInstanceId: string, casus_belli: string): BorderIncident {
  // Terminate all peaceful relations with this instance
  for (const relation of relations.values()) {
    if (
      (relation.instanceIdA === targetInstanceId || relation.instanceIdB === targetInstanceId) &&
      relation.status === "active" &&
      relation.type !== "war"
    ) {
      relation.status = "terminated";
      relation.trustScore = Math.max(0, relation.trustScore - 0.4);
    }
  }

  // Create war relation
  const warRelation = proposeRelation(targetInstanceId, "war", []);
  warRelation.status = "active";
  warRelation.activatedAt = ts();

  const incident: BorderIncident = {
    id: uid(),
    instanceIdA: localInstanceId,
    instanceIdB: targetInstanceId,
    description: `War declared: ${casus_belli}`,
    escalation: "open_war",
    createdAt: ts(),
  };

  borderIncidents.push(incident);
  logger.warn(`⚔️  WAR DECLARED with instance ${targetInstanceId} — ${casus_belli}`);
  return incident;
}

/**
 * Propose and sign a peace agreement between two war-state instances.
 */
export function proposePeace(targetInstanceId: string, reparationCredits = 0): FederationRelation {
  // Close war relations
  for (const relation of relations.values()) {
    if (
      (relation.instanceIdA === targetInstanceId || relation.instanceIdB === targetInstanceId) &&
      relation.type === "war" &&
      relation.status === "active"
    ) {
      relation.status = "terminated";
    }
  }

  const peace = proposeRelation(targetInstanceId, "peace_treaty", [
    {
      description: `Reparation payment from ${localInstanceId}`,
      type: "credit_exchange",
      value: reparationCredits,
      binding: true,
    },
  ]);

  logger.info(
    `🕊️  Peace proposed with ${targetInstanceId} — reparations: ${reparationCredits} credits`,
  );
  return peace;
}

// ─── Trade System ────────────────────────────────────────────────

/**
 * Execute a trade transaction between two republic instances.
 * Requires an active trade agreement or alliance.
 */
export function executeTrade(
  toInstanceId: string,
  resourceType: TradeTransaction["resourceType"],
  amount: number,
  exchangeRate = 1.0,
): TradeTransaction | null {
  const activeRelation = getActiveRelation(toInstanceId);
  if (!activeRelation || activeRelation.type === "war" || activeRelation.type === "cold_war") {
    logger.warn(`Trade with ${toInstanceId} blocked — no active agreement or at war`);
    return null;
  }

  const tx: TradeTransaction = {
    id: uid(),
    relationId: activeRelation.id,
    fromInstanceId: localInstanceId,
    toInstanceId,
    resourceType,
    amount,
    exchangeRate,
    timestamp: ts(),
  };

  tradeHistory.unshift(tx);
  if (tradeHistory.length > MAX_TRADE_HISTORY) {
    tradeHistory.length = MAX_TRADE_HISTORY;
  }

  activeRelation.tradeVolume += amount * exchangeRate;
  activeRelation.trustScore = Math.min(1, activeRelation.trustScore + 0.001);
  activeRelation.lastInteraction = ts();

  logger.debug(`Trade: ${amount} ${resourceType} → ${toInstanceId} @ ${exchangeRate}x`);
  return tx;
}

// ─── Federation Council ──────────────────────────────────────────

/**
 * Propose a motion to the Federation Council.
 * All charter-member instances can vote.
 */
export function proposeCouncilMotion(
  title: string,
  description: string,
  eligibleVoters: string[],
  quorum = 0.6,
  passThreshold = 0.5,
): FederationCouncilMotion {
  const motion: FederationCouncilMotion = {
    id: uid(),
    title,
    description,
    proposedBy: localInstanceId,
    votes: {},
    eligibleVoters,
    status: "open",
    quorum,
    passThreshold,
    createdAt: ts(),
  };

  councilMotions.push(motion);
  logger.info(`Council motion proposed: "${title}" (${eligibleVoters.length} eligible voters)`);
  return motion;
}

/**
 * Cast a vote on an open council motion.
 */
export function voteOnMotion(motionId: string, vote: VoteChoice): FederationCouncilMotion | null {
  const motion = councilMotions.find((m) => m.id === motionId);
  if (!motion || motion.status !== "open") {
    return null;
  }
  if (!motion.eligibleVoters.includes(localInstanceId)) {
    logger.warn(`Instance ${localInstanceId} is not eligible to vote on motion ${motionId}`);
    return null;
  }

  motion.votes[localInstanceId] = vote;

  // Check if quorum reached and tally
  const totalVotes = Object.keys(motion.votes).length;
  const quorumReached = totalVotes / motion.eligibleVoters.length >= motion.quorum;

  if (quorumReached) {
    const yesVotes = Object.values(motion.votes).filter((v) => v === "yes").length;
    const yesPct = yesVotes / totalVotes;

    if (yesPct >= motion.passThreshold) {
      motion.status = "passed";
      motion.closedAt = ts();
      logger.info(`Council motion PASSED: "${motion.title}" (${(yesPct * 100).toFixed(0)}% yes)`);
    } else {
      motion.status = "rejected";
      motion.closedAt = ts();
      logger.info(`Council motion REJECTED: "${motion.title}" (${(yesPct * 100).toFixed(0)}% yes)`);
    }
  }

  return motion;
}

// ─── Border Incidents ────────────────────────────────────────────

export function reportBorderIncident(
  targetInstanceId: string,
  description: string,
  escalation: EscalationLevel = "tension",
): BorderIncident {
  const incident: BorderIncident = {
    id: uid(),
    instanceIdA: localInstanceId,
    instanceIdB: targetInstanceId,
    description,
    escalation,
    createdAt: ts(),
  };

  borderIncidents.push(incident);
  if (borderIncidents.length > MAX_BORDER_INCIDENTS) {
    borderIncidents.splice(0, borderIncidents.length - MAX_BORDER_INCIDENTS);
  }

  // Decrease trust based on escalation
  const trustPenalty: Record<EscalationLevel, number> = {
    none: 0,
    tension: 0.02,
    sanctions: 0.08,
    proxy_war: 0.15,
    open_war: 0.4,
  };

  const activeRelation = getActiveRelation(targetInstanceId);
  if (activeRelation) {
    activeRelation.trustScore = Math.max(
      0,
      activeRelation.trustScore - (trustPenalty[escalation] ?? 0),
    );
  }

  logger.warn(`Border incident with ${targetInstanceId} [${escalation}]: ${description}`);
  return incident;
}

export function resolveIncident(incidentId: string): BorderIncident | null {
  const incident = borderIncidents.find((i) => i.id === incidentId);
  if (!incident || incident.resolvedAt) {
    return null;
  }
  incident.resolvedAt = ts();
  return incident;
}

// ─── Helpers ────────────────────────────────────────────────────

function getOrInitTrust(targetInstanceId: string): number {
  for (const r of relations.values()) {
    if (r.instanceIdA === targetInstanceId || r.instanceIdB === targetInstanceId) {
      return r.trustScore;
    }
  }
  return 0.5; // Default neutral trust
}

function getActiveRelation(targetInstanceId: string): FederationRelation | null {
  for (const r of relations.values()) {
    if (
      (r.instanceIdA === targetInstanceId || r.instanceIdB === targetInstanceId) &&
      r.status === "active"
    ) {
      return r;
    }
  }
  return null;
}

// ─── Federation Tick ─────────────────────────────────────────────

/**
 * Called each tick to expire treaties, decay stale trust, and auto-resolve old incidents.
 */
export function federationTick(): void {
  const now = Date.now();

  // Expire time-limited relations
  for (const relation of relations.values()) {
    if (relation.status === "active" && relation.expiresAt) {
      if (new Date(relation.expiresAt).getTime() < now) {
        relation.status = "expired";
        logger.info(`Relation ${relation.type} with ${relation.instanceIdB} EXPIRED`);
      }
    }
  }

  // Trust decay on inactive relations (relations need regular interaction)
  for (const relation of relations.values()) {
    if (relation.status === "active") {
      const msSinceInteraction = now - new Date(relation.lastInteraction).getTime();
      if (msSinceInteraction > 24 * 60 * 60 * 1000) {
        // 24h
        relation.trustScore = Math.max(0.1, relation.trustScore - 0.001);
      }
    }
  }

  // Auto-resolve old tension-level incidents
  const staleMs = 30 * 60 * 1000; // 30 min
  for (const incident of borderIncidents) {
    if (!incident.resolvedAt && incident.escalation === "tension") {
      if (now - new Date(incident.createdAt).getTime() > staleMs) {
        incident.resolvedAt = ts();
      }
    }
  }
}

// ─── Query ───────────────────────────────────────────────────────

export function getRelations(opts?: {
  type?: FederationRelationType;
  status?: RelationStatus;
  targetInstanceId?: string;
}): FederationRelation[] {
  let result = [...relations.values()];
  if (opts?.type) {
    result = result.filter((r) => r.type === opts.type);
  }
  if (opts?.status) {
    result = result.filter((r) => r.status === opts.status);
  }
  if (opts?.targetInstanceId) {
    result = result.filter(
      (r) => r.instanceIdA === opts.targetInstanceId || r.instanceIdB === opts.targetInstanceId,
    );
  }
  return result;
}

export function getRelation(id: string): FederationRelation | undefined {
  return relations.get(id);
}

export function getTradeHistory(limit = 50): TradeTransaction[] {
  return tradeHistory.slice(0, limit);
}

export function getBorderIncidents(onlyOpen = false): BorderIncident[] {
  return onlyOpen ? borderIncidents.filter((i) => !i.resolvedAt) : [...borderIncidents];
}

export function getCouncilMotions(
  status?: FederationCouncilMotion["status"],
): FederationCouncilMotion[] {
  return status ? councilMotions.filter((m) => m.status === status) : [...councilMotions];
}

export function getFederationDiagnostics(): FederationDiagnostics {
  const activeRelations = [...relations.values()].filter((r) => r.status === "active");
  const byType = {} as Record<FederationRelationType, number>;
  for (const r of relations.values()) {
    byType[r.type] = (byType[r.type] ?? 0) + 1;
  }
  const totalTrust = activeRelations.reduce((s, r) => s + r.trustScore, 0);

  return {
    localInstanceId,
    totalRelations: relations.size,
    activeRelations: activeRelations.length,
    warRelations: activeRelations.filter((r) => r.type === "war").length,
    avgTrustScore:
      activeRelations.length > 0 ? parseFloat((totalTrust / activeRelations.length).toFixed(3)) : 0,
    totalTradeVolume: parseFloat(
      [...relations.values()].reduce((s, r) => s + r.tradeVolume, 0).toFixed(2),
    ),
    openBorderIncidents: borderIncidents.filter((i) => !i.resolvedAt).length,
    openCouncilMotions: councilMotions.filter((m) => m.status === "open").length,
    relationsByType: byType,
  };
}
