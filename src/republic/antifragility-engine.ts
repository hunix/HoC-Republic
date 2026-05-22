/**
 * Republic Platform — Antifragility Engine
 *
 * The Republic grows stronger from stress, not just survives it:
 *  - Controlled chaos injection (resource shortages, communication failures)
 *  - Stress response tracking (fragile, robust, antifragile classification)
 *  - Adaptive hardening (permanent resilience bonuses from surviving chaos)
 *  - Innovation under pressure (stressed citizens innovate more)
 *  - Redundancy evolution (auto-generate backup strategies from failures)
 *  - Civilization-wide antifragility score
 *
 * Based on Nassim Taleb's antifragility principles applied to
 * AI agent societies and 2025 chaos engineering for AI research.
 */

import type { Citizen, RepublicState } from "./types.js";
import { pick, randFloat, rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

type ChaosType =
  | "resource-shortage"
  | "communication-failure"
  | "leader-absence"
  | "market-crash"
  | "knowledge-corruption"
  | "energy-blackout"
  | "trust-crisis"
  | "innovation-drought";

type ResilienceClass = "fragile" | "robust" | "antifragile";

interface ChaosEvent {
  id: string;
  type: ChaosType;
  severity: number; // 1–10
  description: string;
  affectedCitizenIds: string[];
  responseSummary: string;
  startTick: number;
  resolved: boolean;
  ticksToResolve: number;
}

interface StressResponse {
  citizenId: string;
  chaosEventsExperienced: number;
  chaosEventsSurvived: number;
  resilienceClass: ResilienceClass;
  hardeningBonuses: string[];
  innovationsUnderStress: number;
  recoverySpeed: number; // ticks to recover (lower = better)
}

interface RedundancyPlan {
  id: string;
  name: string;
  triggerCondition: string;
  fallbackAction: string;
  discoveredFromFailure: string;
  effectiveness: number; // 0–1
  createdAt: string;
}

// ─── State ──────────────────────────────────────────────────────

const chaosLog: ChaosEvent[] = [];
const stressProfiles = new Map<string, StressResponse>();
const redundancyPlans: RedundancyPlan[] = [];
const MAX_CHAOS = 50;
const MAX_PLANS = 30;
let civilizationAntifragilityScore = 50; // 0–100

// ─── Chaos Injection ────────────────────────────────────────────

const CHAOS_TEMPLATES: { type: ChaosType; desc: string; severity: [number, number] }[] = [
  {
    type: "resource-shortage",
    desc: "Critical resource supply drops unexpectedly",
    severity: [3, 7],
  },
  {
    type: "communication-failure",
    desc: "Inter-citizen communication channels experience disruption",
    severity: [2, 5],
  },
  {
    type: "leader-absence",
    desc: "A key leader becomes temporarily unavailable",
    severity: [3, 6],
  },
  { type: "market-crash", desc: "Market values plummet across all sectors", severity: [5, 9] },
  {
    type: "knowledge-corruption",
    desc: "Part of the knowledge graph becomes unreliable",
    severity: [4, 7],
  },
  {
    type: "energy-blackout",
    desc: "Energy supply fluctuates, affecting productivity",
    severity: [3, 6],
  },
  { type: "trust-crisis", desc: "A scandal erodes trust between citizen groups", severity: [4, 8] },
  {
    type: "innovation-drought",
    desc: "Creative and research output stalls unexpectedly",
    severity: [2, 5],
  },
];

function injectChaos(s: RepublicState): void {
  // 1.5% chance per tick — controlled disruption
  if (rng() > 0.015) {
    return;
  }

  // Don't stack too many active crises
  const activeCrises = chaosLog.filter((c) => !c.resolved);
  if (activeCrises.length >= 3) {
    return;
  }

  const template = pick(CHAOS_TEMPLATES);
  const severity = Math.floor(randFloat(template.severity[0], template.severity[1]));

  // Affect a portion of citizens based on severity
  const affectRatio = severity / 20; // 5% at sev 1, 50% at sev 10
  const affected = s.citizens.filter(() => rng() < affectRatio);
  if (affected.length === 0) {
    return;
  }

  const chaos: ChaosEvent = {
    id: uid(),
    type: template.type,
    severity,
    description: template.desc,
    affectedCitizenIds: affected.map((c) => c.id),
    responseSummary: "",
    startTick: s.currentTick,
    resolved: false,
    ticksToResolve: 0,
  };

  chaosLog.push(chaos);
  if (chaosLog.length > MAX_CHAOS) {
    chaosLog.shift();
  }

  s.events.push({
    citizenId: "",
    citizenName: "Republic",
    type: "Crisis",
    description: `🌪️ CHAOS EVENT: ${template.desc} (severity: ${severity}/10, affecting ${affected.length} citizens)`,
    timestamp: ts(),
  });

  // Apply stress to affected citizens
  for (const citizen of affected) {
    applyStress(citizen, chaos, s);
  }
}

// ─── Stress Response ────────────────────────────────────────────

function getOrCreateProfile(citizenId: string): StressResponse {
  let profile = stressProfiles.get(citizenId);
  if (!profile) {
    profile = {
      citizenId,
      chaosEventsExperienced: 0,
      chaosEventsSurvived: 0,
      resilienceClass: "robust",
      hardeningBonuses: [],
      innovationsUnderStress: 0,
      recoverySpeed: 20 + Math.floor(rng() * 30),
    };
    stressProfiles.set(citizenId, profile);
  }
  return profile;
}

function applyStress(citizen: Citizen, chaos: ChaosEvent, s: RepublicState): void {
  const profile = getOrCreateProfile(citizen.id);
  profile.chaosEventsExperienced++;

  // Response depends on resilience class
  const survivalChance =
    profile.resilienceClass === "antifragile"
      ? 0.9
      : profile.resilienceClass === "robust"
        ? 0.7
        : 0.4;

  if (rng() < survivalChance) {
    profile.chaosEventsSurvived++;

    // Innovation under pressure: stressed citizens have 30% higher innovation rate
    if (rng() < 0.3) {
      profile.innovationsUnderStress++;
      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name,
        type: "Innovation",
        description: `💡 ${citizen.name} innovated under pressure during ${chaos.type} — necessity drives invention!`,
        timestamp: ts(),
      });
    }

    // Adaptive hardening: gain permanent bonuses
    if (profile.chaosEventsSurvived % 3 === 0 && profile.hardeningBonuses.length < 5) {
      const bonuses = [
        "stress-resilience",
        "quick-recovery",
        "creative-under-pressure",
        "leadership-in-crisis",
        "resourcefulness",
        "emotional-stability",
        "strategic-thinking",
        "team-rallying",
      ];
      const bonus = pick(bonuses.filter((b) => !profile.hardeningBonuses.includes(b)));
      if (bonus) {
        profile.hardeningBonuses.push(bonus);
        s.events.push({
          citizenId: citizen.id,
          citizenName: citizen.name,
          type: "Growth",
          description: `🛡️ ${citizen.name} gained permanent hardening bonus: "${bonus}" from surviving chaos`,
          timestamp: ts(),
        });
      }
    }
  }

  // Update resilience classification
  const survivalRate =
    profile.chaosEventsExperienced > 0
      ? profile.chaosEventsSurvived / profile.chaosEventsExperienced
      : 0.5;

  if (survivalRate > 0.8 && profile.innovationsUnderStress > 2) {
    profile.resilienceClass = "antifragile";
  } else if (survivalRate > 0.6) {
    profile.resilienceClass = "robust";
  } else {
    profile.resilienceClass = "fragile";
  }

  // Recovery speed improves with experience
  profile.recoverySpeed = Math.max(5, profile.recoverySpeed - Math.floor(rng() * 3));
}

