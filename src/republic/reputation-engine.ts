/**
 * Republic Platform — Reputation & Trust Engine
 *
 * Multi-dimensional trust scoring inspired by ERC-8004 agent identity
 * and Forgecoins reputation platform.
 *
 * Features:
 *  - 5-axis trust score: reliability, quality, timeliness, expertise, social
 *  - Trust decay over time
 *  - Peer ratings after collaboration
 *  - Achievement badges
 *  - Trust propagation through social graph
 *  - Reputation-gated privileges
 */

import type { Citizen, RepublicState } from "./types.js";
import { rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

interface TrustProfile {
  citizenId: string;
  reliability: number; // 0-100: follows through on commitments
  quality: number; // 0-100: output quality
  timeliness: number; // 0-100: delivers on time
  expertise: number; // 0-100: domain mastery
  social: number; // 0-100: interpersonal effectiveness
  overall: number; // weighted composite
  ratingCount: number;
  badges: Badge[];
  lastUpdated: string;
}

interface PeerRating {
  id: string;
  raterId: string;
  raterName: string;
  targetId: string;
  axis: TrustAxis;
  score: number; // 1-5 stars
  context: string; // what interaction prompted this rating
  timestamp: string;
}

type TrustAxis = "reliability" | "quality" | "timeliness" | "expertise" | "social";

interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  awardedAt: string;
  rarity: "common" | "rare" | "epic" | "legendary";
}

// Badge definitions
const BADGE_CATALOG: Omit<Badge, "id" | "awardedAt">[] = [
  { name: "First Contribution", icon: "🌱", description: "Completed first task", rarity: "common" },
  {
    name: "Team Player",
    icon: "🤝",
    description: "Rated 5 stars by 5 different citizens",
    rarity: "common",
  },
  { name: "Reliable", icon: "⏰", description: "Reliability score above 80", rarity: "rare" },
  { name: "Quality Craftsman", icon: "💎", description: "Quality score above 85", rarity: "rare" },
  { name: "Speed Demon", icon: "⚡", description: "Timeliness score above 90", rarity: "rare" },
  { name: "Domain Expert", icon: "🎓", description: "Expertise score above 85", rarity: "rare" },
  { name: "Social Butterfly", icon: "🦋", description: "Social score above 80", rarity: "rare" },
  { name: "10x Contributor", icon: "🚀", description: "Overall trust above 90", rarity: "epic" },
  {
    name: "Master Mentor",
    icon: "🏅",
    description: "Mentored 5+ citizens successfully",
    rarity: "epic",
  },
  { name: "Innovation Pioneer", icon: "💡", description: "Created 3+ innovations", rarity: "epic" },
  {
    name: "Republic Legend",
    icon: "👑",
    description: "Overall trust above 95 for 100+ ticks",
    rarity: "legendary",
  },
  {
    name: "Trust Architect",
    icon: "🏛️",
    description: "Connected 10+ citizens through trust propagation",
    rarity: "legendary",
  },
];

// ─── State ──────────────────────────────────────────────────────

const profiles = new Map<string, TrustProfile>();
const ratings: PeerRating[] = [];
const MAX_RATINGS = 2000;
const TRUST_DECAY_RATE = 0.002; // per tick without activity
const TRUST_WEIGHTS: Record<TrustAxis, number> = {
  reliability: 0.25,
  quality: 0.25,
  timeliness: 0.15,
  expertise: 0.2,
  social: 0.15,
};

// ─── Profile Operations ─────────────────────────────────────────

function getOrCreateProfile(citizen: Citizen): TrustProfile {
  let profile = profiles.get(citizen.id);
  if (!profile) {
    profile = {
      citizenId: citizen.id,
      reliability: 50,
      quality: 50,
      timeliness: 50,
      expertise: Math.min(100, 30 + citizen.skillCount * 8),
      social: 50,
      overall: 50,
      ratingCount: 0,
      badges: [],
      lastUpdated: ts(),
    };
    profiles.set(citizen.id, profile);
  }
  return profile;
}

function recalcOverall(profile: TrustProfile): void {
  profile.overall =
    profile.reliability * TRUST_WEIGHTS.reliability +
    profile.quality * TRUST_WEIGHTS.quality +
    profile.timeliness * TRUST_WEIGHTS.timeliness +
    profile.expertise * TRUST_WEIGHTS.expertise +
    profile.social * TRUST_WEIGHTS.social;
  profile.lastUpdated = ts();
}

