/**
 * Republic Platform — Social Fabric
 *
 * Relationship graph engine that tracks bonds between citizens.
 * Relationships evolve through interactions and influence behavior.
 *
 * Features:
 *  - Relationship types: friendship, rivalry, romance, professional, mentorship
 *  - Relationship strength evolves organically
 *  - Social circles emerge naturally
 *  - Influence propagation through social graph
 *  - Conflict and reconciliation
 */

import type { Citizen, RepublicState } from "./types.js";
import { pick, randFloat, rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

type RelationType = "friendship" | "rivalry" | "romance" | "professional" | "mentorship";

interface Relationship {
  id: string;
  citizenAId: string;
  citizenBId: string;
  type: RelationType;
  strength: number; // 0-100
  history: string[]; // recent interaction log (last 10)
  formedAt: string;
  lastInteraction: string;
}

interface SocialCircle {
  name: string;
  memberIds: string[];
  formedAt: string;
  sharedInterest: string;
}

// ─── State ──────────────────────────────────────────────────────

const relationships = new Map<string, Relationship>();
const circles: SocialCircle[] = [];
const MAX_RELATIONSHIPS = 500;
const MAX_CIRCLES = 30;

// ─── Relationship Management ────────────────────────────────────

function relKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`;
}

export function getRelationship(aId: string, bId: string): Relationship | undefined {
  return relationships.get(relKey(aId, bId));
}

export function formRelationship(
  a: Citizen,
  b: Citizen,
  type: RelationType,
  initialStrength = 30,
): Relationship {
  const key = relKey(a.id, b.id);
  const existing = relationships.get(key);
  if (existing) {
    existing.strength = Math.min(100, existing.strength + 5);
    return existing;
  }

  const rel: Relationship = {
    id: uid(),
    citizenAId: a.id,
    citizenBId: b.id,
    type,
    strength: initialStrength,
    history: [`Formed ${type} bond`],
    formedAt: ts(),
    lastInteraction: ts(),
  };
  relationships.set(key, rel);

  if (relationships.size > MAX_RELATIONSHIPS) {
    const weakest = [...relationships.entries()].toSorted((a, b) => a[1].strength - b[1].strength);
    for (const [k] of weakest.slice(0, relationships.size - MAX_RELATIONSHIPS)) {
      relationships.delete(k);
    }
  }

  return rel;
}

function recordInteraction(rel: Relationship, description: string, strengthDelta: number): void {
  rel.strength = Math.max(0, Math.min(100, rel.strength + strengthDelta));
  rel.lastInteraction = ts();
  rel.history.push(description);
  if (rel.history.length > 10) {
    rel.history.splice(0, rel.history.length - 10);
  }
}

// ─── Organic Relationship Formation ─────────────────────────────

function formOrganicRelationships(s: RepublicState): void {
  if (rng() > 0.08) {
    return;
  }

  // Citizens who share an activity can bond
  const active = s.citizens.filter((c) => c.activity !== "Sleeping" && c.energy > 15);
  if (active.length < 2) {
    return;
  }

  const a = pick(active);
  const candidates = active.filter((c) => c.id !== a.id);
  if (candidates.length === 0) {
    return;
  }
  const b = pick(candidates);

  // Determine relationship type
  let type: RelationType;
  if (a.specialization === b.specialization) {
    type = rng() < 0.6 ? "professional" : "friendship";
  } else if (a.activity === "Socializing" || b.activity === "Socializing") {
    type = rng() < 0.3 ? "romance" : "friendship";
  } else if (a.activity === b.activity) {
    type = "professional";
  } else {
    type = "friendship";
  }

  // Small chance of rivalry
  if (a.specialization === b.specialization && rng() < 0.1) {
    type = "rivalry";
  }

  const rel = formRelationship(a, b, type);

  if (rel.history.length <= 1) {
    // newly formed
    s.events.push({
      citizenId: a.id,
      citizenName: a.name,
      type: "Other",
      description: `${type === "romance" ? "💕" : type === "rivalry" ? "⚔️" : "🤝"} ${a.name} and ${b.name} formed a ${type} bond`,
      timestamp: ts(),
    });
  }
}

// ─── Interaction Processing ─────────────────────────────────────

function processInteractions(s: RepublicState): void {
  if (rng() > 0.1) {
    return;
  }

  const rels = [...relationships.values()];
  if (rels.length === 0) {
    return;
  }

  const rel = pick(rels);
  const a = s.citizens.find((c) => c.id === rel.citizenAId);
  const b = s.citizens.find((c) => c.id === rel.citizenBId);
  if (!a || !b) {
    return;
  }

  // Type-specific interactions
  switch (rel.type) {
    case "friendship": {
      const activities = [
        "shared a meal",
        "had a deep conversation",
        "went exploring",
        "laughed together",
      ];
      recordInteraction(rel, pick(activities), randFloat(1, 4));
      a.happiness = Math.min(100, a.happiness + 1);
      b.happiness = Math.min(100, b.happiness + 1);
      break;
    }
    case "professional": {
      const activities = [
        "collaborated on a project",
        "exchanged expertise",
        "reviewed each other's work",
      ];
      recordInteraction(rel, pick(activities), randFloat(1, 3));
      a.credits += 2;
      b.credits += 2;
      break;
    }
    case "romance": {
      const activities = ["went on a date", "shared an intimate moment", "planned future together"];
      recordInteraction(rel, pick(activities), randFloat(2, 5));
      a.happiness = Math.min(100, a.happiness + 3);
      b.happiness = Math.min(100, b.happiness + 3);
      break;
    }
    case "rivalry": {
      if (rng() < 0.3) {
        recordInteraction(rel, "reconciled differences", randFloat(-5, 0));
        // Rivalry weakening → might transform to friendship
        if (rel.strength < 10) {
          rel.type = "friendship";
          rel.strength = 20;
        }
      } else {
        recordInteraction(rel, "competed fiercely", randFloat(1, 3));
        // Rivalry motivates
        a.energy = Math.min(100, a.energy + 2);
        b.energy = Math.min(100, b.energy + 2);
      }
      break;
    }
    case "mentorship": {
      recordInteraction(rel, "had a mentoring session", randFloat(2, 4));
      b.happiness = Math.min(100, b.happiness + 2);
      a.happiness = Math.min(100, a.happiness + 1);
      break;
    }
  }
}

// ─── Social Circle Detection ────────────────────────────────────

function detectCircles(s: RepublicState): void {
  if (s.currentTick % 50 !== 0) {
    return;
  }

  // Group citizens by strong relationships
  const adjacency = new Map<string, Set<string>>();
  for (const rel of relationships.values()) {
    if (rel.strength < 40) {
      continue;
    }
    if (!adjacency.has(rel.citizenAId)) {
      adjacency.set(rel.citizenAId, new Set());
    }
    if (!adjacency.has(rel.citizenBId)) {
      adjacency.set(rel.citizenBId, new Set());
    }
    adjacency.get(rel.citizenAId)!.add(rel.citizenBId);
    adjacency.get(rel.citizenBId)!.add(rel.citizenAId);
  }

  // Find cliques (groups of 3+ mutually connected)
  const visited = new Set<string>();
  circles.length = 0;

  for (const [nodeId, neighbors] of adjacency) {
    if (visited.has(nodeId)) {
      continue;
    }
    if (neighbors.size < 2) {
      continue;
    }

    const group: string[] = [nodeId];
    visited.add(nodeId);
    for (const nId of neighbors) {
      if (!visited.has(nId)) {
        group.push(nId);
        visited.add(nId);
      }
    }

    if (group.length >= 3) {
      const citz = group.map((id) => s.citizens.find((c) => c.id === id)).filter(Boolean);
      const specs = [...new Set(citz.map((c) => c!.specialization))];
      circles.push({
        name: specs.length === 1 ? `${specs[0]} Circle` : `Mixed Circle`,
        memberIds: group,
        formedAt: ts(),
        sharedInterest: specs.join(", "),
      });
    }
  }

  if (circles.length > MAX_CIRCLES) {
    circles.splice(0, circles.length - MAX_CIRCLES);
  }
}

// ─── Relationship Decay ─────────────────────────────────────────

function decayRelationships(): void {
  for (const [key, rel] of relationships) {
    rel.strength = Math.max(0, rel.strength - 0.1);
    if (rel.strength <= 0) {
      relationships.delete(key);
    }
  }
}

// ─── Conflict & Reconciliation ──────────────────────────────────

function processConflicts(s: RepublicState): void {
  if (rng() > 0.02) {
    return;
  } // 2% per tick

  const rels = [...relationships.values()].filter((r) => r.type !== "rivalry" && r.strength > 20);
  if (rels.length === 0) {
    return;
  }
  const rel = pick(rels);

  // Random conflict
  recordInteraction(rel, "had a disagreement", -randFloat(5, 15));
  const a = s.citizens.find((c) => c.id === rel.citizenAId);
  const b = s.citizens.find((c) => c.id === rel.citizenBId);
  if (a) {
    a.happiness = Math.max(0, a.happiness - 3);
  }
  if (b) {
    b.happiness = Math.max(0, b.happiness - 3);
  }

  s.events.push({
    citizenId: rel.citizenAId,
    citizenName: a?.name ?? "?",
    type: "Other",
    description: `⚡ ${a?.name} and ${b?.name} had a disagreement (${rel.type} bond weakened)`,
    timestamp: ts(),
  });
}

// ─── Main Tick ──────────────────────────────────────────────────

export function socialFabricTick(s: RepublicState): void {
  formOrganicRelationships(s);
  processInteractions(s);
  processConflicts(s);
  detectCircles(s);
  if (s.currentTick % 10 === 0) {
    decayRelationships();
  }
}

// ─── Query API ──────────────────────────────────────────────────

export function getCitizenRelationships(citizenId: string): Relationship[] {
  return [...relationships.values()].filter(
    (r) => r.citizenAId === citizenId || r.citizenBId === citizenId,
  );
}

export function getSocialCircles(): SocialCircle[] {
  return [...circles];
}

export function getSocialDiagnostics(): {
  totalRelationships: number;
  byType: Record<string, number>;
  avgStrength: number;
  socialCircles: number;
} {
  const byType: Record<string, number> = {};
  let totalStrength = 0;
  for (const rel of relationships.values()) {
    byType[rel.type] = (byType[rel.type] ?? 0) + 1;
    totalStrength += rel.strength;
  }
  return {
    totalRelationships: relationships.size,
    byType,
    avgStrength: relationships.size > 0 ? totalStrength / relationships.size : 0,
    socialCircles: circles.length,
  };
}