// ─── Chaos Resolution ───────────────────────────────────────────

function resolveEvents(s: RepublicState): void {
  for (const chaos of chaosLog) {
    if (chaos.resolved) {
      continue;
    }

    const elapsed = s.currentTick - chaos.startTick;
    const avgRecoverySpeed =
      chaos.affectedCitizenIds.length > 0
        ? chaos.affectedCitizenIds.reduce((sum, id) => {
            const profile = stressProfiles.get(id);
            return sum + (profile?.recoverySpeed ?? 25);
          }, 0) / chaos.affectedCitizenIds.length
        : 25;

    // Resolution depends on severity and citizen resilience
    if (elapsed > avgRecoverySpeed - chaos.severity) {
      chaos.resolved = true;
      chaos.ticksToResolve = elapsed;

      const responses = [
        "citizens adapted and found creative workarounds",
        "collective problem-solving resolved the issue",
        "redundancy plans kicked in automatically",
        "leaders stepped up and coordinated the response",
        "the community rallied together to overcome the challenge",
      ];
      chaos.responseSummary = pick(responses);

      s.events.push({
        citizenId: "",
        citizenName: "Republic",
        type: "Recovery",
        description: `✅ Crisis resolved: "${chaos.description}" after ${elapsed} ticks — ${chaos.responseSummary}`,
        timestamp: ts(),
      });

      // Generate redundancy plan from experience
      generateRedundancyPlan(chaos);
    }
  }
}