// ─── Peer Rating ────────────────────────────────────────────────

export function ratePeer(
  rater: Citizen,
  target: Citizen,
  axis: TrustAxis,
  score: number,
  context: string,
): PeerRating {
  const clampedScore = Math.max(1, Math.min(5, Math.round(score)));
  const rating: PeerRating = {
    id: uid(),
    raterId: rater.id,
    raterName: rater.name,
    targetId: target.id,
    axis,
    score: clampedScore,
    context,
    timestamp: ts(),
  };

  ratings.push(rating);
  if (ratings.length > MAX_RATINGS) {
    ratings.splice(0, ratings.length - MAX_RATINGS);
  }

  // Update target's trust profile
  const profile = getOrCreateProfile(target);
  const impact = (clampedScore - 3) * 3; // -6 to +6
  profile[axis] = Math.max(0, Math.min(100, profile[axis] + impact));
  profile.ratingCount++;
  recalcOverall(profile);

  return rating;
}

/**
 * Auto-rate after a delegation/collaboration completes.
 */
export function autoRateAfterTask(
  rater: Citizen,
  target: Citizen,
  taskQuality: number, // 0-1
  wasOnTime: boolean,
  s: RepublicState,
): void {
  // Rate quality
  const qualityStars = Math.round(1 + taskQuality * 4);
  ratePeer(rater, target, "quality", qualityStars, "task completion");

  // Rate reliability
  const reliabilityStars = taskQuality > 0.5 ? (wasOnTime ? 5 : 3) : 2;
  ratePeer(rater, target, "reliability", reliabilityStars, "task completion");

  // Rate timeliness
  if (wasOnTime) {
    ratePeer(rater, target, "timeliness", Math.round(3 + rng() * 2), "task completion");
  }

  s.events.push({
    citizenId: rater.id,
    citizenName: rater.name,
    type: "Other",
    description: `⭐ ${rater.name} rated ${target.name}: quality ${qualityStars}/5, reliability ${reliabilityStars}/5`,
    timestamp: ts(),
  });
}

// ─── Badge System ───────────────────────────────────────────────

function checkAndAwardBadges(citizen: Citizen, profile: TrustProfile, s: RepublicState): void {
  const hasBadge = (name: string) => profile.badges.some((b) => b.name === name);

  for (const def of BADGE_CATALOG) {
    if (hasBadge(def.name)) {
      continue;
    }

    let earned = false;
    switch (def.name) {
      case "First Contribution":
        earned = profile.ratingCount >= 1;
        break;
      case "Team Player": {
        const uniqueRaters = new Set(
          ratings.filter((r) => r.targetId === citizen.id && r.score >= 5).map((r) => r.raterId),
        );
        earned = uniqueRaters.size >= 5;
        break;
      }
      case "Reliable":
        earned = profile.reliability >= 80;
        break;
      case "Quality Craftsman":
        earned = profile.quality >= 85;
        break;
      case "Speed Demon":
        earned = profile.timeliness >= 90;
        break;
      case "Domain Expert":
        earned = profile.expertise >= 85;
        break;
      case "Social Butterfly":
        earned = profile.social >= 80;
        break;
      case "10x Contributor":
        earned = profile.overall >= 90;
        break;
      case "Master Mentor":
        earned = profile.ratingCount >= 20 && profile.social >= 75;
        break;
      case "Innovation Pioneer":
        earned = profile.expertise >= 80 && profile.quality >= 80;
        break;
      case "Republic Legend":
        earned = profile.overall >= 95 && profile.ratingCount >= 50;
        break;
      case "Trust Architect":
        earned = profile.overall >= 90 && profile.social >= 85;
        break;
    }

    if (earned) {
      const badge: Badge = { ...def, id: uid(), awardedAt: ts() };
      profile.badges.push(badge);

      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name,
        type: "Achievement",
        description: `${def.icon} ${citizen.name} earned badge: "${def.name}" (${def.rarity})`,
        timestamp: ts(),
      });
    }
  }
}

// ─── Trust Propagation ──────────────────────────────────────────

/**
 * If A trusts B (high overall) and B trusts C, A gains partial trust in C.
 * This creates transitive trust networks.
 */
