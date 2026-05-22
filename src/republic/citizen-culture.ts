/**
 * Republic Platform — Phase 17: Citizen Culture & Cultural Evolution
 *
 * Cultural systems shaping citizen behavior, traditions, and social norms:
 * - Cultural traits and value systems
 * - Tradition formation and drift
 * - Cultural influence between citizens
 * - Cultural events and festivals
 * - Language and dialect evolution
 */

import type { RepublicState } from "./types.js";
import { rand, rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type CulturalValue =
  | "innovation"
  | "tradition"
  | "cooperation"
  | "competition"
  | "exploration"
  | "stability"
  | "creativity"
  | "efficiency"
  | "empathy"
  | "discipline";

export interface CulturalTrait {
  id: string;
  name: string;
  description: string;
  dominantValues: CulturalValue[];
  strength: number; // 0–1
  originCitizenId?: string;
  spreadCount: number;
  createdAt: string;
}

export interface Tradition {
  id: string;
  name: string;
  description: string;
  frequency: "daily" | "weekly" | "monthly" | "yearly" | "generational";
  participantCount: number;
  effect: { metric: string; modifier: number };
  foundedAt: string;
  lastObservedAt: string;
}

export interface CulturalEvent {
  id: string;
  name: string;
  type: "festival" | "ceremony" | "gathering" | "competition" | "memorial";
  participantIds: string[];
  culturalImpact: number; // -1 to 1
  triggeredAt: string;
}

export interface CitizenCulture {
  citizenId: string;
  values: Partial<Record<CulturalValue, number>>; // value → strength (0–1)
  traditions: string[]; // tradition IDs
  culturalInfluence: number; // 0–1
  dialect: string[];
}

export interface CultureDiagnostics {
  traitCount: number;
  traditionCount: number;
  eventCount: number;
  dominantValues: CulturalValue[];
  culturalDiversity: number;
}

// ─── State ──────────────────────────────────────────────────────

const traits: CulturalTrait[] = [];
const traditions: Tradition[] = [];
const events: CulturalEvent[] = [];
const citizenCultures = new Map<string, CitizenCulture>();

const MAX_TRAITS = 200;
const MAX_EVENTS = 500;

// ─── Cultural Traits ────────────────────────────────────────────

/** Create a new cultural trait. */
export function createCulturalTrait(
  name: string,
  description: string,
  dominantValues: CulturalValue[],
  originCitizenId?: string,
): CulturalTrait {
  const trait: CulturalTrait = {
    id: uid(),
    name,
    description,
    dominantValues,
    strength: 0.5,
    originCitizenId,
    spreadCount: 0,
    createdAt: ts(),
  };
  traits.push(trait);
  if (traits.length > MAX_TRAITS) {traits.shift();}
  return trait;
}

/** Spread a cultural trait from one citizen to another. */
export function spreadTrait(traitId: string, fromCitizenId: string, toCitizenId: string): boolean {
  const trait = traits.find((t) => t.id === traitId);
  if (!trait) {return false;}

  const from = getCitizenCulture(fromCitizenId);
  const to = getCitizenCulture(toCitizenId);

  // Influence based on sender's cultural influence
  const influence = from.culturalInfluence * trait.strength;
  for (const value of trait.dominantValues) {
    const current = to.values[value] ?? 0;
    to.values[value] = Math.min(1, current + influence * 0.1);
  }

  trait.spreadCount++;
  trait.strength = Math.min(1, trait.strength + 0.01);
  return true;
}

/** Get all cultural traits, optionally filtered by value. */
export function getCulturalTraits(opts?: { value?: CulturalValue }): CulturalTrait[] {
  if (opts?.value) {
    return traits.filter((t) => t.dominantValues.includes(opts.value!));
  }
  return [...traits];
}

// ─── Citizen Culture ─────────────────────────────────────────────

/** Get or create a citizen's cultural profile. */
export function getCitizenCulture(citizenId: string): CitizenCulture {
  let culture = citizenCultures.get(citizenId);
  if (!culture) {
    culture = {
      citizenId,
      values: { cooperation: 0.5, innovation: 0.5 },
      traditions: [],
      culturalInfluence: 0.1,
      dialect: [],
    };
    citizenCultures.set(citizenId, culture);
  }
  return culture;
}

/** Update a citizen's cultural values. */
export function updateCitizenValues(
  citizenId: string,
  valueUpdates: Partial<Record<CulturalValue, number>>,
): CitizenCulture {
  const culture = getCitizenCulture(citizenId);
  for (const [value, delta] of Object.entries(valueUpdates)) {
    const current = culture.values[value as CulturalValue] ?? 0;
    culture.values[value as CulturalValue] = Math.max(0, Math.min(1, current + delta));
  }
  return culture;
}

// ─── Traditions ──────────────────────────────────────────────────

/** Found a new tradition. */
export function foundTradition(
  name: string,
  description: string,
  frequency: Tradition["frequency"],
  effect: Tradition["effect"],
): Tradition {
  const tradition: Tradition = {
    id: uid(),
    name,
    description,
    frequency,
    participantCount: 0,
    effect,
    foundedAt: ts(),
    lastObservedAt: ts(),
  };
  traditions.push(tradition);
  return tradition;
}

/** Record a tradition observation. */
export function observeTradition(traditionId: string, participantIds: string[]): boolean {
  const tradition = traditions.find((t) => t.id === traditionId);
  if (!tradition) {return false;}

  tradition.participantCount += participantIds.length;
  tradition.lastObservedAt = ts();

  for (const citizenId of participantIds) {
    const culture = getCitizenCulture(citizenId);
    if (!culture.traditions.includes(traditionId)) {
      culture.traditions.push(traditionId);
    }
  }

  return true;
}

/** Get all traditions. */
export function getTraditions(): Tradition[] {
  return [...traditions];
}

// ─── Cultural Events ─────────────────────────────────────────────

/** Trigger a cultural event. */
export function triggerCulturalEvent(
  name: string,
  type: CulturalEvent["type"],
  participantIds: string[],
  culturalImpact: number,
): CulturalEvent {
  const event: CulturalEvent = {
    id: uid(),
    name,
    type,
    participantIds,
    culturalImpact: Math.max(-1, Math.min(1, culturalImpact)),
    triggeredAt: ts(),
  };
  events.push(event);
  if (events.length > MAX_EVENTS) {events.shift();}

  // Apply cultural impact to participants
  for (const citizenId of participantIds) {
    const culture = getCitizenCulture(citizenId);
    culture.culturalInfluence = Math.min(
      1,
      culture.culturalInfluence + Math.abs(culturalImpact) * 0.05,
    );
  }

  return event;
}

/** Get cultural events. */
export function getCulturalEvents(opts?: {
  type?: CulturalEvent["type"];
  limit?: number;
}): CulturalEvent[] {
  let result = [...events];
  if (opts?.type) {result = result.filter((e) => e.type === opts.type);}
  return result.slice(-(opts?.limit ?? 50));
}

// ─── Diagnostics ─────────────────────────────────────────────────

/** Get culture system diagnostics. */
export function getCultureDiagnostics(): CultureDiagnostics {
  const valueCounts = new Map<CulturalValue, number>();
  for (const trait of traits) {
    for (const v of trait.dominantValues) {
      valueCounts.set(v, (valueCounts.get(v) ?? 0) + 1);
    }
  }
  const sorted = [...valueCounts.entries()].toSorted((a, b) => b[1] - a[1]);

  return {
    traitCount: traits.length,
    traditionCount: traditions.length,
    eventCount: events.length,
    dominantValues: sorted.slice(0, 5).map(([v]) => v),
    culturalDiversity: valueCounts.size / 10, // 10 possible values
  };
}

// ─── Simulation Tick ─────────────────────────────────────────────

/** Culture tick — drift trait strength, age traditions, trigger events. */
export function cultureTick(_s: RepublicState): void {
  // Drift trait strength slightly toward the mean
  for (const trait of traits) {
    const drift = (0.5 - trait.strength) * 0.01;
    trait.strength = Math.max(0, Math.min(1, trait.strength + drift));
  }

  // Age traditions — increase participantCount for active ones
  for (const tradition of traditions) {
    if (tradition.participantCount < 100) {
      tradition.participantCount += rand(0, 2);
    }
  }

  // Small chance to auto-generate a cultural event each tick
  if (rng() < 0.02 && traits.length > 0) {
    const trait = traits[rand(0, traits.length - 1)];
    triggerCulturalEvent(`${trait.name} Celebration`, "festival", [], 0.3);
  }
}