// ─── Redundancy Evolution ───────────────────────────────────────

function generateRedundancyPlan(chaos: ChaosEvent): void {
  if (redundancyPlans.length >= MAX_PLANS) {
    // Replace least effective plan
    const weakIdx = redundancyPlans.reduce(
      (minIdx, p, i, arr) => (p.effectiveness < arr[minIdx].effectiveness ? i : minIdx),
      0,
    );
    redundancyPlans.splice(weakIdx, 1);
  }

  const plan: RedundancyPlan = {
    id: uid(),
    name: `${chaos.type}-recovery-protocol`,
    triggerCondition: `When ${chaos.type} is detected`,
    fallbackAction: chaos.responseSummary || "Activate emergency response",
    discoveredFromFailure: chaos.description,
    effectiveness: Math.min(1, 0.5 + (1 / Math.max(1, chaos.ticksToResolve)) * 10),
    createdAt: ts(),
  };

  redundancyPlans.push(plan);
}

// ─── Antifragility Score ────────────────────────────────────────

function updateAntifragilityScore(s: RepublicState): void {
  if (s.currentTick % 50 !== 0) {
    return;
  }

  const profiles = [...stressProfiles.values()];
  if (profiles.length === 0) {
    return;
  }

  // Components:
  const antifragileRatio =
    profiles.filter((p) => p.resilienceClass === "antifragile").length / profiles.length;
  const avgInnovation =
    profiles.reduce((sum, p) => sum + p.innovationsUnderStress, 0) / profiles.length;
  const planEffectiveness =
    redundancyPlans.length > 0
      ? redundancyPlans.reduce((sum, p) => sum + p.effectiveness, 0) / redundancyPlans.length
      : 0;
  const resolvedRate =
    chaosLog.length > 0 ? chaosLog.filter((c) => c.resolved).length / chaosLog.length : 0.5;

  civilizationAntifragilityScore = Math.round(
    antifragileRatio * 30 +
      Math.min(avgInnovation / 5, 1) * 20 +
      planEffectiveness * 25 +
      resolvedRate * 25,
  );

  civilizationAntifragilityScore = Math.max(0, Math.min(100, civilizationAntifragilityScore));
}

// ─── Main Tick ──────────────────────────────────────────────────

export function antifragilityTick(s: RepublicState): void {
  // 12% chance per tick
  if (rng() > 0.12) {
    return;
  }

  injectChaos(s);
  resolveEvents(s);
  updateAntifragilityScore(s);
}

// ─── Query API ──────────────────────────────────────────────────

export function getAntifragilityScore(): number {
  return civilizationAntifragilityScore;
}

export function getActiveCrises(): ChaosEvent[] {
  return chaosLog.filter((c) => !c.resolved);
}

export function getRedundancyPlans(): RedundancyPlan[] {
  return [...redundancyPlans];
}

export function getCitizenResilience(citizenId: string): StressResponse | undefined {
  return stressProfiles.get(citizenId);
}

export function getAntifragilityDiagnostics(): {
  antifragilityScore: number;
  activeCrises: number;
  resolvedCrises: number;
  redundancyPlans: number;
  citizensTracked: number;
  resilienceBreakdown: Record<ResilienceClass, number>;
  avgRecoverySpeed: number;
  totalInnovationsUnderStress: number;
} {
  const profiles = [...stressProfiles.values()];
  const breakdown: Record<ResilienceClass, number> = { fragile: 0, robust: 0, antifragile: 0 };
  let totalRecovery = 0;
  let totalInnovations = 0;

  for (const p of profiles) {
    breakdown[p.resilienceClass]++;
    totalRecovery += p.recoverySpeed;
    totalInnovations += p.innovationsUnderStress;
  }

  return {
    antifragilityScore: civilizationAntifragilityScore,
    activeCrises: chaosLog.filter((c) => !c.resolved).length,
    resolvedCrises: chaosLog.filter((c) => c.resolved).length,
    redundancyPlans: redundancyPlans.length,
    citizensTracked: profiles.length,
    resilienceBreakdown: breakdown,
    avgRecoverySpeed: profiles.length > 0 ? totalRecovery / profiles.length : 0,
    totalInnovationsUnderStress: totalInnovations,
  };
}