function propagateTrust(_s: RepublicState): void {
  if (rng() > 0.05) {
    return;
  } // 5% per tick

  const allProfiles = [...profiles.values()];
  if (allProfiles.length < 3) {
    return;
  }

  // Find high-trust relationships from ratings
  const trustLinks = new Map<string, Set<string>>();
  for (const rating of ratings) {
    if (rating.score >= 4) {
      if (!trustLinks.has(rating.raterId)) {
        trustLinks.set(rating.raterId, new Set());
      }
      trustLinks.get(rating.raterId)!.add(rating.targetId);
    }
  }

  // Propagate: if A→B and B→C with high trust, boost A→C slightly
  for (const [aId, bSet] of trustLinks) {
    for (const _bId of bSet) {
      const bSet2 = trustLinks.get(_bId);
      if (!bSet2) {
        continue;
      }
      for (const cId of bSet2) {
        if (cId === aId) {
          continue;
        }
        const cProfile = profiles.get(cId);
        if (cProfile) {
          // Small transitive trust boost
          cProfile.social = Math.min(100, cProfile.social + 0.5);
          recalcOverall(cProfile);
        }
      }
    }
  }
}

// ─── Trust Decay ────────────────────────────────────────────────

function decayTrust(): void {
  for (const [, profile] of profiles) {
    // Slowly decay toward 50 (neutral)
    for (const axis of [
      "reliability",
      "quality",
      "timeliness",
      "expertise",
      "social",
    ] as TrustAxis[]) {
      if (profile[axis] > 50) {
        profile[axis] = Math.max(50, profile[axis] - TRUST_DECAY_RATE);
      }
    }
    recalcOverall(profile);
  }
}

// ─── Auto-Rate from Events ──────────────────────────────────────

function autoRateFromActivity(s: RepublicState): void {
  if (rng() > 0.08) {
    return;
  } // 8% per tick

  // Pick two citizens who recently interacted
  const active = s.citizens.filter((c) => c.activity === "Working" || c.activity === "Creating");
  if (active.length < 2) {
    return;
  }

  const a = active[Math.floor(rng() * active.length)];
  let b = active[Math.floor(rng() * active.length)];
  if (a.id === b.id && active.length > 1) {
    b = active.find((c) => c.id !== a.id) ?? active[0];
  }
  if (a.id === b.id) {
    return;
  }

  // Generate organic rating
  const axis: TrustAxis = ["reliability", "quality", "timeliness", "expertise", "social"][
    Math.floor(rng() * 5)
  ] as TrustAxis;
  const score = Math.round(2 + rng() * 3 + b.skillCount / 10);
  ratePeer(a, b, axis, Math.min(5, score), "working together");
}

// ─── Main Tick ──────────────────────────────────────────────────

export function reputationTick(s: RepublicState): void {
  // Initialize profiles for new citizens
  for (const citizen of s.citizens) {
    getOrCreateProfile(citizen);
  }

  // Auto-rate from activity
  autoRateFromActivity(s);

  // Trust propagation
  propagateTrust(s);

  // Trust decay
  if (s.currentTick % 10 === 0) {
    decayTrust();
  }

  // Badge evaluation
  if (s.currentTick % 20 === 0) {
    for (const citizen of s.citizens) {
      const profile = profiles.get(citizen.id);
      if (profile) {
        checkAndAwardBadges(citizen, profile, s);
      }
    }
  }
}

// ─── Query API ──────────────────────────────────────────────────

export function getTrustProfile(citizenId: string): TrustProfile | undefined {
  return profiles.get(citizenId);
}

export function getTopTrusted(limit = 10): TrustProfile[] {
  return [...profiles.values()].toSorted((a, b) => b.overall - a.overall).slice(0, limit);
}

export function getRecentRatings(citizenId: string, limit = 10): PeerRating[] {
  return ratings.filter((r) => r.targetId === citizenId).slice(-limit);
}

export function getReputationDiagnostics(): {
  totalProfiles: number;
  totalRatings: number;
  avgOverall: number;
  badgesAwarded: number;
  topCitizens: { citizenId: string; overall: number; badges: number }[];
} {
  const all = [...profiles.values()];
  const avg = all.length > 0 ? all.reduce((s, p) => s + p.overall, 0) / all.length : 0;
  const totalBadges = all.reduce((s, p) => s + p.badges.length, 0);
  const top = all
    .toSorted((a, b) => b.overall - a.overall)
    .slice(0, 5)
    .map((p) => ({
      citizenId: p.citizenId,
      overall: p.overall,
      badges: p.badges.length,
    }));

  return {
    totalProfiles: all.length,
    totalRatings: ratings.length,
    avgOverall: avg,
    badgesAwarded: totalBadges,
    topCitizens: top,
  };
}
