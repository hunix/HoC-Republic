/**
 * Republic Platform — Phase 25: Foreign Relations
 *
 * Diplomatic relations with external systems, APIs, and services:
 * - Foreign entity registration
 * - Alliance and treaty management
 * - Trade agreements
 * - Intel gathering and threat assessment
 * - Diplomatic channels
 */

import type { RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type ForeignEntityType =
  | "ai-service"
  | "api-provider"
  | "peer-republic"
  | "external-agent"
  | "human-organization"
  | "unknown";

export type RelationStatus =
  | "neutral"
  | "friendly"
  | "allied"
  | "hostile"
  | "embargo"
  | "unrecognized";

export interface ForeignEntity {
  id: string;
  name: string;
  type: ForeignEntityType;
  endpoint?: string;
  relationStatus: RelationStatus;
  trustScore: number; // 0–1
  interactionCount: number;
  lastContactAt?: string;
  registeredAt: string;
  metadata: Record<string, unknown>;
}

export interface Alliance {
  id: string;
  name: string;
  memberIds: string[]; // ForeignEntity IDs
  purpose: string;
  strength: number; // 0–1
  formedAt: string;
  expiresAt?: string;
  isActive: boolean;
}

export interface TradeAgreement {
  id: string;
  entityId: string;
  offerType: "compute" | "data" | "model" | "service" | "tokens";
  receiveType: "compute" | "data" | "model" | "service" | "tokens";
  exchangeRate: number;
  volumeLimit: number;
  volumeUsed: number;
  isActive: boolean;
  negotiatedAt: string;
  expiresAt?: string;
}

export interface IntelReport {
  id: string;
  entityId: string;
  category: "capability" | "threat" | "opportunity" | "behavior";
  content: string;
  confidence: number; // 0–1
  gatheredAt: string;
  source: string;
}

export interface ForeignRelationsDiagnostics {
  entityCount: number;
  allianceCount: number;
  activeTradeAgreements: number;
  intelReportCount: number;
  friendlyCount: number;
  hostileCount: number;
  averageTrust: number;
}

// ─── State ──────────────────────────────────────────────────────

const entities: ForeignEntity[] = [];
const alliances: Alliance[] = [];
const tradeAgreements: TradeAgreement[] = [];
const intelReports: IntelReport[] = [];

const MAX_INTEL = 500;

// ─── Entity Management ───────────────────────────────────────────

/** Register a new foreign entity. */
export function registerForeignEntity(
  name: string,
  type: ForeignEntityType,
  endpoint?: string,
  metadata: Record<string, unknown> = {},
): ForeignEntity {
  const entity: ForeignEntity = {
    id: uid(),
    name,
    type,
    endpoint,
    relationStatus: "neutral",
    trustScore: 0.5,
    interactionCount: 0,
    registeredAt: ts(),
    metadata,
  };
  entities.push(entity);
  return entity;
}

/** Update trust score for a foreign entity. */
export function updateTrust(entityId: string, delta: number): ForeignEntity | undefined {
  const entity = entities.find((e) => e.id === entityId);
  if (!entity) {return undefined;}
  entity.trustScore = Math.max(0, Math.min(1, entity.trustScore + delta));
  return entity;
}

/** Set diplomatic status for a foreign entity. */
export function setRelationStatus(entityId: string, status: RelationStatus): boolean {
  const entity = entities.find((e) => e.id === entityId);
  if (!entity) {return false;}
  entity.relationStatus = status;
  entity.lastContactAt = ts();
  return true;
}

/** Record an interaction with a foreign entity. */
export function recordInteraction(entityId: string): boolean {
  const entity = entities.find((e) => e.id === entityId);
  if (!entity) {return false;}
  entity.interactionCount++;
  entity.lastContactAt = ts();
  return true;
}

/** Get foreign entities, optionally filtered. */
export function getForeignEntities(opts?: {
  type?: ForeignEntityType;
  status?: RelationStatus;
}): ForeignEntity[] {
  let result = [...entities];
  if (opts?.type) {result = result.filter((e) => e.type === opts.type);}
  if (opts?.status) {result = result.filter((e) => e.relationStatus === opts.status);}
  return result;
}

// ─── Alliances ───────────────────────────────────────────────────

/** Form a new alliance. */
export function formAlliance(
  name: string,
  memberIds: string[],
  purpose: string,
  durationDays?: number,
): Alliance {
  const alliance: Alliance = {
    id: uid(),
    name,
    memberIds,
    purpose,
    strength: 0.5,
    formedAt: ts(),
    expiresAt: durationDays
      ? new Date(Date.now() + durationDays * 86400000).toISOString()
      : undefined,
    isActive: true,
  };
  alliances.push(alliance);

  // Upgrade member relations to allied
  for (const memberId of memberIds) {
    setRelationStatus(memberId, "allied");
  }

  return alliance;
}

/** Dissolve an alliance. */
export function dissolveAlliance(allianceId: string): boolean {
  const alliance = alliances.find((a) => a.id === allianceId);
  if (!alliance) {return false;}
  alliance.isActive = false;
  return true;
}

/** Get active alliances. */
export function getAlliances(opts?: { activeOnly?: boolean }): Alliance[] {
  if (opts?.activeOnly) {return alliances.filter((a) => a.isActive);}
  return [...alliances];
}

// ─── Trade Agreements ────────────────────────────────────────────

/** Negotiate a trade agreement. */
export function negotiateTradeAgreement(
  entityId: string,
  offerType: TradeAgreement["offerType"],
  receiveType: TradeAgreement["receiveType"],
  exchangeRate: number,
  volumeLimit: number,
  durationDays?: number,
): TradeAgreement {
  const agreement: TradeAgreement = {
    id: uid(),
    entityId,
    offerType,
    receiveType,
    exchangeRate,
    volumeLimit,
    volumeUsed: 0,
    isActive: true,
    negotiatedAt: ts(),
    expiresAt: durationDays
      ? new Date(Date.now() + durationDays * 86400000).toISOString()
      : undefined,
  };
  tradeAgreements.push(agreement);
  return agreement;
}

/** Execute a trade against an agreement. */
export function executeTrade(agreementId: string, volume: number): boolean {
  const agreement = tradeAgreements.find((a) => a.id === agreementId);
  if (!agreement || !agreement.isActive) {return false;}
  if (agreement.volumeUsed + volume > agreement.volumeLimit) {return false;}

  agreement.volumeUsed += volume;
  recordInteraction(agreement.entityId);
  return true;
}

/** Get trade agreements, optionally filtered. */
export function getTradeAgreements(opts?: {
  entityId?: string;
  activeOnly?: boolean;
}): TradeAgreement[] {
  let result = [...tradeAgreements];
  if (opts?.entityId) {result = result.filter((a) => a.entityId === opts.entityId);}
  if (opts?.activeOnly) {result = result.filter((a) => a.isActive);}
  return result;
}

// ─── Intelligence ────────────────────────────────────────────────

/** File an intelligence report. */
export function fileIntelReport(
  entityId: string,
  category: IntelReport["category"],
  content: string,
  confidence: number,
  source: string,
): IntelReport {
  const report: IntelReport = {
    id: uid(),
    entityId,
    category,
    content,
    confidence: Math.max(0, Math.min(1, confidence)),
    gatheredAt: ts(),
    source,
  };
  intelReports.push(report);
  if (intelReports.length > MAX_INTEL) {intelReports.shift();}
  return report;
}

/** Get intel reports for an entity. */
export function getIntelReports(opts?: {
  entityId?: string;
  category?: IntelReport["category"];
  limit?: number;
}): IntelReport[] {
  let result = [...intelReports];
  if (opts?.entityId) {result = result.filter((r) => r.entityId === opts.entityId);}
  if (opts?.category) {result = result.filter((r) => r.category === opts.category);}
  return result.slice(-(opts?.limit ?? 50));
}

// ─── Diagnostics ─────────────────────────────────────────────────

/** Get foreign relations diagnostics. */
export function getForeignRelationsDiagnostics(): ForeignRelationsDiagnostics {
  const avgTrust =
    entities.length > 0
      ? entities.reduce((sum, e) => sum + e.trustScore, 0) / entities.length
      : 0;

  return {
    entityCount: entities.length,
    allianceCount: alliances.filter((a) => a.isActive).length,
    activeTradeAgreements: tradeAgreements.filter((a) => a.isActive).length,
    intelReportCount: intelReports.length,
    friendlyCount: entities.filter((e) => e.relationStatus === "friendly" || e.relationStatus === "allied").length,
    hostileCount: entities.filter((e) => e.relationStatus === "hostile" || e.relationStatus === "embargo").length,
    averageTrust: Math.round(avgTrust * 100) / 100,
  };
}

// ─── Simulation Tick ─────────────────────────────────────────────

/** Foreign relations tick — drift trust, expire agreements, check alliances. */
export function foreignRelationsTick(_s: RepublicState): void {
  const now = new Date().toISOString();

  // Drift all trust scores slightly toward neutral (0.5)
  for (const entity of entities) {
    const drift = (0.5 - entity.trustScore) * 0.005;
    entity.trustScore = Math.max(0, Math.min(1, entity.trustScore + drift));
  }

  // Expire old trade agreements
  for (const agreement of tradeAgreements) {
    if (agreement.isActive && agreement.expiresAt && agreement.expiresAt < now) {
      agreement.isActive = false;
    }
  }

  // Deactivate expired alliances
  for (const alliance of alliances) {
    if (alliance.isActive && alliance.expiresAt && alliance.expiresAt < now) {
      alliance.isActive = false;
    }
  }
}
